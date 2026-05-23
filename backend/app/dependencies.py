"""
FastAPI 依赖注入工厂函数。

通过 lru_cache 保证每个服务在进程生命周期内只创建一次实例（单例模式）。
各服务的依赖关系：
  get_settings()
    └── get_repository()
    └── get_knowledge_service()
          ├── get_repository()
          ├── ChromaVectorStore（直接实例化）
          └── get_embedding_provider()
    └── get_interview_runtime()
          ├── get_repository()
          ├── get_knowledge_service()
          └── get_llm_provider()
"""

from functools import lru_cache

from app.core.config import get_settings
from app.db.repository import Repository
from app.services.embedding_provider import get_embedding_provider, resolve_embedding_dimension
from app.services.knowledge_service import KnowledgeService
from app.services.llm_provider import get_llm_provider
from app.services.vector_store import ChromaVectorStore


@lru_cache
def get_repository() -> Repository:
    """返回全局唯一的 SQLite Repository 实例。"""
    return Repository(get_settings().database_path)


@lru_cache
def get_knowledge_service() -> KnowledgeService:
    """返回全局唯一的 KnowledgeService 实例，注入 ChromaDB 向量存储。"""
    settings = get_settings()
    return KnowledgeService(
        repo=get_repository(),
        vector_store=ChromaVectorStore(
            settings.chroma_db_path,
            embedding_dimension=resolve_embedding_dimension(settings),
        ),
        embedding_provider=get_embedding_provider(settings),
        settings=settings,
    )


@lru_cache
def get_interview_runtime():
    """返回全局唯一的 InterviewRuntime 实例。

    延迟导入 InterviewRuntime 避免循环依赖（agents 模块依赖 services 模块）。
    """
    from app.agents.graph import InterviewRuntime

    return InterviewRuntime(
        repo=get_repository(),
        knowledge_service=get_knowledge_service(),
        llm=get_llm_provider(get_settings()),
        settings=get_settings(),
    )
