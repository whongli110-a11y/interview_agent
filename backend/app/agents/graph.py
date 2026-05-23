"""
面试 Agent 运行时（InterviewRuntime）。

核心职责：
  1. create_interview  — 创建会话、执行初始化节点链、生成第一道题并等待用户回答
  2. submit_answer     — 接收用户回答、评估、决策下一步（追问/下一题/生成报告）

面试状态机流转：
  created → waiting_user ⟷ waiting_user → completed

关键设计决策：
  - interview_plan 在 create_interview 时持久化到数据库（interview_sessions.interview_plan 列），
    submit_answer 直接从库中读取，不再在运行时动态重建，彻底消除了
    因 asyncio 事件循环检测逻辑引发的 Bug（旧代码中 _rebuild_plan 始终走 fallback 分支）。
  - LangGraph 的 StateGraph 拓扑保留用于文档说明和未来迁移，
    当前实现直接调用各节点函数以保持代码可读性。
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from app.agents.nodes import (
    answer_evaluation_node,
    decide_after_evaluation,
    interview_plan_node,
    knowledge_retrieval_node,
    profile_analysis_node,
    question_generation_node,
    report_generation_node,
)
from app.agents.state import InterviewState
from app.core.config import Settings
from app.db.repository import Repository, utc_now
from app.schemas.interview import CreateInterviewRequest
from app.services.knowledge_service import KnowledgeService
from app.services.llm_provider import LLMProvider

try:
    from langsmith import traceable
except ImportError:
    def traceable(**_kw):  # type: ignore[misc]
        def _d(fn):
            return fn
        return _d


def build_langgraph():
    """构建 LangGraph StateGraph 拓扑（仅用于结构文档和未来迁移）。

    当前所有节点均以 identity lambda 占位，实际业务逻辑由 InterviewRuntime 直接调用。
    未来可替换为真正的节点函数，并使用 LangGraph interrupt / Command(resume=...) 实现
    跨 HTTP 请求的有状态流程，搭配 langgraph-checkpoint-sqlite 持久化 checkpoint。
    """
    try:
        from langgraph.graph import END, START, StateGraph
    except ImportError:
        return None

    graph = StateGraph(InterviewState)
    # 以下节点均为占位（lambda state: state），拓扑结构与实际业务流程一致
    graph.add_node("profile_analysis_node", lambda state: state)
    graph.add_node("interview_plan_node", lambda state: state)
    graph.add_node("knowledge_retrieval_node", lambda state: state)
    graph.add_node("question_generation_node", lambda state: state)
    graph.add_node("answer_evaluation_node", lambda state: state)
    graph.add_node("report_generation_node", lambda state: state)
    graph.add_edge(START, "profile_analysis_node")
    graph.add_edge("profile_analysis_node", "interview_plan_node")
    graph.add_edge("interview_plan_node", "knowledge_retrieval_node")
    graph.add_edge("knowledge_retrieval_node", "question_generation_node")
    graph.add_edge("question_generation_node", "answer_evaluation_node")
    graph.add_conditional_edges(
        "answer_evaluation_node",
        decide_after_evaluation,
        {
            "follow_up": "knowledge_retrieval_node",
            "next_question": "knowledge_retrieval_node",
            "finish": "report_generation_node",
        },
    )
    graph.add_edge("report_generation_node", END)
    return graph


def _make_default_plan(session: dict[str, Any]) -> list[dict[str, Any]]:
    """根据 session 配置生成默认面试计划（用于旧数据的兜底，新会话不走此路径）。

    按照 interview_plan_node 的同等逻辑生成，避免 asyncio 调用。
    """
    base_plan = [
        {"question_type": "project", "intent": "考察项目背景、个人职责和工程结果", "query": "最能体现工程能力的项目"},
        {"question_type": "technical", "intent": "考察技术选型和实现细节", "query": "项目 技术选型 架构 LangGraph RAG"},
        {"question_type": "technical", "intent": "考察边界情况和失败处理", "query": "异常处理 文件解析失败 模型调用失败"},
        {"question_type": "behavioral", "intent": "考察沟通协作和复盘能力", "query": "团队协作 沟通 压力 复盘"},
        {"question_type": "job_fit", "intent": "考察岗位匹配度", "query": session["role_direction"] + " 岗位匹配"},
    ]
    mode = session.get("mode", "mixed")
    if mode == "technical":
        plan = [item for item in base_plan if item["question_type"] in {"project", "technical", "job_fit"}]
    elif mode == "behavioral":
        plan = [item for item in base_plan if item["question_type"] in {"behavioral", "job_fit", "project"}]
    else:
        plan = base_plan
    max_q = session.get("max_questions", 5)
    while len(plan) < max_q:
        plan.extend(base_plan)
    return plan[:max_q]


class InterviewRuntime:
    """面试 Agent 运行时，负责协调各节点函数和数据库操作。"""

    def __init__(
        self,
        repo: Repository,
        knowledge_service: KnowledgeService,
        llm: LLMProvider,
        settings: Settings,
    ) -> None:
        self.repo = repo
        self.knowledge = knowledge_service
        self.llm = llm
        self.settings = settings
        # 保留 LangGraph 拓扑引用，用于文档说明
        self.langgraph_topology = build_langgraph()

    @traceable(run_type="chain", name="create_interview")
    async def create_interview(self, request: CreateInterviewRequest) -> dict[str, Any]:
        """创建新的面试会话，执行初始化节点链，返回第一道题。

        执行顺序：
          1. 插入 session 记录（status=created）
          2. profile_analysis_node  — 从知识库检索简历/JD 摘要
          3. interview_plan_node    — 生成面试计划并持久化到数据库
          4. knowledge_retrieval_node — 为第一题检索相关上下文
          5. question_generation_node — 生成第一道题
          6. 更新 session（status=waiting_user，记录当前题目）

        Returns:
            {"session_id": ..., "status": "waiting_user", "question": {...}}
        """
        session_id = f"interview_{uuid.uuid4().hex}"
        thread_id = f"thread_{session_id}"
        now = utc_now()

        # 初始插入时 interview_plan 为 None，下方生成计划后再更新
        self.repo.insert_session(
            {
                "id": session_id,
                "user_id": request.user_id,
                "thread_id": thread_id,
                "mode": request.mode,
                "role_direction": request.role_direction,
                "difficulty": request.difficulty,
                "duration_minutes": request.duration_minutes,
                "status": "created",
                "current_question_index": 0,
                "max_questions": request.max_questions,
                "enable_follow_up": int(request.enable_follow_up),
                "current_question": None,
                "interview_plan": None,
                "final_report_id": None,
                "created_at": now,
                "updated_at": now,
            }
        )

        state = self._initial_state(session_id, thread_id, request)

        # ── 初始化阶段节点 ──────────────────────────────────────────────────
        state = await profile_analysis_node(state, self.knowledge)
        state = await interview_plan_node(state)

        # 持久化面试计划：后续 submit_answer 直接从库中读取，不再重建
        self.repo.update_session(
            session_id,
            interview_plan=json.dumps(state["interview_plan"], ensure_ascii=False),
        )

        state = await knowledge_retrieval_node(state, self.knowledge)
        state = await question_generation_node(state, self.llm)
        self._save_waiting_question(state)

        return {"session_id": session_id, "status": "waiting_user", "question": state["current_question"]}

    @traceable(run_type="chain", name="submit_answer")
    async def submit_answer(self, session_id: str, answer: str) -> dict[str, Any]:
        """处理用户回答，评估并决定下一步流程。

        决策树：
          - need_follow_up=True 且 follow_up_count < 2 → 追问（同一题）
          - current_index + 1 >= max_questions         → 生成报告，结束面试
          - 否则                                       → 进入下一题

        Args:
            session_id: 面试会话 ID。
            answer:     用户回答文本。

        Returns:
            {
              "session_id": ...,
              "status": "waiting_user" | "completed",
              "question": 下一题对象或 None,
              "last_evaluation": 本轮评估结果,
              "report_id": 最终报告 ID（仅 completed 时存在）
            }

        Raises:
            ValueError: session 不存在（"session_not_found"）
        """
        session = self.repo.get_session(session_id)
        if not session:
            raise ValueError("session_not_found")

        # 幂等处理：已完成的会话直接返回结果
        if session["status"] == "completed":
            return {
                "session_id": session_id,
                "status": "completed",
                "question": None,
                "report_id": session["final_report_id"],
            }

        current_question = json.loads(session["current_question"]) if session["current_question"] else None
        if not current_question:
            raise ValueError("session_has_no_current_question")

        # 从数据库恢复完整的 Agent 状态
        turns = self.repo.list_turns(session_id)
        state = self._state_from_session(session, turns)
        state["current_question"] = current_question
        state["last_user_answer"] = answer

        # ── 评估阶段 ────────────────────────────────────────────────────────
        state = await answer_evaluation_node(state, self.llm)
        self._save_turn(state)

        decision = decide_after_evaluation(state)

        if decision == "follow_up":
            # 追问：继续同一题，计数器 +1
            state["follow_up_count"] = state.get("follow_up_count", 0) + 1
            state["should_follow_up"] = True
            state = await knowledge_retrieval_node(state, self.knowledge)
            state = await question_generation_node(state, self.llm)
            self._save_waiting_question(state)
            return {
                "session_id": session_id,
                "status": "waiting_user",
                "question": state["current_question"],
                "last_evaluation": state["last_evaluation"],
            }

        if decision == "next_question":
            # 进入下一题：重置追问计数
            state["current_question_index"] = state.get("current_question_index", 0) + 1
            state["follow_up_count"] = 0
            state["should_follow_up"] = False
            state = await knowledge_retrieval_node(state, self.knowledge)
            state = await question_generation_node(state, self.llm)
            self._save_waiting_question(state)
            return {
                "session_id": session_id,
                "status": "waiting_user",
                "question": state["current_question"],
                "last_evaluation": state["last_evaluation"],
            }

        # decision == "finish"：所有题目已完成，生成最终报告
        state = await report_generation_node(state, self.llm)
        report_id = self._save_report(session_id, state["final_report"])
        self.repo.update_session(session_id, status="completed", final_report_id=report_id)
        return {
            "session_id": session_id,
            "status": "completed",
            "question": None,
            "last_evaluation": state["last_evaluation"],
            "report_id": report_id,
        }

    @traceable(run_type="chain", name="finalize_interview")
    async def finalize_interview(self, session_id: str) -> dict[str, Any]:
        """强制结束面试并生成报告（用于用户手动中止的场景）。

        无论当前答了几题，都从已有 transcript 生成报告。
        若会话已 completed，直接返回现有 report_id。

        Raises:
            ValueError: session 不存在（"session_not_found"）
        """
        session = self.repo.get_session(session_id)
        if not session:
            raise ValueError("session_not_found")

        if session["status"] == "completed":
            return {
                "session_id": session_id,
                "status": "completed",
                "report_id": session["final_report_id"],
            }

        turns = self.repo.list_turns(session_id)
        state = self._state_from_session(session, turns)

        state = await report_generation_node(state, self.llm)
        report_id = self._save_report(session_id, state["final_report"])
        self.repo.update_session(session_id, status="completed", final_report_id=report_id)
        return {
            "session_id": session_id,
            "status": "completed",
            "report_id": report_id,
        }

    # ── 内部辅助方法 ──────────────────────────────────────────────────────────

    def _initial_state(self, session_id: str, thread_id: str, request: CreateInterviewRequest) -> InterviewState:
        """构建新会话的初始 Agent 状态字典。"""
        return {
            "user_id": request.user_id,
            "session_id": session_id,
            "thread_id": thread_id,
            "mode": request.mode,
            "role_direction": request.role_direction,
            "difficulty": request.difficulty,
            "duration_minutes": request.duration_minutes,
            "max_questions": request.max_questions,
            "enable_follow_up": request.enable_follow_up,
            "current_question_index": 0,
            "follow_up_count": 0,
            "transcript": [],
            "evaluation_notes": [],
            "should_follow_up": False,
            "should_finish": False,
            "status": "created",
        }

    def _state_from_session(self, session: dict[str, Any], turns: list[dict[str, Any]]) -> InterviewState:
        """从数据库记录恢复 Agent 状态，用于 submit_answer 时继续会话。

        interview_plan 优先从数据库读取（create_interview 时已持久化），
        若为旧数据（NULL），则通过 _make_default_plan 生成兜底计划。
        """
        transcript = []
        evaluations = []
        for turn in turns:
            evaluation = json.loads(turn["evaluation"]) if turn["evaluation"] else {}
            evaluations.append(evaluation)
            transcript.append(
                {
                    "question": {"content": turn["question"], "question_type": turn["question_type"]},
                    "answer": turn["answer"],
                    "evaluation": evaluation,
                    "retrieved_context_ids": json.loads(turn["retrieved_context_ids"]),
                }
            )

        # 从数据库读取持久化的面试计划，消除旧版 _rebuild_plan 的异步 Bug
        raw_plan = session.get("interview_plan")
        interview_plan = json.loads(raw_plan) if raw_plan else _make_default_plan(session)

        return {
            "user_id": session["user_id"],
            "session_id": session["id"],
            "thread_id": session["thread_id"],
            "mode": session["mode"],
            "role_direction": session["role_direction"],
            "difficulty": session["difficulty"],
            "duration_minutes": session["duration_minutes"],
            "max_questions": session["max_questions"],
            "enable_follow_up": bool(session["enable_follow_up"]),
            "current_question_index": session["current_question_index"],
            "follow_up_count": 0,
            "interview_plan": interview_plan,
            "transcript": transcript,
            "evaluation_notes": evaluations,
            "should_follow_up": False,
            "status": session["status"],
        }

    def _save_waiting_question(self, state: InterviewState) -> None:
        """将当前题目和进度写入数据库，同步更新 session 状态为 waiting_user。"""
        self.repo.update_session(
            state["session_id"],
            status="waiting_user",
            current_question_index=state["current_question_index"],
            current_question=json.dumps(state["current_question"], ensure_ascii=False),
        )

    def _save_turn(self, state: InterviewState) -> None:
        """将最新一轮问答记录（来自 transcript 末尾）写入 interview_turns 表。"""
        turn = state["transcript"][-1]
        question = turn["question"]
        self.repo.insert_turn(
            {
                "id": f"turn_{uuid.uuid4().hex}",
                "session_id": state["session_id"],
                "turn_index": len(state["transcript"]),
                "question": question.get("content", ""),
                "question_type": question.get("question_type", "unknown"),
                "answer": turn["answer"],
                "evaluation": json.dumps(turn["evaluation"], ensure_ascii=False),
                "retrieved_context_ids": json.dumps(turn["retrieved_context_ids"], ensure_ascii=False),
                "created_at": utc_now(),
            }
        )

    def _save_report(self, session_id: str, report: dict[str, Any]) -> str:
        """将 LLM 生成的面试报告写入 interview_reports 表，返回报告 ID。"""
        report_id = f"report_{uuid.uuid4().hex}"
        self.repo.insert_report(
            {
                "id": report_id,
                "session_id": session_id,
                "total_score": int(report["total_score"]),
                "dimension_scores": json.dumps(report["dimension_scores"], ensure_ascii=False),
                "question_reviews": json.dumps(report["question_reviews"], ensure_ascii=False),
                "resume_suggestions": json.dumps(report["resume_suggestions"], ensure_ascii=False),
                "next_training_plan": json.dumps(report["next_training_plan"], ensure_ascii=False),
                "created_at": utc_now(),
            }
        )
        return report_id
