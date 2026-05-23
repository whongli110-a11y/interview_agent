"""
面试会话 API（/api/interviews）。

面试流程的 REST 接口层，将 HTTP 请求桥接到 InterviewRuntime：
  POST  /api/interviews              创建会话，返回第一道题
  POST  /api/interviews/{id}/answer  提交回答，返回下一题或完成状态
  GET   /api/interviews/{id}         查询会话状态和历史问答
  GET   /api/interviews/{id}/report  获取最终面试报告
"""

import json

from fastapi import APIRouter, Depends

from app.core.errors import http_error
from app.dependencies import get_interview_runtime, get_repository
from app.schemas.interview import (
    CreateInterviewRequest,
    CreateInterviewResponse,
    InterviewStatusResponse,
    SubmitAnswerRequest,
    SubmitAnswerResponse,
)
from app.schemas.report import InterviewReportResponse

router = APIRouter(prefix="/api/interviews", tags=["interviews"])


@router.post("", response_model=CreateInterviewResponse)
async def create_interview(
    request: CreateInterviewRequest,
    runtime=Depends(get_interview_runtime),
):
    """创建新的面试会话。

    初始化包含以下耗时操作（通常 1-5 秒）：
      1. 检索候选人简历/JD 画像
      2. 生成面试计划并持久化
      3. 检索第一题相关上下文
      4. 调用 LLM 生成第一道题

    返回 session_id 供后续所有操作使用。
    """
    return await runtime.create_interview(request)


@router.post("/{session_id}/answer", response_model=SubmitAnswerResponse)
async def submit_answer(
    session_id: str,
    request: SubmitAnswerRequest,
    runtime=Depends(get_interview_runtime),
):
    """提交当前题目的回答，获取下一题或面试完成状态。

    返回 status:
      - "waiting_user": 还有下一题（包含新的 question 对象）
      - "completed":    面试结束（包含 report_id，可通过 GET /report 获取报告）
    """
    try:
        return await runtime.submit_answer(session_id, request.answer)
    except ValueError as exc:
        if str(exc) == "session_not_found":
            raise http_error("SESSION_NOT_FOUND", "面试会话不存在", 404)
        raise http_error("INTERVIEW_STEP_FAILED", str(exc))


@router.post("/{session_id}/finalize")
async def finalize_interview(
    session_id: str,
    runtime=Depends(get_interview_runtime),
):
    """强制结束面试并生成报告（用户手动中止场景）。

    无论已回答几题，都根据现有问答记录生成综合报告并返回 report_id。
    若面试已完成，直接返回现有 report_id，保持幂等。
    """
    try:
        return await runtime.finalize_interview(session_id)
    except ValueError as exc:
        if str(exc) == "session_not_found":
            raise http_error("SESSION_NOT_FOUND", "面试会话不存在", 404)
        raise http_error("FINALIZE_FAILED", str(exc))


@router.get("/{session_id}", response_model=InterviewStatusResponse)
async def get_interview(
    session_id: str,
    repo=Depends(get_repository),
):
    """查询面试会话的当前状态和历史问答记录。

    返回所有历史 turns（problem + answer + evaluation），
    前端可用于展示面试进度和已回答的问题。
    """
    session = repo.get_session(session_id)
    if not session:
        raise http_error("SESSION_NOT_FOUND", "面试会话不存在", 404)

    turns = repo.list_turns(session_id)
    # 将数据库中 JSON 字符串字段反序列化为 Python 对象
    for turn in turns:
        turn["evaluation"] = json.loads(turn["evaluation"]) if turn["evaluation"] else None
        turn["retrieved_context_ids"] = json.loads(turn["retrieved_context_ids"])

    return {
        "session_id": session["id"],
        "status": session["status"],
        "current_question_index": session["current_question_index"],
        "max_questions": session["max_questions"],
        "current_question": json.loads(session["current_question"]) if session["current_question"] else None,
        "turns": turns,
    }


@router.get("/{session_id}/report", response_model=InterviewReportResponse)
async def get_report(
    session_id: str,
    repo=Depends(get_repository),
):
    """获取面试结束后生成的综合报告。

    报告在最后一题 submit_answer 返回 status=completed 后即可查询。
    若面试尚未结束，返回 404。
    """
    report = repo.get_report_by_session(session_id)
    if not report:
        raise http_error("REPORT_NOT_FOUND", "报告尚未生成或面试未完成", 404)

    # 反序列化报告中的 JSON 字段
    return {
        **report,
        "dimension_scores": json.loads(report["dimension_scores"]),
        "question_reviews": json.loads(report["question_reviews"]),
        "resume_suggestions": json.loads(report["resume_suggestions"]),
        "next_training_plan": json.loads(report["next_training_plan"]),
    }
