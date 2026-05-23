"""
面试 Agent 各节点函数。

每个节点接收当前的 InterviewState，执行特定任务后返回更新后的状态。
节点设计遵循以下约定：
  - 纯函数语义：返回修改后的 state（dict），不直接操作数据库
  - 所有 LLM 调用均有 fallback 兜底，确保 mock 模式可完整运行
  - fallback 函数以 _fallback_xxx 命名，仅在 LLM 不可用时使用

节点调用顺序（首次）：
  profile_analysis_node → interview_plan_node → knowledge_retrieval_node
    → question_generation_node → [等待用户回答] → answer_evaluation_node
    → decide_after_evaluation → 循环或 report_generation_node
"""

from __future__ import annotations

import json
from typing import Any

from app.agents.prompts import EVALUATION_SYSTEM, QUESTION_SYSTEM, REPORT_SYSTEM
from app.agents.state import InterviewState
from app.services.knowledge_service import KnowledgeService
from app.services.llm_provider import LLMProvider

try:
    from langsmith import traceable
except ImportError:
    def traceable(**_kw):  # type: ignore[misc]
        def _d(fn):
            return fn
        return _d


# ── 初始化节点 ────────────────────────────────────────────────────────────────

@traceable(run_type="chain", name="profile_analysis")
async def profile_analysis_node(state: InterviewState, knowledge: KnowledgeService) -> InterviewState:
    """从知识库中检索候选人简历和目标 JD 的核心内容，构建画像摘要。

    检索结果保存到 state 的 resume_profile 和 jd_profile 字段，
    后续 question_generation_node 使用这些摘要生成个性化问题。

    若知识库中没有对应文档，摘要字段为默认提示文本（不会导致流程中断）。
    """
    # 检索简历相关内容（top_k=5，截取前 300 字符拼接为摘要）
    resume_chunks = await knowledge.search(
        state["user_id"], "候选人简历 教育 技能 项目 实习", ["resume"], top_k=5
    )
    # 检索目标岗位 JD 的职责和要求
    jd_chunks = await knowledge.search(
        state["user_id"], state["role_direction"] + " 岗位职责 任职要求", ["jd"], top_k=5
    )

    state["resume_profile"] = {
        "summary": "\n".join(item["content"][:300] for item in resume_chunks) or "未检索到简历内容",
        "chunk_ids": [item["chunk_id"] for item in resume_chunks],
    }
    state["jd_profile"] = {
        "summary": "\n".join(item["content"][:300] for item in jd_chunks) or "未检索到 JD 内容",
        "chunk_ids": [item["chunk_id"] for item in jd_chunks],
    }
    return state


@traceable(run_type="chain", name="interview_plan")
async def interview_plan_node(state: InterviewState) -> InterviewState:
    """根据面试模式和题目数量生成结构化的面试计划。

    计划是一个有序列表，每项包含：
      - question_type: 题目类型（project / technical / behavioral / job_fit）
      - intent:        本题的考察意图（用于指导 LLM 出题方向）
      - query:         检索知识库时使用的查询语句

    计划按 mode 过滤：
      - technical  → 保留 project + technical + job_fit
      - behavioral → 保留 project + behavioral + job_fit
      - mixed      → 使用完整五类计划
    若 max_questions 大于基础计划长度，循环补充直到满足数量要求。
    """
    mode = state["mode"]
    base_plan = [
        {"question_type": "project",    "intent": "考察项目背景、个人职责和工程结果",   "query": "最能体现工程能力的项目"},
        {"question_type": "technical",  "intent": "考察技术选型和实现细节",           "query": "项目 技术选型 架构 LangGraph RAG"},
        {"question_type": "technical",  "intent": "考察边界情况和失败处理",           "query": "异常处理 文件解析失败 模型调用失败"},
        {"question_type": "behavioral", "intent": "考察沟通协作和复盘能力",           "query": "团队协作 沟通 压力 复盘"},
        {"question_type": "job_fit",    "intent": "考察岗位匹配度",                 "query": state["role_direction"] + " 岗位匹配"},
    ]

    if mode == "technical":
        plan = [item for item in base_plan if item["question_type"] in {"project", "technical", "job_fit"}]
    elif mode == "behavioral":
        plan = [item for item in base_plan if item["question_type"] in {"behavioral", "job_fit", "project"}]
    else:
        plan = base_plan

    # 若题目数量超过基础计划，循环复用（保证 max_questions 题都有对应计划项）
    while len(plan) < state["max_questions"]:
        plan.extend(base_plan)

    state["interview_plan"] = plan[: state["max_questions"]]
    return state


