"""RAG pipeline: viết lại câu hỏi -> truy xuất -> sinh câu trả lời kèm nguồn.

Phụ thuộc: anthropic (LLM mặc định). Có thể thay bằng LLM khác bằng cách
implement protocol `LLMClient`.

Ghi chú học tập:
RAG - Retrieval Augmented Generation - tăng cường tạo nội dung bằng truy xuất
-- > Đưa tài liệu cho model đọc trước khi trả lời
Giai đoạn 1: Embedding - Toán học của ý nghĩa
    Độ đo khoảng cách cosine similarity - đo khoảng cách giữa 2 vector
Giai đoạn 2: Vector database
Giai đoạn 3: Retrieval
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Protocol

from .prompts import (
    CONDENSE_SYSTEM,
    CONDENSE_USER,
    FALLBACK_ANSWER,
    SYSTEM_PROMPT,
    USER_TEMPLATE,
)
from .retriever import Retriever, SearchHit, get_retriever
from .schemas import ChatMessage, SourceChunk

logger = logging.getLogger(__name__)

TOP_K = int(os.getenv("RAG_TOP_K", "4"))
# Điểm cosine của e5 thường nằm trong khoảng 0.7-0.9 -> cần tinh chỉnh theo dữ liệu thật
MIN_SCORE = float(os.getenv("RAG_MIN_SCORE", "0.75"))
MAX_HISTORY_MESSAGES = 6


class LLMClient(Protocol):
    async def generate(
        self, system: str, messages: list[dict], max_tokens: int = 800
    ) -> str: ...


class AnthropicLLM:
    def __init__(self, model: str | None = None):
        from anthropic import AsyncAnthropic

        self.client = AsyncAnthropic()  # đọc ANTHROPIC_API_KEY từ env
        self.model = model or os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5-5")

    async def generate(
        self, system: str, messages: list[dict], max_tokens: int = 800
    ) -> str:
        resp = await self.client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
        )
        return "".join(b.text for b in resp.content if b.type == "text").strip()


def _format_context(hits: list[SearchHit]) -> str:
    return "\n\n---\n\n".join(f"(Nguồn: {h.chunk.source})\n{h.chunk.text}" for h in hits)


def _clean_history(history: list[ChatMessage]) -> list[dict]:
    """Lấy N tin gần nhất, đảm bảo bắt đầu bằng 'user' và xen kẽ vai trò."""
    msgs = [{"role": m.role, "content": m.content} for m in history[-MAX_HISTORY_MESSAGES:]]
    while msgs and msgs[0]["role"] != "user":
        msgs.pop(0)
    cleaned: list[dict] = []
    for m in msgs:
        if cleaned and cleaned[-1]["role"] == m["role"]:
            cleaned[-1]["content"] += "\n" + m["content"]
        else:
            cleaned.append(m)
    if cleaned and cleaned[-1]["role"] == "user":
        cleaned.pop()  # câu hỏi hiện tại sẽ được thêm sau
    return cleaned


class RAGPipeline:
    def __init__(
        self,
        retriever: Retriever | None = None,
        llm: LLMClient | None = None,
        top_k: int = TOP_K,
        min_score: float = MIN_SCORE,
    ):
        self.retriever = retriever or get_retriever()
        self.llm = llm or AnthropicLLM()
        self.top_k = top_k
        self.min_score = min_score

    async def _condense(self, question: str, history: list[dict]) -> str:
        """Biến câu hỏi nối tiếp ("còn size L thì sao?") thành câu hỏi độc lập để search."""
        if not history:
            return question
        hist_text = "\n".join(
            f"{'Khách' if m['role'] == 'user' else 'Bot'}: {m['content']}" for m in history
        )
        try:
            out = await self.llm.generate(
                CONDENSE_SYSTEM,
                [{"role": "user", "content": CONDENSE_USER.format(history=hist_text, question=question)}],
                max_tokens=150,
            )
            return out or question
        except Exception:  # không để lỗi bước phụ làm hỏng cả luồng
            logger.exception("Condense question thất bại, dùng câu hỏi gốc")
            return question

    async def answer(
        self,
        question: str,
        history: list[ChatMessage] | None = None,
        category: str | None = None,
    ) -> tuple[str, list[SourceChunk]]:
        hist = _clean_history(history or [])
        standalone = await self._condense(question, hist)
        logger.info("Query tìm kiếm: %s", standalone)

        hits = await asyncio.to_thread(
            self.retriever.search, standalone, self.top_k, self.min_score, category
        )
        if not hits:
            return FALLBACK_ANSWER, []

        user_msg = USER_TEMPLATE.format(context=_format_context(hits), question=question)
        answer = await self.llm.generate(SYSTEM_PROMPT, hist + [{"role": "user", "content": user_msg}])

        sources = [
            SourceChunk(
                source=h.chunk.source,
                category=h.chunk.category,
                heading=h.chunk.heading,
                score=round(h.score, 4),
                content=h.chunk.text,
            )
            for h in hits
        ]
        return answer or FALLBACK_ANSWER, sources