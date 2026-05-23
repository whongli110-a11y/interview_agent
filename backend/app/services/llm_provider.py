"""
LLM 调用服务层。

提供统一的 chat_json() 接口，用于向 LLM 发送请求并解析 JSON 响应。
支持两种提供商：
  - MockLLMProvider         : 直接返回 fallback，无需 API Key，适合本地开发/测试
  - OpenAICompatibleProvider: 兼容 OpenAI Chat Completions 接口的任意服务
    （OpenAI、Azure OpenAI、DeepSeek、Ollama 等）

健壮性设计：
  - 最多重试 3 次（仅对 5xx 和网络错误），使用指数退避（1s → 2s）
  - JSON 解析失败时记录原始内容并返回 fallback（不抛异常，保证面试流程不中断）
  - 4xx 错误不重试（认证失败、参数错误等），直接返回 fallback
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Optional

import httpx

from app.core.config import Settings

try:
    from langsmith import traceable
except ImportError:
    def traceable(**_kw):  # type: ignore[misc]
        def _d(fn):
            return fn
        return _d

logger = logging.getLogger(__name__)

# 最大重试次数（首次尝试 + 2 次重试 = 共 3 次请求）
_MAX_RETRIES = 3
# 指数退避基数（秒）：第 1 次重试等待 1s，第 2 次等待 2s
_RETRY_BASE_SECONDS = 1.0

def _chat_completions_url(base_url: str) -> str:
    """将配置的 base URL 规范为 OpenAI 兼容的 /chat/completions 端点。"""
    url = base_url.rstrip("/")
    if url.endswith("/chat/completions"):
        return url
    if url.endswith("/embeddings"):
        return url[: -len("/embeddings")] + "/chat/completions"
    # DeepSeek 等仅配置域名时补全 /v1（OpenRouter 已含 /api/v1）
    if not url.endswith("/v1") and "/api/" not in url:
        url = f"{url}/v1"
    return f"{url}/chat/completions"


class LLMProvider:
    """LLM 调用抽象基类，定义 chat_json 接口。"""

    async def chat_json(self, system: str, user: str, fallback: dict[str, Any]) -> dict[str, Any]:
        """向 LLM 发送 system + user 消息，解析并返回 JSON 格式的响应。

        Args:
            system:   系统提示词（角色设定、输出格式要求等）。
            user:     用户消息（面试上下文、候选人回答等）。
            fallback: 当 LLM 不可用或响应无法解析时的默认返回值。

        Returns:
            LLM 返回的 JSON 对象；失败时返回 fallback。
        """
        raise NotImplementedError


class MockLLMProvider(LLMProvider):
    """Mock 实现：直接返回 fallback，不发起任何网络请求。

    用于本地开发、CI 测试和 LLM_PROVIDER=mock 场景。
    """

    async def chat_json(self, system: str, user: str, fallback: dict[str, Any]) -> dict[str, Any]:
        return fallback


class OpenAICompatibleProvider(LLMProvider):
    """兼容 OpenAI Chat Completions API 的 LLM 调用实现。

    支持任何实现了 /chat/completions 接口的服务，
    通过 response_format={"type": "json_object"} 强制要求 JSON 输出。
    """

    def __init__(self, base_url: str, api_key: str, model: str) -> None:
        """
        Args:
            base_url: API 基础地址（不含路径），例如 https://api.openai.com/v1
            api_key:  Bearer Token 鉴权密钥。
            model:    模型名称，例如 gpt-4o、deepseek-chat 等。
        """
        self.chat_url = _chat_completions_url(base_url)
        self.api_key = api_key
        self.model = model

    async def chat_json(self, system: str, user: str, fallback: dict[str, Any]) -> dict[str, Any]:
        """发起 LLM 请求，含指数退避重试和详细错误日志。

        重试策略：
          - 5xx / 网络错误：重试，最多 _MAX_RETRIES 次
          - 4xx 错误：不重试（认证、参数等客户端错误无法通过重试解决）
          - JSON 解析失败：不重试，记录原始内容后返回 fallback

        Args:
            system:   系统提示词。
            user:     用户消息（JSON 序列化的面试上下文）。
            fallback: 所有重试失败后的默认返回值。

        Returns:
            解析后的 JSON 字典；失败时返回 fallback。
        """
        if not self.chat_url or not self.api_key:
            logger.warning("LLM base_url 或 api_key 未配置，返回 fallback")
            return fallback

        # 内部可追踪函数：仅暴露 system/user/model 给 LangSmith（不含 api_key）
        @traceable(run_type="llm", name=f"llm:{self.model}")
        async def _invoke(system: str, user: str, model: str) -> str | None:
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.3,
            }
            last_exc: Optional[Exception] = None
            for attempt in range(_MAX_RETRIES):
                try:
                    async with httpx.AsyncClient(timeout=45) as client:
                        response = await client.post(
                            self.chat_url,
                            headers={"Authorization": f"Bearer {self.api_key}"},
                            json=payload,
                        )
                        response.raise_for_status()
                    return response.json()["choices"][0]["message"]["content"]

                except httpx.HTTPStatusError as exc:
                    status = exc.response.status_code
                    body_preview = exc.response.text[:200]
                    logger.warning(
                        "LLM API HTTP 错误 (attempt %d/%d): %d — %s",
                        attempt + 1, _MAX_RETRIES, status, body_preview,
                    )
                    if status < 500:
                        logger.error("LLM API 4xx 错误，不再重试，返回 fallback")
                        return None
                    last_exc = exc

                except httpx.RequestError as exc:
                    logger.warning(
                        "LLM API 网络错误 (attempt %d/%d): %s",
                        attempt + 1, _MAX_RETRIES, exc,
                    )
                    last_exc = exc

                if attempt < _MAX_RETRIES - 1:
                    wait = _RETRY_BASE_SECONDS * (2 ** attempt)
                    logger.info("等待 %.1f 秒后重试...", wait)
                    await asyncio.sleep(wait)

            logger.error(
                "LLM API 已重试 %d 次仍失败，返回 fallback。最后错误: %s",
                _MAX_RETRIES, last_exc,
            )
            return None

        raw_content = await _invoke(system=system, user=user, model=self.model)
        if raw_content is None:
            return fallback
        try:
            return json.loads(raw_content)
        except json.JSONDecodeError:
            logger.warning(
                "LLM 响应非 JSON，使用 fallback。内容前 300 字符: %.300s",
                raw_content,
            )
            return fallback


def get_llm_provider(settings: Settings) -> LLMProvider:
    """根据配置返回对应的 LLM Provider 实例。

    LLM_PROVIDER=mock              → MockLLMProvider（默认，无需 API Key）
    LLM_PROVIDER=openai_compatible   → OpenAICompatibleProvider
    LLM_PROVIDER=deepseek / openrouter 等 → 同上（别名）
    """
    if settings.llm_provider.lower() == "mock":
        return MockLLMProvider()
    return OpenAICompatibleProvider(
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
        model=settings.llm_model,
    )