# ── 每轮对话节点 ──────────────────────────────────────────────────────────────

@traceable(run_type="chain", name="knowledge_retrieval")
async def knowledge_retrieval_node(state: InterviewState, knowledge: KnowledgeService) -> InterviewState:
    """为当前题目检索最相关的知识库内容，用于出题和评估时的上下文参考。

    检索策略：
      - 正常出题时：使用面试计划中对应项目的 query 字段
      - 追问时：拼接当前题目内容 + 用户回答作为查询，检索更精准的上下文
    """
    if state.get("should_follow_up") and state.get("last_user_answer"):
        # 追问场景：基于上一道题和用户回答生成检索 query
        query = f"{state['current_question'].get('content', '')}\n{state['last_user_answer']}"
    else:
        # 普通出题：使用面试计划中预设的查询语句
        plan_item = state["interview_plan"][state["current_question_index"]]
        query = plan_item["query"]

    state["retrieved_context"] = await knowledge.search(
        state["user_id"],
        query=query,
        source_types=["resume", "jd", "project"],
        top_k=5,
    )
    return state


@traceable(run_type="chain", name="question_generation")
async def question_generation_node(state: InterviewState, llm: LLMProvider) -> InterviewState:
    """调用 LLM 生成下一道面试题，LLM 不可用时使用规则兜底。

    输入给 LLM 的上下文包括：
      - 岗位方向和难度
      - 当前计划项（question_type + intent）
      - 检索到的候选人资料片段（最多每条 500 字符）
      - 上一题的回答和评估（追问场景）

    期望 LLM 输出 JSON：
      {turn_index, question_type, content, intent, expected_points}
    """
    # 构建 fallback（规则生成），在 LLM 调用前准备好，以防 mock 模式直接返回
    if state.get("should_follow_up") and state.get("last_evaluation"):
        fallback = _fallback_follow_up_question(state)
    else:
        fallback = _fallback_question(state)

    user_prompt = json.dumps(
        {
            "role_direction": state["role_direction"],
            "difficulty": state["difficulty"],
            "plan_item": state["interview_plan"][state["current_question_index"]],
            # 限制每条上下文长度，避免超出 LLM token 限制
            "context": [item["content"][:500] for item in state.get("retrieved_context", [])],
            "last_answer": state.get("last_user_answer"),
            "last_evaluation": state.get("last_evaluation"),
        },
        ensure_ascii=False,
    )
    question = await llm.chat_json(QUESTION_SYSTEM, user_prompt, fallback)
    # 补充可能缺失的字段（防御 LLM 漏输出）
    question.setdefault("turn_index", len(state.get("transcript", [])) + 1)
    question.setdefault("expected_points", [])
    state["current_question"] = question
    state["status"] = "waiting_user"
    return state


