"""
向量存储模块（基于 ChromaDB）。

ChromaDB 是一个嵌入式向量数据库，支持持久化存储和 HNSW 近似最近邻索引，
相比原先的 JSON 文件方案有以下优势：
  - 搜索从 O(N·D) 暴力扫描优化为 HNSW 近似索引（千级以上显著加速）
  - 支持并发读写（内部有锁机制），不会破坏文件完整性
  - 原生支持 metadata 过滤（user_id、source_type 等）

按向量维度使用独立 collection（如 documents_d1536），
避免 mock(128) 与语义模型(1536) 切换时 Chroma 维度冲突。
通过 metadata 字段区分用户和文档来源。
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def _is_dimension_mismatch(exc: BaseException) -> bool:
    message = str(exc).lower()
    return "dimension" in message and "expecting" in message


class ChromaVectorStore:
    """基于 ChromaDB PersistentClient 的向量存储。

    使用余弦相似度（hnsw:space=cosine）作为距离度量，
    与原 JsonVectorStore 的 cosine_similarity 实现保持语义一致。
    """

    def __init__(self, path: Path, embedding_dimension: int) -> None:
        """初始化 ChromaDB 客户端并获取/创建按维度隔离的 collection。

        Args:
            path: ChromaDB 持久化目录，不存在时自动创建。
            embedding_dimension: 当前 embedding 模型的向量维度。
        """
        try:
            import chromadb
        except ImportError as exc:
            raise ImportError(
                "chromadb 未安装，请执行: pip install chromadb>=0.5.0"
            ) from exc

        self._chromadb = chromadb
        path.mkdir(parents=True, exist_ok=True)
        self._path = path
        self._embedding_dimension = embedding_dimension
        self._collection_name = f"documents_d{embedding_dimension}"
        self._client = chromadb.PersistentClient(path=str(path))
        self._collection = self._open_collection()
        logger.info(
            "ChromaVectorStore 初始化完成，路径: %s，collection: %s，条目数: %d",
            path,
            self._collection_name,
            self._collection.count(),
        )

    def _open_collection(self):
        return self._client.get_or_create_collection(
            name=self._collection_name,
            metadata={"hnsw:space": "cosine"},
        )

    def _recreate_collection(self) -> None:
        """删除并重建 collection（用于向量维度变更后的自愈）。"""
        logger.warning(
            "重建 Chroma collection %s（维度 %d）",
            self._collection_name,
            self._embedding_dimension,
        )
        try:
            self._client.delete_collection(self._collection_name)
        except Exception:
            pass
        self._collection = self._open_collection()

    # ── 写操作 ────────────────────────────────────────────────────────────────

    def upsert_many(self, items: list[dict[str, Any]]) -> None:
        """批量插入或更新向量条目（幂等操作，id 相同则覆盖）。

        每个 item 必须包含以下字段：
          - id       : str，唯一标识（与 SQLite document_chunks.id 一致）
          - content  : str，原始文本内容（ChromaDB 称为 document）
          - embedding: list[float]，向量表示
          - metadata : dict，包含 user_id、document_id、source_type 等过滤字段

        Args:
            items: 要插入/更新的向量条目列表。
        """
        if not items:
            return

        payload = {
            "ids": [item["id"] for item in items],
            "embeddings": [item["embedding"] for item in items],
            "documents": [item["content"] for item in items],
            "metadatas": [item["metadata"] for item in items],
        }
        try:
            self._collection.upsert(**payload)
        except Exception as exc:
            if not _is_dimension_mismatch(exc):
                raise
            self._recreate_collection()
            self._collection.upsert(**payload)
        logger.debug("upsert_many: 已写入 %d 个 chunk", len(items))

    def delete_by_document(self, document_id: str) -> None:
        """删除指定文档的所有向量条目。

        在文档重新解析（re-parse）前调用，确保向量库不保留旧数据。
        若该文档在向量库中不存在，操作静默成功。

        Args:
            document_id: 要删除的文档 ID。
        """
        try:
            self._collection.delete(where={"document_id": document_id})
            logger.debug("delete_by_document: 已删除文档 %s 的向量条目", document_id)
        except Exception as exc:
            # ChromaDB 在 where 过滤无匹配时通常不抛异常，此处防御性捕获
            logger.warning("delete_by_document 出现意外错误: document_id=%s, %s", document_id, exc)

    # ── 读操作 ────────────────────────────────────────────────────────────────

    def search(
        self,
        query_vector: list[float],
        user_id: str,
        top_k: int = 5,
        source_types: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        """向量相似度检索，返回最相关的文档分块。

        内部使用 ChromaDB 的 HNSW 索引加速检索，同时通过 where 条件过滤用户隔离和类型。

        Args:
            query_vector: 查询向量（维度需与存储向量一致）。
            user_id:      仅返回该用户的文档（多用户隔离）。
            top_k:        最多返回的结果数量。
            source_types: 可选的文档类型过滤（如 ["resume", "jd"]）；
                          为 None 或空列表时不过滤类型。

        Returns:
            按相似度降序排列的结果列表，每项包含：
              id       : chunk ID
              content  : 文本内容
              metadata : 元数据字典
              score    : 余弦相似度（[0, 1]，越高越相关）
        """
        total = self._collection.count()
        # 集合为空时直接返回，避免 ChromaDB 的 InvalidArgumentError
        if total == 0:
            return []

        # 构造 metadata 过滤条件
        # ChromaDB where 子句不支持空 $and，必须根据参数动态选择
        if source_types:
            where: dict[str, Any] = {
                "$and": [
                    {"user_id": {"$eq": user_id}},
                    {"source_type": {"$in": source_types}},
                ]
            }
        else:
            where = {"user_id": {"$eq": user_id}}

        # n_results 不得超过集合总条目数（ChromaDB 限制），实际返回数由过滤后数量决定
        n_results = min(top_k, total)

        try:
            results = self._collection.query(
                query_embeddings=[query_vector],
                n_results=n_results,
                where=where,
                include=["documents", "metadatas", "distances"],
            )
        except Exception as exc:
            if _is_dimension_mismatch(exc):
                logger.warning("查询向量维度不匹配，重建 collection 后返回空结果: %s", exc)
                self._recreate_collection()
                return []
            logger.error("ChromaDB 查询失败: %s", exc)
            return []

        # ChromaDB 返回嵌套列表（一个 query 对应一行），取第一行
        ids = results["ids"][0]
        documents = results["documents"][0]
        metadatas = results["metadatas"][0]
        # distances 是余弦距离（[0, 2]），转换为相似度分数 [0, 1]
        distances = results["distances"][0]

        return [
            {
                "id": chunk_id,
                "content": doc,
                "metadata": meta,
                "score": max(0.0, 1.0 - dist),  # 余弦距离 → 相似度，夹紧到 [0, 1]
            }
            for chunk_id, doc, meta, dist in zip(ids, documents, metadatas, distances)
        ]
