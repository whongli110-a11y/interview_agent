"""
知识库服务层。

负责文档的完整生命周期管理：
  1. save_upload   — 接收上传文件，保存到本地，写入文档元数据
  2. parse_and_index — 解析文档文本 → 分块 → 向量化 → 写入 ChromaDB + SQLite
  3. search        — 对查询进行向量化后，在 ChromaDB 中检索最相关分块

所有涉及磁盘 I/O 的同步操作（文件写入、文档解析）都通过
asyncio.to_thread() 提交到线程池，避免阻塞 FastAPI 事件循环。
"""

from __future__ import annotations

import asyncio
import json
import uuid
from pathlib import Path

from fastapi import UploadFile

from app.core.config import Settings
from app.db.repository import Repository, utc_now
from app.services.document_parser import DocumentParseError, parse_document
from app.services.embedding_provider import EmbeddingProvider
from app.services.text_splitter import split_text
from app.services.vector_store import ChromaVectorStore

try:
    from langsmith import traceable
except ImportError:
    def traceable(**_kw):  # type: ignore[misc]
        def _d(fn):
            return fn
        return _d


class KnowledgeService:
    """知识库服务，协调文档存储、解析、向量化和检索。"""

    def __init__(
        self,
        repo: Repository,
        vector_store: ChromaVectorStore,
        embedding_provider: EmbeddingProvider,
        settings: Settings,
    ) -> None:
        self.repo = repo
        self.vector_store = vector_store
        self.embedding_provider = embedding_provider
        self.settings = settings

    async def save_upload(self, file: UploadFile, source_type: str, user_id: str) -> dict:
        """保存上传文件并创建数据库记录（不立即解析）。

        使用 await file.read() 异步读取上传内容，
        再用 asyncio.to_thread 将磁盘写入操作提交到线程池，
        防止大文件写入阻塞事件循环。

        Args:
            file:        FastAPI UploadFile 对象。
            source_type: 文档类型（resume / jd / project / other）。
            user_id:     文档归属用户 ID。

        Returns:
            新插入的文档元数据字典（对应 DocumentResponse schema）。

        Raises:
            ValueError: 文件扩展名不受支持时抛出。
        """
        suffix = Path(file.filename or "").suffix.lower()
        if suffix not in {".pdf", ".docx", ".md", ".txt"}:
            raise ValueError("unsupported_file_type")

        document_id = f"doc_{uuid.uuid4().hex}"
        target = self.settings.upload_dir / f"{document_id}{suffix}"

        # 确保上传目录存在（lifespan 正常流程会预先创建，此处防御性保证）
        await asyncio.to_thread(target.parent.mkdir, parents=True, exist_ok=True)
        # 先用 FastAPI 的异步 read()，再在线程池中写入磁盘（避免阻塞事件循环）
        content = await file.read()
        await asyncio.to_thread(target.write_bytes, content)

        now = utc_now()
        row = {
            "id": document_id,
            "user_id": user_id,
            "filename": file.filename or target.name,
            "source_type": source_type,
            "file_path": str(target),
            "raw_text_path": None,
            "parse_status": "pending",
            "parse_error": None,
            "created_at": now,
            "updated_at": now,
        }
        self.repo.insert_document(row)
        return row

    async def parse_and_index(self, document_id: str) -> dict:
        """解析文档、分块、生成向量并写入 ChromaDB 和 SQLite。

        完整流程：
          1. 查库获取文档元数据，状态置为 processing
          2. 清除 ChromaDB 中旧的向量条目（支持重复解析）
          3. 在线程池中同步解析文档（避免阻塞事件循环）
          4. 对分块批量生成 embedding
          5. 将向量批量写入 ChromaDB，将分块元数据写入 SQLite
          6. 更新文档状态为 completed；失败时记录 parse_error

        Args:
            document_id: 待解析的文档 ID。

        Returns:
            包含 document_id、parse_status、chunk_count 的字典。

        Raises:
            ValueError:          文档不存在时抛出。
            DocumentParseError:  解析提取到空文本时抛出。
            Exception:           其他解析/向量化错误（调用方应捕获并返回 HTTP 错误）。
        """
        document = self.repo.get_document(document_id)
        if not document:
            raise ValueError("document_not_found")

        # 标记为处理中，并清除可能存在的旧向量数据（支持重新解析）
        self.repo.update_document(document_id, parse_status="processing", parse_error=None)
        self.vector_store.delete_by_document(document_id)

        try:
            # parse_document 是同步阻塞操作（PDF/DOCX 解析），提交到线程池
            text = await asyncio.to_thread(parse_document, Path(document["file_path"]))
            chunks = split_text(text)
            if not chunks:
                raise DocumentParseError("文档中未提取到有效文本")

            # 将纯文本缓存到磁盘，方便调试和后续处理（同样在线程池中写入）
            parsed_path = self.settings.parsed_dir / f"{document_id}.txt"
            await asyncio.to_thread(parsed_path.parent.mkdir, parents=True, exist_ok=True)
            await asyncio.to_thread(lambda: parsed_path.write_text(text, encoding="utf-8"))

            # 批量生成 embedding（mock 模式为哈希向量，真实模式为语义向量）
            embeddings = await self.embedding_provider.embed_documents(chunks)

            now = utc_now()
            chunk_rows = []   # 写入 SQLite
            vector_items = [] # 写入 ChromaDB

            for index, (content, embedding) in enumerate(zip(chunks, embeddings)):
                chunk_id = f"chunk_{uuid.uuid4().hex}"
                # metadata 同时写入 SQLite 和 ChromaDB，用于过滤和溯源
                metadata = {
                    "user_id": document["user_id"],
                    "document_id": document_id,
                    "source_type": document["source_type"],
                    "filename": document["filename"],
                    "chunk_index": index,
                }
                chunk_rows.append(
                    {
                        "id": chunk_id,
                        "document_id": document_id,
                        "user_id": document["user_id"],
                        "source_type": document["source_type"],
                        "chunk_index": index,
                        "content": content,
                        "metadata": metadata,
                        "vector_id": chunk_id,  # vector_id 与 chunk_id 保持一致
                        "created_at": now,
                    }
                )
                vector_items.append(
                    {
                        "id": chunk_id,
                        "content": content,
                        "embedding": embedding,
                        "metadata": metadata,
                    }
                )

            # 先更新 SQLite，再写入 ChromaDB（SQLite 是主数据源）
            self.repo.replace_chunks(document_id, chunk_rows)
            self.vector_store.upsert_many(vector_items)

            self.repo.update_document(
                document_id,
                raw_text_path=str(parsed_path),
                parse_status="completed",
                parse_error=None,
            )
            return {"document_id": document_id, "parse_status": "completed", "chunk_count": len(chunks)}

        except Exception as exc:
            # 任何异常都记录 parse_error，确保前端可感知失败原因
            self.repo.update_document(document_id, parse_status="failed", parse_error=str(exc))
            raise

    async def search(
        self,
        user_id: str,
        query: str,
        source_types: list[str] | None = None,
        top_k: int = 5,
    ) -> list[dict]:
        """对查询文本进行向量化后在 ChromaDB 中检索最相关分块。

        Args:
            user_id:      仅检索该用户的文档。
            query:        自然语言查询文本。
            source_types: 可选的文档类型过滤列表。
            top_k:        最多返回结果数量。

        Returns:
            检索结果列表，每项包含 chunk_id、document_id、source_type、content、score、metadata。
        """
        @traceable(
            run_type="retriever",
            name="knowledge_search",
            metadata={"source_types": source_types or [], "top_k": top_k},
        )
        async def _search(query: str, user_id: str) -> list[dict]:
            query_vector = await self.embedding_provider.embed_query(query)
            results = self.vector_store.search(
                query_vector, user_id=user_id, top_k=top_k, source_types=source_types
            )
            return [
                {
                    "chunk_id": item["id"],
                    "document_id": item["metadata"]["document_id"],
                    "source_type": item["metadata"]["source_type"],
                    "content": item["content"],
                    # score 字段即余弦相似度，LangSmith 中可直接观察检索精度
                    "score": item["score"],
                    "metadata": item["metadata"],
                }
                for item in results
            ]

        return await _search(query=query, user_id=user_id)


def decode_json_field(value: str):
    """安全解析 JSON 字符串，为 None 或空值时返回 None。"""
    return json.loads(value) if value else None