@traceable(run_type="chain", name="answer_evaluation")
async def answer_evaluation_node(state: InterviewState, llm: LLMProvider) -> InterviewState:
    """调用 LLM 评估用户回答质量，结果写入 transcript 和 evaluation_notes。

    评估维度（由 EVALUATION_SYSTEM 提示词定义）：
      - score           : 0-100 综合分
      - need_follow_up  : 是否需要追问
      - follow_up_reason: 追问原因
      - covered_points  : 已覆盖的考察点
      - missing_points  : 缺失的考察点
      - consistency_risk: 是否与简历/资料存在不一致
      - feedback_summary: 一句话点评
    """
    answer = state.get("last_user_answer") or ""
    question = state.get("current_question") or {}
    fallback = _fallback_evaluation(answer, question, state)

    user_prompt = json.dumps(
        {
            "question": question,
            "answer": answer,
            "context": [item["content"][:500] for item in state.get("retrieved_context", [])],
        },
        ensure_ascii=False,
    )
    evaluation = await llm.chat_json(EVALUATION_SYSTEM, user_prompt, fallback)
    state["last_evaluation"] = evaluation
    state.setdefault("evaluation_notes", []).append(evaluation)
    # 将本轮问答完整记录到 transcript（供后续报告生成使用）
    state.setdefault("transcript", []).append(
        {
            "question": question,
            "answer": answer,
            "evaluation": evaluation,
            "retrieved_context_ids": [item["chunk_id"] for item in state.get("retrieved_context", [])],
        }
    )
    # 追问判断：LLM 评估认为需要追问，且当前追问次数未达上限（2次）
    state["should_follow_up"] = bool(evaluation.get("need_follow_up")) and state.get("enable_follow_up", True)
    return state


@traceable(run_type="chain", name="report_generation")
async def report_generation_node(state: InterviewState, llm: LLMProvider) -> InterviewState:
    """调用 LLM 生成面试结束后的综合报告。

    报告内容（由 REPORT_SYSTEM 提示词定义）：
      - total_score       : 综合分
      - dimension_scores  : 各维度分数字典
      - question_reviews  : 逐题复盘列表
      - resume_suggestions: 简历优化建议
      - next_training_plan: 专项训练计划
    """
    fallback = _fallback_report(state)
    user_prompt = json.dumps(
        {
            "transcript": state.get("transcript", []),
            "evaluation_notes": state.get("evaluation_notes", []),
            "role_direction": state["role_direction"],
        },
        ensure_ascii=False,
    )
    state["final_report"] = await llm.chat_json(REPORT_SYSTEM, user_prompt, fallback)
    state["status"] = "completed"
    return state


# ── 路由决策 ──────────────────────────────────────────────────────────────────

def decide_after_evaluation(state: InterviewState) -> str:
    """根据评估结果决定下一步流程。

    Returns:
        "follow_up"    : 需要追问（评估认为回答不足，且追问次数 < 2）
        "next_question": 进入下一题（追问已满，且未到最大题数）
        "finish"       : 所有题目完成，生成报告
    """
    # 追问条件：LLM 评估认为需要追问，且本题追问次数未超限
    if state.get("should_follow_up") and state.get("follow_up_count", 0) < 2:
        return "follow_up"
    # 已到最后一题：结束面试
    if state.get("current_question_index", 0) + 1 >= state.get("max_questions", 1):
        return "finish"
    return "next_question"


# ── Fallback 函数（LLM 不可用时的规则兜底）────────────────────────────────────

def _fallback_question(state: InterviewState) -> dict[str, Any]:
    """根据当前计划项的 question_type 生成规则驱动的默认问题。

    此函数仅在 LLM 返回 mock fallback 或网络不可用时生效，
    确保 mock 模式下面试流程依然完整可运行。
    """
    index = state["current_question_index"]
    plan_item = state["interview_plan"][index]
    question_type = plan_item["question_type"]

    content_map = {
        "project":    "请介绍一个最能体现你工程能力的项目，重点说明背景、你的职责、技术方案和最终结果。",
        "technical":  "请结合你的项目说明一个关键技术选型：为什么选择它，替代方案是什么，最终效果如何？",
        "behavioral": "请分享一次你在团队协作中遇到分歧的经历，你如何沟通并推动问题解决？",
    }
    content = content_map.get(
        question_type,
        f"请说明你的经历为什么匹配{state['role_direction']}这个方向。",
    )
    return {
        "turn_index": len(state.get("transcript", [])) + 1,
        "question_type": question_type,
        "content": content,
        "intent": plan_item["intent"],
        "expected_points": ["背景", "个人职责", "技术或行动", "结果", "复盘"],
    }


