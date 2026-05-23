# Interviewer Agent Backend

Python + FastAPI + LangGraph backend for the interview agent.

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

Default mode uses mock LLM and deterministic local embeddings, so it can run without an API key.

## Core APIs

- `POST /api/documents/upload`
- `POST /api/documents/{document_id}/parse`
- `GET /api/documents`
- `POST /api/knowledge/search`
- `POST /api/interviews`
- `POST /api/interviews/{session_id}/answer`
- `GET /api/interviews/{session_id}`
- `GET /api/interviews/{session_id}/report`

