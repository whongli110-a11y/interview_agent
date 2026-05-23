"""
统一错误处理工具。

提供结构化的 HTTP 错误响应格式：
  {"error_code": "...", "message": "..."}

使用方式：
  raise http_error("DOCUMENT_NOT_FOUND", "文档不存在", 404)
"""

from fastapi import HTTPException, status


class AppError(Exception):
    """业务逻辑层异常，携带机器可读的 error_code 和人类可读的 message。

    当前主要用于服务层内部传递错误信息，API 层将其转换为 HTTPException。
    """

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


def http_error(
    code: str,
    message: str,
    status_code: int = status.HTTP_400_BAD_REQUEST,
) -> HTTPException:
    """构造带结构化 detail 的 HTTPException，供 API 层直接 raise。

    Args:
        code:        机器可读的错误码（如 "DOCUMENT_NOT_FOUND"），供前端 switch-case。
        message:     人类可读的错误描述（中文）。
        status_code: HTTP 状态码，默认 400。

    Returns:
        FastAPI HTTPException 实例。
    """
    return HTTPException(
        status_code=status_code,
        detail={"error_code": code, "message": message},
    )
