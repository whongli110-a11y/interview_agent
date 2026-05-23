from pydantic import BaseModel


class InterviewReportResponse(BaseModel):
    id: str
    session_id: str
    total_score: int
    dimension_scores: dict
    question_reviews: list[dict]
    resume_suggestions: list[str]
    next_training_plan: list[str]
    created_at: str