def _fallback_follow_up_question(state: InterviewState) -> dict[str, Any]:
    """根据上一轮评估中缺失的考察点生成追问内容。"""
    missing = state.get("last_evaluation", {}).get("missing_points") or ["技术细节", "结果指标"]
    return {
        "turn_index": len(state.get("transcript", [])) + 1,
        "question_type": "follow_up",
        "content": f"你刚才的回答还缺少{'、'.join(missing[:3])}。请补充具体细节。",
        "intent": "针对上一题回答不足进行追问",
        "expected_points": missing,
    }


def _fallback_evaluation(answer: str, question: dict[str, Any], state: InterviewState) -> dict[str, Any]:
    """基于规则对回答进行启发式评估（不依赖 LLM）。

    评分逻辑：
      - 基础分 86 分，每缺少一个考察点扣 8 分，最低 50 分
      - 回答长度不足 80 字（去空格后）视为缺少"回答长度和细节"

    注意：此实现为兜底用途，准确性远低于 LLM 语义评估，
    特别是中文同义词、近义词无法被识别为"已覆盖"。
    """
    missing: list[str] = []
    # 去空格后长度判断（更准确地衡量中文内容量）
    if len(answer.replace(" ", "")) < 80:
        missing.append("回答长度和细节")
    for point in question.get("expected_points", []):
        # 简单字符串包含判断（中文场景下仅能匹配精确关键词）
        if point and point not in answer:
            missing.append(point)
    missing = list(dict.fromkeys(missing))[:4]  # 去重，最多保留 4 个缺失点
    need_follow_up = bool(missing) and state.get("follow_up_count", 0) < 2
    score = max(50, 86 - len(missing) * 8)
    return {
        "score": score,
        "need_follow_up": need_follow_up,
        "follow_up_reason": "、".join(missing) if missing else "",
        "covered_points": [p for p in question.get("expected_points", []) if p and p in answer],
        "missing_points": missing,
        "consistency_risk": False,
        "feedback_summary": "回答具备基本方向，但仍需要补充具体证据。" if missing else "回答结构较完整，可以进入下一题。",
    }


def _fallback_report(state: InterviewState) -> dict[str, Any]:
    """基于各轮评估分数生成兜底面试报告。

    总分取所有轮次评估分数的平均值；各维度分数由总分加减固定偏移量生成，
    这是粗略估算，接入真实 LLM 后会被覆盖。
    """
    scores = [item.get("score", 70) for item in state.get("evaluation_notes", [])]
    total = int(sum(scores) / len(scores)) if scores else 70

    question_reviews = []
    for item in state.get("transcript", []):
        evaluation = item.get("evaluation", {})
        question_reviews.append(
            {
                "question": item.get("question", {}).get("content", ""),
                "answer_summary": item.get("answer", "")[:160],
                "evaluation": evaluation.get("feedback_summary", ""),
                "issues": evaluation.get("missing_points", []),
                "better_answer_direction": "按背景、行动、结果、复盘组织回答，并补充量化结果。",
            }
        )
    return {
        "total_score": total,
        "dimension_scores": {
            "technical_accuracy": total,
            "project_clarity": max(0, total - 4),
            "job_fit": min(100, total + 5),
            "structure": max(0, total - 6),
            "follow_up_handling": max(0, total - 8),
            "behavioral": total,
        },
        "question_reviews": question_reviews,
        "resume_suggestions": ["补充项目中的个人职责、技术取舍和量化结果。"],
        "next_training_plan": ["专项练习项目深挖题", "准备 2 个技术选型案例", "用 STAR 结构重写综合面回答"],
    }
