"""
文档解析模块。

支持将以下格式的文件提取为纯文本字符串：
  - .pdf   → 使用 pypdf 逐页提取文本
  - .docx  → 使用 python-docx 提取段落文本
  - .md / .txt → 直接以 UTF-8 读取

提取完成后统一通过 clean_text() 进行规范化处理（去除多余空白、控制字符等）。

注意：本模块中的函数均为同步实现，调用方（knowledge_service.py）
应使用 asyncio.to_thread() 将其提交到线程池，避免阻塞事件循环。
"""

from pathlib import Path

from app.services.text_splitter import clean_text


SUPPORTED_SUFFIXES = {".pdf", ".docx", ".md", ".txt"}


class DocumentParseError(Exception):
    """文档解析失败时抛出，携带可读的错误描述。"""
    pass


def parse_document(path: Path) -> str:
    """解析文件并返回清洗后的纯文本。

    Args:
        path: 待解析文件的绝对路径。

    Returns:
        清洗后的纯文本字符串（保留段落结构，去除多余空白）。

    Raises:
        DocumentParseError: 文件类型不受支持，或依赖库未安装时抛出。
    """
    suffix = path.suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise DocumentParseError(f"不支持的文件类型: {suffix}，仅支持 {SUPPORTED_SUFFIXES}")

    if suffix == ".pdf":
        return clean_text(_parse_pdf(path))
    if suffix == ".docx":
        return clean_text(_parse_docx(path))
    # .md / .txt：直接读取，errors="ignore" 处理编码异常字符
    return clean_text(path.read_text(encoding="utf-8", errors="ignore"))


def _parse_pdf(path: Path) -> str:
    """使用 pypdf 逐页提取 PDF 文本，页间用双换行分隔。"""
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise DocumentParseError("pypdf 未安装，请执行: pip install pypdf") from exc

    reader = PdfReader(str(path))
    # 空页面（extract_text 返回 None）替换为空字符串，避免 join 报错
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n\n".join(pages)


def _parse_docx(path: Path) -> str:
    """使用 python-docx 提取 Word 文档中所有段落的文本，段间用换行分隔。

    注意：仅提取正文段落，表格、页眉页脚中的文本不在范围内。
    """
    try:
        from docx import Document
    except ImportError as exc:
        raise DocumentParseError("python-docx 未安装，请执行: pip install python-docx") from exc

    doc = Document(str(path))
    return "\n".join(paragraph.text for paragraph in doc.paragraphs)
