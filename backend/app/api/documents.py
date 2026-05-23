"""
文档管理 API（/api/documents）。

提供以下端点：
  POST   /api/documents/upload         上传文件（不立即解析）
  POST   /api/documents/{id}/parse     触发文档解析和向量化索引
  GET    /api/documents                列出当前用户的所有文档
  DELETE /api/documents/{id}           删除文档及其向量数据
"""

from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.core.config import Settings, get_settings
from app.core.errors import http_error
from app.dependencies import get_knowledge_service, get_repository
from app.schemas.document import DocumentResponse, ParseDocumentResponse
from app.services.knowledge_service import KnowledgeService

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    source_type: str = Form(...),
    user_id: str = Form("default"),
    service: KnowledgeService = Depends(get_knowledge_service),
    settings: Settings = Depends(get_settings),
):
    """上传文档并创建数据库记录（仅保存文件，不触发解析）。

    上传成功后返回 parse_status=pending 的文档记录，
    调用方需随后调用 POST /{id}/parse 触发解析。

    文件大小限制由 settings.max_upload_mb 控制（默认 10MB）。
    支持格式：.pdf / .docx / .md / .txt
    """
    # 校验文档类型枚举值
    if source_type not in {"resume", "jd", "project", "other"}:
        raise http_error("INVALID_SOURCE_TYPE", "source_type must be resume, jd, project, or other")

    # 文件大小校验（注意：multipart 不带 Content-Length 时 file.size 为 None，需空值保护）
    if file.size and file.size > settings.max_upload_mb * 1024 * 1024:
        raise http_error("FILE_TOO_LARGE", f"文件大小必须 <= {settings.max_upload_mb}MB")

    try:
        row = await service.save_upload(file=file, source_type=source_type, user_id=user_id)
        return row
    except ValueError:
        raise http_error("UNSUPPORTED_FILE_TYPE", "仅支持 .pdf、.docx、.md、.txt 格式")


@router.post("/{document_id}/parse", response_model=ParseDocumentResponse)
async def parse_document(
    document_id: str,
    service: KnowledgeService = Depends(get_knowledge_service),
):
    """触发文档解析：提取文本 → 分块 → 向量化 → 写入 ChromaDB。

    此操作是幂等的：重复调用会先删除旧向量数据再重新索引。
    对于大文件（数百页 PDF），请求可能耗时较长（通常 1-30 秒）。
    """
    try:
        return await service.parse_and_index(document_id)
    except ValueError:
        raise http_error("DOCUMENT_NOT_FOUND", "文档不存在", 404)
    except Exception as exc:
        raise http_error("DOCUMENT_PARSE_FAILED", f"文件解析失败: {exc}")


@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    user_id: str = "default",
    repo=Depends(get_repository),
):
    """列出指定用户的所有文档，按上传时间降序排列。"""
    return repo.list_documents(user_id)


@router.get("/{document_id}/chunks")
async def get_document_chunks(
    document_id: str,
    limit: int = 30,
    repo=Depends(get_repository),
):
    """获取文档解析后的知识分块列表，用于前端预览。

    每块包含 chunk_index、content（原文本）和 metadata（来源页码等）。
    limit 控制最多返回条数（默认 30，最大 100）。
    """
    if not repo.get_document(document_id):
        raise http_error("DOCUMENT_NOT_FOUND", "文档不存在", 404)
    limit = min(limit, 100)
    chunks = repo.list_chunks(document_id, limit=limit)
    # metadata 在 DB 中以 JSON 字符串存储，反序列化后返回
    for chunk in chunks:
        if isinstance(chunk.get("metadata"), str):
            try:
                import json
                chunk["metadata"] = json.loads(chunk["metadata"])
            except Exception:
                chunk["metadata"] = {}
    return {"chunks": chunks, "total": len(chunks)}


@router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    service: KnowledgeService = Depends(get_knowledge_service),
    repo=Depends(get_repository),
):
    """删除文档：同时清除 ChromaDB 向量数据和 SQLite 记录。

    此操作不可撤销，也不会删除上传的原始文件（需手动清理 upload_dir）。
    """
    if not repo.get_document(document_id):
        raise http_error("DOCUMENT_NOT_FOUND", "文档不存在", 404)
    # 先删向量数据，再删数据库记录（避免孤立向量条目）
    service.vector_store.delete_by_document(document_id)
    repo.delete_document(document_id)
    return {"deleted": True}
