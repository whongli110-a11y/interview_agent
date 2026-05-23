"""
Embedding 向量化模块。

提供将文本转换为向量表示的抽象接口和具体实现：

  - EmbeddingProvider（抽象基类）
      定义 embed_documents() / embed_query() 接口，
      上层代码（KnowledgeService）只依赖此接口，方便替换实现。

  - HashEmbeddingProvider（mock 实现）
      基于 SHA-256 哈希的确定性向量化，无需 GPU 或网络请求。
      优点：完全本地、零延迟、可重现；
      缺点：无语义相似性，仅用于开发调试，不适合生产环境。

  - OpenAICompatibleEmbeddingProvider（语义向量）
      调用兼容 OpenAI /v1/embeddings 接口的云端或本地服务
      （OpenAI、Azure、Ollama、硅基流动、BGE 网关等）。

生产环境建议：
  EMBEDDING_PROVIDER=openai_compatible
  EMBEDDING_MODEL=text-embedding-3-small  # 或 bge-large-zh-v1.5 等
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import math
from typing import Optional

import httpx

from app.core.config import Settings

logger = logging.getLogger(__name__)

_MAX_RETRIES = 3
_RETRY_BASE_SECONDS = 1.0
# 单次 /embeddings 请求的文本条数上限，避免 payload 过大
_EMBED_BATCH_SIZE = 64


def _embeddings_url(base_url: str) -> str:
    """将配置的 base URL 规范为 OpenAI 兼容的 /embeddings 端点。"""
    url = base_url.rstrip("/")
    if url.endswith("/embeddings"):
        return url
    if url.endswith("/chat/completions"):
        return url[: -len("/chat/completions")] + "/embeddings"
    return f"{url}/embeddings"


class EmbeddingProvider:
    """Embedding 服务抽象基类，定义向量化接口。"""

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """批量将文档文本转换为向量。

        Args:
            texts: 文档文本列表（通常是分块后的段落）。

        Returns:
            与 texts 等长的向量列表，每个向量为 float 列表。
        """
        raise NotImplementedError

    async def embed_query(self, text: str) -> list[float]:
        """将查询文本转换为向量。

        某些模型对查询和文档使用不同的编码方式（如 BGE 的 instruction prefix），
        因此提供独立接口以便子类区分处理。

        Args:
            text: 查询文本。

        Returns:
            查询向量（float 列表）。
        """
        raise NotImplementedError


class HashEmbeddingProvider(EmbeddingProvider):
    """基于哈希签名的 Mock Embedding 实现。

    算法原理：
      1. 对文本分词（中英文混合处理）
      2. 对每个 token 计算 SHA-256 哈希
      3. 将哈希映射到向量维度（取模），确定方向（正/负）并累加
      4. 对结果向量进行 L2 归一化

    此算法产生的向量没有语义相关性，但在相同输入下完全确定，
    方便测试验证端到端流程的正确性。
    """

    def __init__(self, dimension: int = 128) -> None:
        """
        Args:
            dimension: 向量维度，需与 ChromaDB 集合的 embedding 维度一致。
        """
        self.dimension = dimension

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """批量处理：逐条调用 _embed()，无并行优化（适合低并发本地模式）。"""
        return [self._embed(text) for text in texts]

    async def embed_query(self, text: str) -> list[float]:
        """查询向量化：与文档向量化使用相同算法（mock 场景无需区分）。"""
        return self._embed(text)

    def _embed(self, text: str) -> list[float]:
        """核心向量化逻辑：token 哈希累加 + L2 归一化。"""
        vector = [0.0] * self.dimension
        tokens = _tokenize(text)
        for token in tokens:
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            index = int.from_bytes(digest[:4], "big") % self.dimension
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            vector[index] += sign
        norm = math.sqrt(sum(v * v for v in vector)) or 1.0
        return [v / norm for v in vector]


class OpenAICompatibleEmbeddingProvider(EmbeddingProvider):
    """兼容 OpenAI Embeddings API 的语义向量实现。

    请求 POST {base_url}/embeddings，支持批量 input。
    """

    def __init__(self, base_url: str, api_key: str, model: str) -> None:
        self.embeddings_url = _embeddings_url(base_url)
        self.api_key = api_key
        self.model = model

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        vectors: list[list[float]] = []
        for start in range(0, len(texts), _EMBED_BATCH_SIZE):
            batch = texts[start : start + _EMBED_BATCH_SIZE]
            vectors.extend(await self._embed_batch(batch))
        return vectors

    async def embed_query(self, text: str) -> list[float]:
        result = await self._embed_batch([text])
        return result[0]

    async def _embed_batch(self, texts: list[str]) -> list[list[float]]:
        if not self.embeddings_url or not self.api_key:
            raise RuntimeError(
                "语义 Embedding 需要配置 EMBEDDING_BASE_URL/EMBEDDING_API_KEY "
                "或 LLM_BASE_URL/LLM_API_KEY"
            )

        payload = {"model": self.model, "input": texts}
        data = await self._request_embeddings(payload)

        # 按 index 排序，保证与输入 texts 顺序一致
        ordered = sorted(data, key=lambda item: item["index"])
        return [item["embedding"] for item in ordered]

    async def _request_embeddings(self, payload: dict) -> list[dict]:
        last_exc: Optional[Exception] = None
        for attempt in range(_MAX_RETRIES):
            try:
                async with httpx.AsyncClient(timeout=60) as client:
                    response = await client.post(
                        self.embeddings_url,
                        headers={"Authorization": f"Bearer {self.api_key}"},
                        json=payload,
                    )
                    response.raise_for_status()
                body = response.json()
                if "data" not in body:
                    raise ValueError(f"Embeddings 响应缺少 data 字段: {list(body.keys())}")
                return body["data"]

            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code
                logger.warning(
                    "Embedding API HTTP 错误 (attempt %d/%d): %d — %s",
                    attempt + 1,
                    _MAX_RETRIES,
                    status,
                    exc.response.text[:200],
                )
                if status < 500:
                    raise
                last_exc = exc

            except httpx.RequestError as exc:
                logger.warning(
                    "Embedding API 网络错误 (attempt %d/%d): %s",
                    attempt + 1,
                    _MAX_RETRIES,
                    exc,
                )
                last_exc = exc

            if attempt < _MAX_RETRIES - 1:
                wait = _RETRY_BASE_SECONDS * (2**attempt)
                await asyncio.sleep(wait)

        raise RuntimeError(
            f"Embedding API 已重试 {_MAX_RETRIES} 次仍失败: {last_exc}"
        ) from last_exc


def _tokenize(text: str) -> list[str]:
    """简单分词：将英文按非字母数字拆分，中文字符按单字分词。"""
    normalized = text.lower()
    words: list[str] = []
    current: list[str] = []

    for char in normalized:
        if char.isalnum() or "\u4e00" <= char <= "\u9fff":
            current.append(char)
        elif current:
            words.append("".join(current))
            current = []

    if current:
        words.append("".join(current))

    return words or [normalized[:64]]


# 常见 embedding 模型的输出维度（用于 Chroma collection 命名与校验）
_KNOWN_EMBEDDING_DIMENSIONS: dict[str, int] = {
    "text-embedding-3-small": 1536,
    "text-embedding-3-large": 3072,
    "text-embedding-ada-002": 1536,
    "openai/text-embedding-3-small": 1536,
    "openai/text-embedding-3-large": 3072,
}


def resolve_embedding_dimension(settings: Settings) -> int:
    """根据 embedding 配置推断向量维度，供 ChromaDB collection 使用。"""
    if settings.embedding_provider.lower() == "mock":
        return settings.embedding_dimension

    model_key = settings.embedding_model.strip().lower()
    if model_key in _KNOWN_EMBEDDING_DIMENSIONS:
        return _KNOWN_EMBEDDING_DIMENSIONS[model_key]
    for name, dim in _KNOWN_EMBEDDING_DIMENSIONS.items():
        if model_key.endswith(name) or name in model_key:
            return dim

    # 未识别的语义模型：依赖 .env 中的 EMBEDDING_DIMENSION（应设为与模型一致）
    if settings.embedding_dimension != 128:
        return settings.embedding_dimension

    logger.warning(
        "未识别 embedding 模型 %r 的维度，默认使用 1536；"
        "若不符请在 .env 设置 EMBEDDING_DIMENSION",
        settings.embedding_model,
    )
    return 1536


def _resolve_embedding_credentials(settings: Settings) -> tuple[str, str]:
    """解析 Embedding API 地址与密钥，未单独配置时回退到 LLM 配置。"""
    base_url = settings.embedding_base_url or settings.llm_base_url
    api_key = settings.embedding_api_key or settings.llm_api_key
    return base_url, api_key


def get_embedding_provider(settings: Settings) -> EmbeddingProvider:
    """根据配置返回对应的 EmbeddingProvider 实例。

    EMBEDDING_PROVIDER=mock              → HashEmbeddingProvider（本地哈希，无语义）
    EMBEDDING_PROVIDER=openai_compatible → OpenAICompatibleEmbeddingProvider（语义向量）
    EMBEDDING_PROVIDER=openai            → 同上（别名）
    """
    provider = settings.embedding_provider.lower()
    if provider == "mock":
        return HashEmbeddingProvider(settings.embedding_dimension)

    if provider in ("openai_compatible", "openai"):
        base_url, api_key = _resolve_embedding_credentials(settings)
        return OpenAICompatibleEmbeddingProvider(
            base_url=base_url,
            api_key=api_key,
            model=settings.embedding_model,
        )

    logger.warning(
        "未知 embedding_provider=%r，回退为 mock",
        settings.embedding_provider,
    )
    return HashEmbeddingProvider(settings.embedding_dimension)
