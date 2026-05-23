"""
面试 Agent 状态定义（InterviewState）。

InterviewState 是在各节点之间传递的共享上下文字典，
使用 TypedDict 提供类型提示（total=False 表示所有字段都是可选的，
节点只需修改/添加自己负责的字段）。

字段分组说明：
  ── 会话配置（create_interview 时写入，之后只读）
  ── 候选人画像（profile_analysis_node 写入）
  ── 面试计划（interview_plan_node 写入）
  ── 当前轮次（每轮对话更新）
  ── 检索上下文（knowledge_retrieval_node 写入）
  ── 对话历史（answer_evaluation_node 累积）
  ── 流程控制（各节点读写的布尔标志）
"""

from __future__ import annotations

from typing import Literal, Optional, TypedDict


class InterviewState(TypedDict, total=False):
    # ── 会话配置 ─────────────────────────────────────────────────────────────
    user_id: str
    session_id: str
    thread_id: str                                          # LangGraph checkpoint thread id
    mode: Literal["technical", "behavioral", "mixed"]       # 面试模式
    role_direction: str                                     # 目标岗位方向（自由文本）
    difficulty: Literal["basic", "medium", "hard"]          # 难度档位
    duration_minutes: int
    max_questions: int
    enable_follow_up: bool                                  # 是否启用追问

    # ── 候选人画像（profile_analysis_node 填充）──────────────────────────────
    resume_profile: dict    # {"summary": str, "chunk_ids": list[str]}
    jd_profile: dict        # {"summary": str, "chunk_ids": list[str]}

    # ── 面试计划（interview_plan_node 填充，持久化到 DB）─────────────────────
    interview_plan: list[dict]  # [{"question_type", "intent", "query"}, ...]

    # ── 当前轮次状态 ─────────────────────────────────────────────────────────
    current_question: Optional[dict]   # 当前题目对象（含 content、type、expected_points）
    current_question_index: int     # 当前题目序号（0-based）
    follow_up_count: int            # 当前题目的追问次数（最多 2 次）

    # ── 知识检索结果（knowledge_retrieval_node 填充）─────────────────────────
    retrieved_context: list[dict]   # 从 ChromaDB 检索到的相关分块列表

    # ── 对话历史（answer_evaluation_node 累积）───────────────────────────────
    transcript: list[dict]          # 完整问答记录，用于最终报告生成
    evaluation_notes: list[dict]    # 每轮的评估结果，与 transcript 等长
    last_user_answer: Optional[str]    # 最新一次用户回答
    last_evaluation: Optional[dict]    # 最新一次评估结果

    # ── 流程控制标志 ─────────────────────────────────────────────────────────
    should_follow_up: bool  # True 时 decide_after_evaluation 返回 "follow_up"
    should_finish: bool     # 保留字段（当前由 decide_after_evaluation 逻辑判断）
    final_report: Optional[dict]       # report_generation_node 生成后写入
    status: str                     # created | waiting_user | completed
