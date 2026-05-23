"""
End-to-end backend test with real local files and the configured LLM.

Usage from repo root:

    python3 backend/tests/e2e_real_files.py \
      --resume /path/to/resume.pdf \
      --jd /path/to/job.md \
      --project /path/to/project.md \
      --questions 3

The script imports the FastAPI app directly through TestClient, so you do not need
to start uvicorn. It uses backend/.env by default through app.core.config.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import sys
from pathlib import Path
from typing import Any


BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run an end-to-end backend test with real files.")
    parser.add_argument("--resume", type=Path, required=True, help="Resume file path: .pdf, .docx, .md, or .txt")
    parser.add_argument("--jd", type=Path, default=None, help="Job description file path")
    parser.add_argument(
        "--project",
        type=Path,
        action="append",
        default=[],
        help="Project material file path. Can be provided multiple times.",
    )
    parser.add_argument("--user-id", default="default")
    parser.add_argument("--role", default="AI 应用开发工程师")
    parser.add_argument("--mode", choices=["technical", "behavioral", "mixed"], default="mixed")
    parser.add_argument("--difficulty", choices=["basic", "medium", "hard"], default="medium")
    parser.add_argument("--questions", type=int, default=3)
    parser.add_argument("--duration", type=int, default=20)
    parser.add_argument("--enable-follow-up", action="store_true", help="Enable follow-up questions.")
    parser.add_argument(
        "--answer",
        default=(
            "我会先说明项目背景，再讲我负责的模块、技术方案和结果。"
            "在 LangGraph 面试 Agent 项目中，我负责资料解析、知识库检索、"
            "面试节点编排和报告生成，并通过 FastAPI 对前端提供接口。"
        ),
        help="Answer text used for each interview question.",
    )
    return parser.parse_args()


def assert_file(path: Path, label: str) -> None:
    if not path.exists() or not path.is_file():
        raise SystemExit(f"{label} not found: {path}")
    if path.suffix.lower() not in {".pdf", ".docx", ".md", ".txt"}:
        raise SystemExit(f"{label} unsupported suffix: {path.suffix}")


def print_step(title: str, payload: Any | None = None) -> None:
    print(f"\n=== {title} ===")
    if payload is not None:
        print(json.dumps(payload, ensure_ascii=False, indent=2)[:4000])


def upload_and_parse(client: TestClient, path: Path, source_type: str, user_id: str) -> str:
    content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    with path.open("rb") as file_obj:
        response = client.post(
            "/api/documents/upload",
            data={"source_type": source_type, "user_id": user_id},
            files={"file": (path.name, file_obj, content_type)},
        )
    require_ok(response, f"upload {path.name}")
    uploaded = response.json()
    print_step(f"uploaded {source_type}: {path.name}", uploaded)

    parsed = client.post(f"/api/documents/{uploaded['id']}/parse")
    require_ok(parsed, f"parse {path.name}")
    print_step(f"parsed {source_type}: {path.name}", parsed.json())
    return uploaded["id"]


def require_ok(response, action: str) -> None:
    if response.status_code >= 400:
        raise SystemExit(f"{action} failed: HTTP {response.status_code}\n{response.text}")


def run_interview(client: TestClient, args: argparse.Namespace) -> str:
    create_payload = {
        "user_id": args.user_id,
        "mode": args.mode,
        "role_direction": args.role,
        "difficulty": args.difficulty,
        "duration_minutes": args.duration,
        "max_questions": args.questions,
        "enable_follow_up": args.enable_follow_up,
    }
    created = client.post("/api/interviews", json=create_payload)
    require_ok(created, "create interview")
    current = created.json()
    print_step("created interview", current)

    session_id = current["session_id"]
    for index in range(1, args.questions + 20):
        if current["status"] == "completed":
            break
        question = current.get("question") or {}
        print_step(f"question {index}", question)
        answer = build_answer(args.answer, question)
        answered = client.post(f"/api/interviews/{session_id}/answer", json={"answer": answer})
        require_ok(answered, f"submit answer {index}")
        current = answered.json()
        print_step(f"answer result {index}", current)
    else:
        raise SystemExit("interview did not complete; check follow-up loop or max_questions")

    if current["status"] != "completed":
        raise SystemExit(f"interview ended in unexpected status: {current['status']}")
    return session_id


def build_answer(base_answer: str, question: dict[str, Any]) -> str:
    expected_points = question.get("expected_points") or []
    if not expected_points:
        return base_answer
    points_text = "、".join(str(point) for point in expected_points[:4])
    return f"{base_answer} 我会重点覆盖：{points_text}。"


def main() -> None:
    args = parse_args()
    assert_file(args.resume, "resume")
    if args.jd:
        assert_file(args.jd, "jd")
    for index, project in enumerate(args.project, start=1):
        assert_file(project, f"project #{index}")

    client = TestClient(app)
    health = client.get("/health")
    require_ok(health, "health check")
    print_step("health", health.json())

    upload_and_parse(client, args.resume, "resume", args.user_id)
    if args.jd:
        upload_and_parse(client, args.jd, "jd", args.user_id)
    for project in args.project:
        upload_and_parse(client, project, "project", args.user_id)

    search = client.post(
        "/api/knowledge/search",
        json={
            "user_id": args.user_id,
            "query": f"{args.role} LangGraph 项目 技术选型 面试",
            "source_types": ["resume", "jd", "project"],
            "top_k": 5,
        },
    )
    require_ok(search, "knowledge search")
    results = search.json()["results"]
    print_step("knowledge search", {"result_count": len(results), "results": results})
    if not results:
        raise SystemExit("knowledge search returned no results")

    session_id = run_interview(client, args)

    report = client.get(f"/api/interviews/{session_id}/report")
    require_ok(report, "get report")
    report_payload = report.json()
    print_step(
        "final report",
        {
            "total_score": report_payload["total_score"],
            "dimension_scores": report_payload["dimension_scores"],
            "resume_suggestions": report_payload["resume_suggestions"],
            "next_training_plan": report_payload["next_training_plan"],
            "question_review_count": len(report_payload["question_reviews"]),
        },
    )
    print("\nE2E_REAL_FILES_PASSED")


if __name__ == "__main__":
    main()
