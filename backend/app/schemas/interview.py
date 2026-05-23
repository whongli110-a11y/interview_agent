from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


InterviewMode = Literal["technical", "behavioral", "mixed"]
Difficulty = Literal["basic", "medium", "hard"]


class CreateInterviewRequest(BaseModel):
    user_id: str = "default"
    mode: InterviewMode = "mixed"
    role_direction: str = "AI 应用开发工程师"
    difficulty: Difficulty = "medium"
    duration_minutes: int = Field(default=20, ge=5, le=120)
    max_questions: int = Field(default=8, ge=1, le=30)
    enable_follow_up: bool = True


class InterviewQuestion(BaseModel):
    turn_index: int
    question_type: str
    content: str
    intent: Optional[str] = None
    expected_points: list[str] = []


class CreateInterviewResponse(BaseModel):
    session_id: str
    status: str
    question: Optional[InterviewQuestion] = None


class SubmitAnswerRequest(BaseModel):
    answer: str = Field(min_length=1)


class SubmitAnswerResponse(BaseModel):
    session_id: str
    status: str
    question: Optional[InterviewQuestion] = None
    last_evaluation: Optional[dict] = None
    report_id: Optional[str] = None


class InterviewStatusResponse(BaseModel):
    session_id: str
    status: str
    current_question_index: int
    max_questions: int
    current_question: Optional[dict] = None
    turns: list[dict] = []
