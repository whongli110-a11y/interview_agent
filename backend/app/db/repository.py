"""
SQLite 数据访问层（Repository Pattern）。

所有数据库操作都通过此模块进行，上层业务代码不直接操作 sqlite3。

表结构：
  - documents          文档元数据（上传、解析状态等）
  - document_chunks    文档分块（文本内容 + 向量 ID）
  - interview_sessions 面试会话（配置、状态、当前题目、面试计划）
  - interview_turns    每轮问答记录（问题、回答、评估结果）
  - interview_reports  面试结束后生成的综合报告
"""

from __future__ import annotations

import json
import logging
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def utc_now() -> str:
    """返回当前 UTC 时间的 ISO 8601 字符串，用于统一所有时间戳格式。"""
    return datetime.now(timezone.utc).isoformat()


class Repository:
    """SQLite 数据仓库，封装所有 CRUD 操作。

    每次操作均通过 connect() 上下文管理器获取连接，操作完成后自动提交并关闭连接，
    避免长事务阻塞。在更高并发场景下可考虑替换为连接池（如 aiosqlite）。
    """

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.init_db()

    @contextmanager
    def connect(self):
        """获取 SQLite 连接的上下文管理器，自动提交和关闭。"""
        conn = sqlite3.connect(self.db_path)
        # 将行结果转为字典式访问（通过列名索引）
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def init_db(self) -> None:
        """初始化数据库：创建所有表和索引，并对已有表执行增量迁移。

        幂等性保证：所有 CREATE 语句均使用 IF NOT EXISTS，
        ALTER TABLE 若列已存在则静默忽略（内联迁移策略）。
        """
        with self.connect() as conn:
            conn.executescript(
                """
                -- ── 文档元数据表 ────────────────────────────────────────────────
                CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    source_type TEXT NOT NULL,           -- resume | jd | project | other
                    file_path TEXT NOT NULL,             -- 原始上传文件绝对路径
                    raw_text_path TEXT,                  -- 解析后纯文本绝对路径
                    parse_status TEXT NOT NULL,          -- pending | processing | completed | failed
                    parse_error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                -- ── 文档分块表 ──────────────────────────────────────────────────
                -- 与向量存储（ChromaDB）中的条目一一对应，vector_id = chunk id
                CREATE TABLE IF NOT EXISTS document_chunks (
                    id TEXT PRIMARY KEY,
                    document_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    chunk_index INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    metadata TEXT NOT NULL,              -- JSON 序列化的额外元数据
                    vector_id TEXT,                      -- ChromaDB 中的条目 ID
                    created_at TEXT NOT NULL
                );

                -- ── 面试会话表 ──────────────────────────────────────────────────
                CREATE TABLE IF NOT EXISTS interview_sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    thread_id TEXT NOT NULL,             -- LangGraph checkpoint thread id
                    mode TEXT NOT NULL,                  -- technical | behavioral | mixed
                    role_direction TEXT NOT NULL,        -- 目标岗位方向描述
                    difficulty TEXT NOT NULL,            -- basic | medium | hard
                    duration_minutes INTEGER NOT NULL,
                    status TEXT NOT NULL,                -- created | waiting_user | completed
                    current_question_index INTEGER NOT NULL,
                    max_questions INTEGER NOT NULL,
                    enable_follow_up INTEGER NOT NULL,   -- 0/1 布尔值（SQLite 无 BOOLEAN 类型）
                    current_question TEXT,               -- JSON 序列化的当前题目
                    interview_plan TEXT,                 -- JSON 序列化的面试计划列表（持久化避免重建）
                    final_report_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                -- ── 面试轮次表 ──────────────────────────────────────────────────
                CREATE TABLE IF NOT EXISTS interview_turns (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    turn_index INTEGER NOT NULL,
                    question TEXT NOT NULL,
                    question_type TEXT NOT NULL,
                    answer TEXT,
                    evaluation TEXT,                     -- JSON 序列化的评估结果
                    retrieved_context_ids TEXT NOT NULL, -- JSON 序列化的 chunk id 列表
                    created_at TEXT NOT NULL
                );

                -- ── 面试报告表 ──────────────────────────────────────────────────
                CREATE TABLE IF NOT EXISTS interview_reports (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    total_score INTEGER NOT NULL,
                    dimension_scores TEXT NOT NULL,      -- JSON
                    question_reviews TEXT NOT NULL,      -- JSON
                    resume_suggestions TEXT NOT NULL,    -- JSON
                    next_training_plan TEXT NOT NULL,    -- JSON
                    created_at TEXT NOT NULL
                );

                -- ── 性能索引 ────────────────────────────────────────────────────
                -- 按 document_id 查询分块（解析、删除时高频）
                CREATE INDEX IF NOT EXISTS idx_chunks_document_id
                    ON document_chunks(document_id);
                -- 按 user_id 隔离用户数据
                CREATE INDEX IF NOT EXISTS idx_chunks_user_id
                    ON document_chunks(user_id);
                CREATE INDEX IF NOT EXISTS idx_documents_user_id
                    ON documents(user_id);
                CREATE INDEX IF NOT EXISTS idx_sessions_user_id
                    ON interview_sessions(user_id);
                -- 按 session_id 查询轮次 / 报告（面试过程中高频）
                CREATE INDEX IF NOT EXISTS idx_turns_session_id
                    ON interview_turns(session_id);
                CREATE INDEX IF NOT EXISTS idx_reports_session_id
                    ON interview_reports(session_id);
                """
            )

            # ── 内联增量迁移 ─────────────────────────────────────────────────
            # 为已有的旧数据库添加 interview_plan 列（若列已存在则静默忽略）
            try:
                conn.execute("ALTER TABLE interview_sessions ADD COLUMN interview_plan TEXT")
                conn.commit()
                logger.info("数据库迁移：interview_sessions 表新增 interview_plan 列")
            except sqlite3.OperationalError:
                pass  # 列已存在，无需迁移

    # ── Documents ─────────────────────────────────────────────────────────────

    def insert_document(self, row: dict[str, Any]) -> None:
        """插入新的文档元数据记录。"""
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO documents VALUES
                (:id, :user_id, :filename, :source_type, :file_path, :raw_text_path,
                 :parse_status, :parse_error, :created_at, :updated_at)
                """,
                row,
            )

    def update_document(self, document_id: str, **fields: Any) -> None:
        """动态更新文档的指定字段，自动设置 updated_at。"""
        fields["updated_at"] = utc_now()
        # 使用命名占位符动态拼接 SET 子句（字段名均来自内部代码，无 SQL 注入风险）
        assignments = ", ".join(f"{key}=:{key}" for key in fields)
        fields["id"] = document_id
        with self.connect() as conn:
            conn.execute(f"UPDATE documents SET {assignments} WHERE id=:id", fields)

    def get_document(self, document_id: str) -> dict[str, Any] | None:
        """按 ID 查询单条文档，不存在返回 None。"""
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM documents WHERE id=?", (document_id,)).fetchone()
            return dict(row) if row else None

    def list_documents(self, user_id: str) -> list[dict[str, Any]]:
        """列出指定用户的所有文档，按创建时间降序排列。"""
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM documents WHERE user_id=? ORDER BY created_at DESC",
                (user_id,),
            ).fetchall()
            return [dict(row) for row in rows]

    def delete_document(self, document_id: str) -> None:
        """删除文档及其所有分块记录（级联删除）。

        注意：ChromaDB 中对应的向量条目需由调用方（KnowledgeService）单独删除。
        """
        with self.connect() as conn:
            conn.execute("DELETE FROM document_chunks WHERE document_id=?", (document_id,))
            conn.execute("DELETE FROM documents WHERE id=?", (document_id,))

    def list_chunks(self, document_id: str, limit: int = 50) -> list[dict[str, Any]]:
        """列出指定文档的所有分块，按 chunk_index 升序返回，最多 limit 条。"""
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM document_chunks WHERE document_id=? ORDER BY chunk_index LIMIT ?",
                (document_id, limit),
            ).fetchall()
            return [dict(row) for row in rows]

    def replace_chunks(self, document_id: str, chunks: list[dict[str, Any]]) -> None:
        """用新分块列表替换指定文档的所有旧分块（先全删后批量插入）。

        在文档重新解析（re-parse）时调用，确保分块数据与向量存储保持同步。
        """
        with self.connect() as conn:
            conn.execute("DELETE FROM document_chunks WHERE document_id=?", (document_id,))
            conn.executemany(
                """
                INSERT INTO document_chunks VALUES
                (:id, :document_id, :user_id, :source_type, :chunk_index, :content,
                 :metadata, :vector_id, :created_at)
                """,
                [
                    {
                        **chunk,
                        # metadata 在 DB 中以 JSON 字符串存储
                        "metadata": json.dumps(chunk["metadata"], ensure_ascii=False),
                    }
                    for chunk in chunks
                ],
            )

    # ── Interview Sessions ────────────────────────────────────────────────────

    def insert_session(self, row: dict[str, Any]) -> None:
        """插入新的面试会话记录。row 中需包含 interview_plan 字段（可为 None）。"""
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO interview_sessions VALUES
                (:id, :user_id, :thread_id, :mode, :role_direction, :difficulty,
                 :duration_minutes, :status, :current_question_index, :max_questions,
                 :enable_follow_up, :current_question, :interview_plan, :final_report_id,
                 :created_at, :updated_at)
                """,
                row,
            )

    def update_session(self, session_id: str, **fields: Any) -> None:
        """动态更新面试会话的指定字段，自动设置 updated_at。"""
        fields["updated_at"] = utc_now()
        assignments = ", ".join(f"{key}=:{key}" for key in fields)
        fields["id"] = session_id
        with self.connect() as conn:
            conn.execute(f"UPDATE interview_sessions SET {assignments} WHERE id=:id", fields)

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        """按 ID 查询单个面试会话，不存在返回 None。"""
        with self.connect() as conn:
            row = conn.execute(
                "SELECT * FROM interview_sessions WHERE id=?", (session_id,)
            ).fetchone()
            return dict(row) if row else None

    # ── Interview Turns ───────────────────────────────────────────────────────

    def insert_turn(self, row: dict[str, Any]) -> None:
        """插入单轮问答记录。"""
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO interview_turns VALUES
                (:id, :session_id, :turn_index, :question, :question_type, :answer,
                 :evaluation, :retrieved_context_ids, :created_at)
                """,
                row,
            )

    def list_turns(self, session_id: str) -> list[dict[str, Any]]:
        """列出指定会话的所有轮次，按 turn_index 升序排列（还原对话顺序）。"""
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM interview_turns WHERE session_id=? ORDER BY turn_index",
                (session_id,),
            ).fetchall()
            return [dict(row) for row in rows]

    # ── Interview Reports ─────────────────────────────────────────────────────

    def insert_report(self, row: dict[str, Any]) -> None:
        """插入面试报告。一个 session 理论上只有一份报告，但允许重新生成。"""
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO interview_reports VALUES
                (:id, :session_id, :total_score, :dimension_scores, :question_reviews,
                 :resume_suggestions, :next_training_plan, :created_at)
                """,
                row,
            )

    def get_report_by_session(self, session_id: str) -> dict[str, Any] | None:
        """按 session_id 获取最新一份报告，不存在返回 None。"""
        with self.connect() as conn:
            row = conn.execute(
                "SELECT * FROM interview_reports WHERE session_id=? ORDER BY created_at DESC LIMIT 1",
                (session_id,),
            ).fetchone()
            return dict(row) if row else None
