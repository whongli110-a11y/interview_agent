"""
知识库搜索 API（/api/knowledge）。

提供向量相似度搜索接口，供前端和 Agent 检索相关文档分块。
实际检索由 KnowledgeService.search() 完成，后者底层使用 ChromaDB。
"""

from fastapi import APIRouter, Depends

from app.dependencies import get_knowledge_service
from app.schemas.document import KnowledgeSearchRequest, KnowledgeSearchResponse
from app.services.knowledge_service import KnowledgeService

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.post("/search", response_model=KnowledgeSearchResponse)
async def search_knowledge(
    request: KnowledgeSearchRequest,
    service: KnowledgeService = Depends(get_knowledge_service),
):
    """在向量知识库中搜索与 query 最相关的文档分块。

    请求参数：
      - user_id:      用户 ID（数据隔离）
      - query:        自然语言查询文本
      - source_types: 可选，限定检索的文档类型（resume / jd / project / other）
      - top_k:        返回结果数量上限（1-20，默认 5）

    返回结果按相似度降序排列，每项包含 content、score 和 metadata。
    """
    results = await service.search(
        user_id=request.user_id,
        query=request.query,
        source_types=request.source_types,
        top_k=request.top_k,
    )
    return {"results": results}
