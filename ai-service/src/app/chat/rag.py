"""RAG pipeline: làm sạch lịch sử -> viết lại câu hỏi -> truy xuất -> trả lời có căn cứ."""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Protocol

from .llm import get_llm
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

TOP_K = max(1, min(int(os.getenv("RAG_TOP_K", "4")), 8))
MIN_SCORE = float(os.getenv("RAG_MIN_SCORE", "0.68"))
MAX_HISTORY_MESSAGES = 10
MAX_HISTORY_CHARS = 6000
MAX_STANDALONE_QUERY_CHARS = 500
MAX_CONTEXT_CHARS = 9000


class LLMClient(Protocol):
    async def generate(
        self, system: str, messages: list[dict], max_tokens: int = 800
    ) -> str: ...


def _format_context(hits: list[SearchHit], max_chars: int = MAX_CONTEXT_CHARS) -> str:
    """Giới hạn context để giảm độ trễ và tránh gửi quá nhiều dữ liệu cho LLM."""
    blocks: list[str] = []
    used = 0
    for hit in hits:
        block = f"(Nguồn: {hit.chunk.source}; mục: {hit.chunk.heading})\n{hit.chunk.text}"
        remaining = max_chars - used
        if remaining <= 0:
            break
        if len(block) > remaining:
            if remaining > 120:
                blocks.append(block[:remaining])
            break
        blocks.append(block)
        used += len(block) + 7
    return "\n\n---\n\n".join(blocks)


def _clean_history(history: list[ChatMessage]) -> list[dict]:
    """Chuẩn hóa lịch sử cũ; giữ cả tin user gần nhất vì message hiện tại tách riêng."""
    msgs: list[dict] = []
    total_chars = 0

    for item in history[-MAX_HISTORY_MESSAGES:]:
        content = " ".join(item.content.split()).strip()
        if not content:
            continue
        # Lịch sử không được phép làm phình prompt quá mức.
        remaining = MAX_HISTORY_CHARS - total_chars
        if remaining <= 0:
            break
        content = content[:remaining]
        total_chars += len(content)

        if msgs and msgs[-1]["role"] == item.role:
            msgs[-1]["content"] += "\n" + content
        else:
            msgs.append({"role": item.role, "content": content})

    # Một lịch sử hợp lệ bắt đầu bằng user; loại bỏ assistant mở đầu bất thường.
    while msgs and msgs[0]["role"] != "user":
        msgs.pop(0)
    return msgs


class RAGPipeline:
    def __init__(
        self,
        retriever: Retriever | None = None,
        llm: LLMClient | None = None,
        top_k: int = TOP_K,
        min_score: float = MIN_SCORE,
    ):
        self.retriever = retriever or get_retriever()
        self.llm = llm or get_llm()
        self.top_k = max(1, min(int(top_k), 8))
        self.min_score = float(min_score)

    async def _condense(self, question: str, history: list[dict]) -> str:
        """Viết lại câu hỏi nối tiếp; nếu model lỗi thì vẫn tiếp tục bằng câu hỏi gốc."""
        if not history:
            return question

        hist_text = "\n".join(
            f"{'Khách' if item['role'] == 'user' else 'Bot'}: {item['content']}"
            for item in history
        )
        try:
            out = await self.llm.generate(
                CONDENSE_SYSTEM,
                [{
                    "role": "user",
                    "content": CONDENSE_USER.format(history=hist_text, question=question),
                }],
                max_tokens=120,
            )
            standalone = " ".join((out or "").split()).strip()
            if not standalone:
                return question
            return standalone[:MAX_STANDALONE_QUERY_CHARS]
        except Exception:
            logger.exception("Không viết lại được câu hỏi; sử dụng câu hỏi gốc")
            return question

    async def answer(
        self,
        question: str,
        history: list[ChatMessage] | None = None,
        category: str | None = None,
    ) -> tuple[str, list[SourceChunk]]:
        question = question.strip()
        if not question:
            return FALLBACK_ANSWER, []

        hist = _clean_history(history or [])
        standalone = await self._condense(question, hist)
        logger.info("Bắt đầu truy xuất câu hỏi: %s", standalone[:250])

        try:
            hits = await asyncio.to_thread(
                self.retriever.search, standalone, self.top_k, self.min_score, category
            )
        except Exception:
            logger.exception("Truy xuất knowledge base thất bại")
            raise

        if not hits:
            logger.info("Không tìm thấy nguồn đủ liên quan cho câu hỏi")
            return FALLBACK_ANSWER, []

        context = _format_context(hits)
        user_msg = USER_TEMPLATE.format(context=context, question=question)
        answer = await self.llm.generate(
            SYSTEM_PROMPT,
            hist + [{"role": "user", "content": user_msg}],
            max_tokens=400,
        )

        answer = (answer or "").strip()
        if not answer:
            answer = FALLBACK_ANSWER

        sources = [
            SourceChunk(
                source=hit.chunk.source,
                category=hit.chunk.category,
                heading=hit.chunk.heading,
                score=round(hit.score, 4),
                content=hit.chunk.text,
            )
            for hit in hits
        ]
        return answer, sources
