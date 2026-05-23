from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class DocumentResponse(BaseModel):
    id: str
    user_id: str
    filename: str
    source_type: str
    parse_status: str
    parse_error: Optional[str] = None
    created_at: str
    updated_at: str


class ParseDocumentResponse(BaseModel):
    document_id: str
    parse_status: str
    chunk_count: int


class KnowledgeSearchRequest(BaseModel):
    user_id: str = "default"
    query: str = Field(min_length=1)
    source_types: Optional[list[str]] = None
    top_k: int = Field(default=5, ge=1, le=20)


class KnowledgeSearchResult(BaseModel):
    chunk_id: str
    document_id: str
    source_type: str
    content: str
    score: float
    metadata: dict


class KnowledgeSearchResponse(BaseModel):
    results: list[KnowledgeSearchResult]
