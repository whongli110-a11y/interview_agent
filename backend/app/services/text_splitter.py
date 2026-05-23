"""
文本清洗与分块模块。

提供两个公开函数：
  - clean_text(text)         清洗原始提取文本（去控制字符、压缩空白）
  - split_text(text, ...)    将清洗后的文本按语义边界分割为适合向量化的分块

分块策略：
  1. 优先按 Markdown 标题（#、##、###、####）和有序列表项分割为段落（section）
  2. 若段落仍超过 chunk_size，进一步按字符滑动窗口切分（含 overlap 重叠）
  3. 若段落小于 chunk_size，合并到同一分块直到接近上限

这种分层策略能够尽量保留语义完整性，同时控制每个分块的长度。
"""

import re


def clean_text(text: str) -> str:
    """清洗原始文本，去除控制字符并规范化空白。

    处理步骤：
      1. 去除 NULL 字节（PDF 解析可能产生）
      2. 将连续空格/制表符压缩为单个空格（保留换行）
      3. 将连续 3 行以上的空行压缩为 2 行

    Args:
        text: 原始提取文本。

    Returns:
        清洗后的文本字符串。
    """
    text = text.replace("\x00", "")              # 去除 NULL 字节
    text = re.sub(r"[ \t]+", " ", text)          # 压缩水平空白
    text = re.sub(r"\n{3,}", "\n\n", text)       # 限制连续空行最多 2 行
    return text.strip()


def split_text(text: str, chunk_size: int = 900, overlap: int = 120) -> list[str]:
    """将文本分割为适合向量化的分块列表。

    Args:
        text:       清洗后的纯文本（通常已经过 clean_text 处理）。
        chunk_size: 单个分块的最大字符数（默认 900，适合大多数中文 embedding 模型的 token 限制）。
        overlap:    相邻分块的重叠字符数（默认 120），保证跨块的语义连贯性。

    Returns:
        分块字符串列表，每项去除首尾空白，空字符串已过滤。
    """
    text = clean_text(text)
    if not text:
        return []

    # 按 Markdown 标题或有序列表项（前向断言）切分为段落
    # 使用 (?=...) 保留匹配位置的分隔符（标题行保留在后续段落中）
    sections = re.split(r"(?=\n#{1,4}\s+|\n\d+[.、]\s*)", text)
    chunks: list[str] = []
    buffer = ""  # 当前正在积累的分块内容

    for section in sections:
        section = section.strip()
        if not section:
            continue

        if len(buffer) + len(section) <= chunk_size:
            # 段落可以合并到当前 buffer，保持语义完整性
            buffer = f"{buffer}\n\n{section}".strip()
            continue

        # buffer 已满：先将 buffer 刷出，再处理当前 section
        if buffer:
            chunks.extend(_split_long(buffer, chunk_size, overlap))
        buffer = section

    # 处理最后一个 buffer
    if buffer:
        chunks.extend(_split_long(buffer, chunk_size, overlap))

    # 过滤空分块（理论上不应存在，防御性处理）
    return [chunk for chunk in chunks if chunk.strip()]


def _split_long(text: str, chunk_size: int, overlap: int) -> list[str]:
    """将超出 chunk_size 的长文本按滑动窗口切分为多个分块。

    若文本长度在 chunk_size 以内，直接返回单元素列表。
    否则以 chunk_size 为窗口、(chunk_size - overlap) 为步长向后滑动，
    保证相邻分块之间有 overlap 个字符的重叠，减少语义在边界处的断裂。

    Args:
        text:       待分割的文本片段。
        chunk_size: 分块最大字符数。
        overlap:    分块重叠字符数。

    Returns:
        分块列表（每项已去除首尾空白）。
    """
    if len(text) <= chunk_size:
        return [text]

    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunks.append(text[start:end].strip())
        if end == len(text):
            break
        # 下一个分块的起始位置向后移动（步长 = chunk_size - overlap）
        # 使用 max(..., start + 1) 保证至少前进 1 个字符，避免无限循环
        start = max(end - overlap, start + 1)
    return chunks
