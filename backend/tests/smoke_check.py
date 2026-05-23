import os
import sys
import tempfile
from pathlib import Path


tmp = tempfile.TemporaryDirectory()
root = Path(tmp.name)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["DATABASE_PATH"] = str(root / "app.db")
os.environ["UPLOAD_DIR"] = str(root / "uploads")
os.environ["PARSED_DIR"] = str(root / "parsed")
os.environ["VECTOR_STORE_PATH"] = str(root / "vector_store.json")
os.environ["CHECKPOINT_DB_PATH"] = str(root / "checkpoints.sqlite")
os.environ["LLM_PROVIDER"] = "mock"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


def main() -> None:
    client = TestClient(app)
    assert client.get("/health").json() == {"status": "ok"}

    resume_text = (
        "我是一名应届生，目标岗位是 AI 应用开发工程师。"
        "项目经历：基于 LangGraph 构建面试 Agent，负责资料上传、知识库检索、"
        "面试流程编排、追问判断和报告生成。技术栈包括 Python、FastAPI、LangGraph。"
    )
    upload = client.post(
        "/api/documents/upload",
        data={"source_type": "resume", "user_id": "default"},
        files={"file": ("resume.txt", resume_text.encode("utf-8"), "text/plain")},
    )
    assert upload.status_code == 200, upload.text
    document_id = upload.json()["id"]

    parsed = client.post(f"/api/documents/{document_id}/parse")
    assert parsed.status_code == 200, parsed.text
    assert parsed.json()["chunk_count"] >= 1

    search = client.post(
        "/api/knowledge/search",
        json={"user_id": "default", "query": "LangGraph 面试 Agent", "top_k": 3},
    )
    assert search.status_code == 200, search.text
    assert search.json()["results"], "expected at least one search result"

    created = client.post(
        "/api/interviews",
        json={
            "user_id": "default",
            "mode": "mixed",
            "role_direction": "AI 应用开发工程师",
            "difficulty": "medium",
            "duration_minutes": 20,
            "max_questions": 1,
            "enable_follow_up": False,
        },
    )
    assert created.status_code == 200, created.text
    payload = created.json()
    assert payload["question"]["content"]

    answered = client.post(
        f"/api/interviews/{payload['session_id']}/answer",
        json={"answer": "我负责使用 LangGraph 编排节点，并用 FastAPI 暴露接口，最终实现资料检索和模拟面试闭环。"},
    )
    assert answered.status_code == 200, answered.text
    assert answered.json()["status"] == "completed"

    report = client.get(f"/api/interviews/{payload['session_id']}/report")
    assert report.status_code == 200, report.text
    assert report.json()["total_score"] > 0


if __name__ == "__main__":
    main()
    print("smoke_check passed")
