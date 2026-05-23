"""
FastAPI 应用入口。

create_app() 负责：
  1. 注册 CORS 中间件
  2. 挂载各业务路由
  3. 通过 lifespan 在启动时初始化数据目录
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import documents, interviews, knowledge
from app.core.config import get_settings


def _setup_langsmith(settings) -> None:
    """若启用 LangSmith，通过环境变量激活全链路追踪。

    @traceable 在调用时检查这些环境变量，因此在进程启动阶段设置即可。
    两套前缀均设置以兼容旧版（LANGCHAIN_*）与新版（LANGSMITH_*）SDK。
    """
    if not (settings.langsmith_tracing and settings.langsmith_api_key):
        return

    os.environ.setdefault("LANGCHAIN_TRACING_V2", "true")
    os.environ.setdefault("LANGSMITH_TRACING", "true")
    os.environ.setdefault("LANGCHAIN_API_KEY", settings.langsmith_api_key)
    os.environ.setdefault("LANGSMITH_API_KEY", settings.langsmith_api_key)
    os.environ.setdefault("LANGCHAIN_PROJECT", settings.langsmith_project)
    os.environ.setdefault("LANGSMITH_PROJECT", settings.langsmith_project)
    os.environ.setdefault("LANGCHAIN_ENDPOINT", settings.langsmith_endpoint)
    os.environ.setdefault("LANGSMITH_ENDPOINT", settings.langsmith_endpoint)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理：在 startup 阶段初始化数据目录并配置 LangSmith。"""
    settings = get_settings()
    settings.ensure_dirs()
    _setup_langsmith(settings)
    yield
    # shutdown 阶段如有需要可在此处释放资源（如关闭数据库连接池）


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Interviewer Agent Backend",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS：local 开发允许所有来源；生产环境通过 CORS_ALLOWED_ORIGINS 配置白名单
    allowed_origins = ["*"] if settings.app_env == "local" else settings.cors_allowed_origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(documents.router)
    app.include_router(knowledge.router)
    app.include_router(interviews.router)

    @app.get("/health", tags=["infra"])
    async def health():
        """健康检查端点，供负载均衡器 / CI 探活使用。"""
        return {"status": "ok"}

    return app


app = create_app()
