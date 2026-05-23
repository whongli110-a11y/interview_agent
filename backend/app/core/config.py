"""
应用全局配置模块。

使用 pydantic-settings 读取 .env 文件中的环境变量，
所有路径均基于 backend/ 目录的绝对位置计算，
避免因工作目录不同导致路径错误或重复创建嵌套目录。
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/ 目录的绝对路径：config.py 位于 backend/app/core/，parents[2] = backend/
_BACKEND_ROOT = Path(__file__).resolve().parents[2]
# 统一数据目录，所有运行时文件都存放在此处
_DATA_DIR = _BACKEND_ROOT / "data"


class Settings(BaseSettings):
    # ── 运行环境 ──────────────────────────────────────────────────────────────
    app_env: str = "local"          # local | production

    # ── 数据存储路径（使用绝对路径，支持从任意目录启动 uvicorn）──────────────────
    database_path: Path = _DATA_DIR / "app.db"
    upload_dir: Path = _DATA_DIR / "uploads"
    parsed_dir: Path = _DATA_DIR / "parsed"
    # ChromaDB 持久化目录（替换原来的 JSON 向量文件）
    chroma_db_path: Path = _DATA_DIR / "chroma_db"
    checkpoint_db_path: Path = _DATA_DIR / "checkpoints.sqlite"

    # ── LLM 接入配置 ──────────────────────────────────────────────────────────
    llm_provider: str = "mock"       # mock | openai_compatible
    llm_base_url: str = ""           # 兼容 OpenAI 接口的 base URL
    llm_api_key: str = ""
    llm_model: str = "mock-interviewer"

    # ── Embedding 配置 ────────────────────────────────────────────────────────
    embedding_provider: str = "mock"  # mock | openai_compatible | openai
    embedding_dimension: int = 128    # hash embedding 维度；语义模型由 API 决定维度
    embedding_model: str = "text-embedding-3-small"
    # 留空则复用 LLM_BASE_URL / LLM_API_KEY（同一兼容接口网关时）
    embedding_base_url: str = ""
    embedding_api_key: str = ""

    # ── LangSmith 可观测性 ────────────────────────────────────────────────────
    langsmith_tracing: bool = False          # 设为 True 开启全链路追踪
    langsmith_api_key: str = ""
    langsmith_project: str = "interviewer-agent"
    langsmith_endpoint: str = "https://api.smith.langchain.com"

    # ── 其他 ──────────────────────────────────────────────────────────────────
    max_upload_mb: int = 10
    default_user_id: str = "default"
    # 允许跨域的源地址列表（非 local 环境需显式配置）
    cors_allowed_origins: list[str] = []

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    def ensure_dirs(self) -> None:
        """创建所有运行时所需的数据目录（若不存在则自动创建）。

        此方法应在应用启动时（lifespan）调用，而非在配置初始化时调用，
        以避免 import 阶段产生不必要的文件系统副作用（影响测试隔离）。
        """
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.parsed_dir.mkdir(parents=True, exist_ok=True)
        self.chroma_db_path.mkdir(parents=True, exist_ok=True)
        self.checkpoint_db_path.parent.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    """返回全局唯一的 Settings 实例（通过 lru_cache 保证单例）。

    注意：此函数不再调用 ensure_dirs()，目录创建由 main.py 的 lifespan 负责。
    """
    return Settings()
