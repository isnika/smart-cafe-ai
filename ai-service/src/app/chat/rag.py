"""RAG pipeline: làm sạch lịch sử -> viết lại câu hỏi -> truy xuất -> trả lời có căn cứ."""
from __future__ import annotations

import asyncio
import logging
import os
import re
from typing import Protocol

from .context import build_conversation_context
from .intent import PRODUCT_INTENTS, Intent, classify_intent, fallback_for_intent
from .llm import ExtractiveLLM, get_llm
from .normalize import (
    canonicalize_query,
    contextualize_followup,
    fold_text,
    needs_llm_rewrite,
    search_tokens,
)
from .prompts import (
    ACKNOWLEDGEMENT_ANSWER,
    CONDENSE_SYSTEM,
    CONDENSE_USER,
    CHITCHAT_ANSWER,
    COMPLAINT_ANSWER,
    COMPLAINT_REPEAT_ANSWER,
    FALLBACK_ANSWER,
    GREETING_ANSWER,
    NEGATION_ANSWER,
    OUT_OF_SCOPE_ANSWER,
    SYSTEM_PROMPT,
    USER_TEMPLATE,
)
from .retriever import Retriever, SearchHit, get_retriever
from .response import answer_prices_are_grounded, sanitize_generated_answer
from .schemas import ChatMessage, SourceChunk

logger = logging.getLogger(__name__)

TOP_K = max(1, min(int(os.getenv("RAG_TOP_K", "5")), 8))
MIN_SCORE = float(os.getenv("RAG_MIN_SCORE", "0.58"))
MAX_HISTORY_MESSAGES = 10
MAX_HISTORY_CHARS = 3200
MAX_STANDALONE_QUERY_CHARS = 500
MAX_CONTEXT_CHARS = 4800

# Các intent fact lookup có thể format trực tiếp từ context. Việc không gọi
# model sinh cho nhóm này giảm latency/token và giữ nguyên các điều kiện như
# "nếu quán hỗ trợ" thay vì để LLM vô tình khẳng định quá mức.
DIRECT_ANSWER_INTENTS = frozenset({
    Intent.PRODUCT_AVAILABILITY,
    Intent.PRODUCT_PRICE,
    Intent.PRODUCT_DETAIL,
    Intent.PRODUCT_INFO,
    Intent.PRODUCT_INTEREST,
    Intent.CUSTOMIZE_DRINK,
    Intent.OPENING_HOURS,
    Intent.WIFI_QUERY,
    Intent.LOCATION_QUERY,
    Intent.STORE_INFO,
    Intent.SERVICE_QUERY,
    Intent.ORDER_INTENT,
    Intent.ORDER_ONLINE,
    Intent.ORDER_STATUS,
    Intent.DELIVERY_QUERY,
    Intent.PAYMENT_QUERY,
    Intent.PROMOTION_QUERY,
    Intent.CONTACT_QUERY,
    Intent.POLICY_QUERY,
    Intent.MENU_QUERY,
    Intent.PRODUCT_RECOMMENDATION,
    Intent.PRODUCT_FILTER,
})


class LLMClient(Protocol):
    async def generate(
        self, system: str, messages: list[dict], max_tokens: int = 800
    ) -> str: ...


def _format_context(hits: list[SearchHit], max_chars: int = MAX_CONTEXT_CHARS) -> str:
    """Giới hạn context để giảm độ trễ và tránh gửi quá nhiều dữ liệu cho LLM."""
    blocks: list[str] = []
    used = 0
    for hit in hits:
        block = hit.chunk.text
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


def _deduplicate_hits(hits: list[SearchHit]) -> list[SearchHit]:
    """Loại chunk gần trùng để giảm context và token mà không cần reranker."""
    selected: list[SearchHit] = []
    selected_tokens: list[set[str]] = []
    for hit in hits:
        tokens = set(search_tokens(hit.chunk.text))
        duplicated = False
        for previous in selected_tokens:
            union = tokens | previous
            similarity = len(tokens & previous) / len(union) if union else 1.0
            if similarity >= 0.88:
                duplicated = True
                break
        if not duplicated:
            selected.append(hit)
            selected_tokens.append(tokens)
    return selected


def _clean_history(history: list[ChatMessage]) -> list[dict]:
    """Giữ các lượt mới nhất trong ngân sách; không làm rơi context gần nhất."""
    newest_first: list[dict] = []
    remaining = MAX_HISTORY_CHARS
    for item in reversed(history[-MAX_HISTORY_MESSAGES:]):
        content = " ".join(item.content.split()).strip()
        if not content:
            continue
        if remaining <= 0:
            break
        content = content[:remaining]
        remaining -= len(content)
        newest_first.append({"role": item.role, "content": content})

    msgs: list[dict] = []
    for item in reversed(newest_first):
        role, content = item["role"], item["content"]

        if msgs and msgs[-1]["role"] == role:
            msgs[-1]["content"] += "\n" + content
        else:
            msgs.append({"role": role, "content": content})

    # Một lịch sử hợp lệ bắt đầu bằng user; loại bỏ assistant mở đầu bất thường.
    while msgs and msgs[0]["role"] != "user":
        msgs.pop(0)
    return msgs


def _last_assistant_answer(history: list[dict]) -> str:
    for item in reversed(history):
        if item.get("role") == "assistant":
            return str(item.get("content", "")).strip()
    return ""


def _last_meaningful_user_question(history: list[dict]) -> str:
    """Lấy câu hỏi nghiệp vụ gần nhất, bỏ các lượt ok/no/xác nhận ngắn."""
    ignored = {
        Intent.AFFIRMATION,
        Intent.NEGATION,
        Intent.CONFIRMATION,
        Intent.CHITCHAT,
        Intent.COMPLAINT,
    }
    for item in reversed(history):
        if item.get("role") != "user":
            continue
        content = str(item.get("content", "")).strip()
        if content and classify_intent(content).intent not in ignored:
            return content
    return ""


def _looks_like_order_code(value: str) -> bool:
    compact = value.strip()
    return bool(
        re.fullmatch(r"[A-Za-z0-9-]{6,24}", compact)
        and re.search(r"\d", compact)
    )


def _order_code_answer(order_code: str) -> str:
    return (
        f"Mình đã nhận mã đơn {order_code.strip()}. Tuy nhiên chatbot chưa kết nối hệ thống "
        "đơn hàng để tra cứu; bạn vui lòng gửi mã này qua kênh đã đặt đơn hoặc cho nhân viên "
        "tại quầy để được kiểm tra trực tiếp nhé."
    )


def _intent_fallback(intent: Intent, history: list[dict]) -> str:
    return fallback_for_intent(intent, _last_assistant_answer(history))


class RAGPipeline:
    def __init__(
        self,
        retriever: Retriever | None = None,
        llm: LLMClient | None = None,
        fallback_llm: LLMClient | None = None,
        top_k: int = TOP_K,
        min_score: float = MIN_SCORE,
    ):
        self.retriever = retriever or get_retriever()
        self.llm = llm or get_llm()
        self.fallback_llm = fallback_llm or ExtractiveLLM()
        self.top_k = max(1, min(int(top_k), 8))
        self.min_score = float(min_score)
        self.product_names = tuple(sorted({
            chunk.heading.split(" > ")[-1]
            for chunk in getattr(self.retriever, "chunks", [])
            if chunk.document_type == "product" and "Mã món:" in chunk.text
        }, key=len, reverse=True))

    async def _condense(self, question: str, history: list[dict]) -> str:
        """Viết lại câu hỏi nối tiếp; nếu model lỗi thì vẫn tiếp tục bằng câu hỏi gốc."""
        if not history:
            return question

        local_query = contextualize_followup(question, history)
        if local_query:
            return local_query[:MAX_STANDALONE_QUERY_CHARS]
        if not needs_llm_rewrite(question):
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
        conversation = build_conversation_context(hist, question, self.product_names)
        decision = classify_intent(question)
        confirming_previous = False
        normalized_question = canonicalize_query(question)
        logger.info(
            "Phân loại chat (intent=%s, confidence=%.2f, rule=%s, normalized_query=%r)",
            decision.intent.value,
            decision.confidence,
            decision.matched_rule,
            normalized_question[:200],
        )
        if decision.intent is Intent.GREETING:
            return GREETING_ANSWER, []
        if decision.intent is Intent.CHITCHAT:
            return CHITCHAT_ANSWER, []
        if decision.intent is Intent.NEGATION:
            return NEGATION_ANSWER, []
        if decision.intent is Intent.COMPLAINT:
            previous = _last_assistant_answer(hist)
            answer = COMPLAINT_REPEAT_ANSWER if previous == COMPLAINT_ANSWER else COMPLAINT_ANSWER
            return answer, []
        if decision.intent is Intent.UNKNOWN and decision.matched_rule == "out-of-scope":
            return OUT_OF_SCOPE_ANSWER, []

        if (
            conversation.pending_intent in {Intent.ORDER_STATUS, Intent.POLICY_QUERY}
            and _looks_like_order_code(question)
        ):
            logger.info(
                "Đã nhận slot mã đơn (pending_intent=%s); không gọi retrieval/LLM",
                conversation.pending_intent.value,
            )
            return _order_code_answer(question), []

        if decision.intent is Intent.AFFIRMATION:
            if (
                conversation.pending_intent is Intent.PRODUCT_PRICE
                and conversation.current_product
            ):
                standalone = f"{conversation.current_product} giá bao nhiêu?"
                decision = type(decision)(
                    conversation.pending_intent,
                    0.99,
                    "confirmed-pending-question",
                )
            else:
                logger.info(
                    "Xác nhận ngắn không có hành động chờ; trả lời acknowledgement (candidates=%s)",
                    conversation.candidate_products,
                )
                return ACKNOWLEDGEMENT_ANSWER, []
        elif decision.intent is Intent.CONFIRMATION:
            previous_assistant = conversation.last_assistant_message or ""
            if conversation.current_product and (
                "gia" in set(search_tokens(previous_assistant))
                or re.search(r"\d[\d.]*\s*(?:đ|vnd|đồng)", previous_assistant, re.I)
            ):
                standalone = f"{conversation.current_product} giá bao nhiêu?"
                decision = type(decision)(Intent.PRODUCT_PRICE, 0.99, "verify-grounded-price")
            else:
                previous_question = _last_meaningful_user_question(hist)
                previous_decision = classify_intent(previous_question) if previous_question else None
                if not previous_decision or previous_decision.intent in {Intent.UNKNOWN, Intent.FOLLOW_UP}:
                    return _intent_fallback(Intent.CONFIRMATION, hist), []
                standalone = previous_question
                decision = type(decision)(
                    previous_decision.intent,
                    0.95,
                    "verify-previous-grounded-answer",
                )
                if (
                    decision.intent in PRODUCT_INTENTS
                    and conversation.current_product
                    and fold_text(conversation.current_product) not in fold_text(standalone)
                ):
                    standalone = f"{conversation.current_product} {standalone}"
            confirming_previous = True
        else:
            # Intent business/policy rõ ràng là một chuyển chủ đề độc lập. Chỉ dùng
            # history để rewrite câu về sản phẩm hoặc câu thật sự mơ hồ/follow-up.
            if decision.intent in PRODUCT_INTENTS or decision.intent in {Intent.UNKNOWN, Intent.FOLLOW_UP}:
                standalone = await self._condense(question, hist)
            else:
                standalone = question
        if (
            decision.intent in PRODUCT_INTENTS
            and conversation.current_product
            and conversation.pending_question
            and fold_text(conversation.current_product) not in fold_text(standalone)
        ):
            standalone = f"{conversation.current_product} {standalone}"[:MAX_STANDALONE_QUERY_CHARS]
        if decision.intent in {Intent.UNKNOWN, Intent.FOLLOW_UP} and standalone != question:
            contextual_decision = classify_intent(standalone)
            if contextual_decision.intent not in {Intent.UNKNOWN, Intent.FOLLOW_UP}:
                decision = contextual_decision
        if decision.intent is Intent.UNKNOWN and decision.matched_rule == "no-rule":
            resolver = getattr(self.retriever, "resolve_product_names", None)
            resolved_products = resolver(standalone) if callable(resolver) else ()
            if resolved_products:
                decision = type(decision)(Intent.PRODUCT_INFO, 0.85, "catalog-product-match")
        if (
            decision.intent is Intent.FOLLOW_UP
            and conversation.last_intent not in {Intent.UNKNOWN, Intent.FOLLOW_UP}
        ):
            decision = type(decision)(
                conversation.last_intent,
                0.80,
                "inherited-last-intent",
            )
        if decision.intent in {Intent.UNKNOWN, Intent.FOLLOW_UP}:
            logger.info(
                "Query rewrite (original=%r, normalized=%r, rewritten=%r, intent=%s)",
                question[:200], normalized_question[:200], standalone[:300], decision.intent.value,
            )
            logger.info(
                "Không nhận diện được intent phù hợp; fallback_reason=missing_context, normalized_query=%r",
                normalized_question[:200],
            )
            return _intent_fallback(decision.intent, hist), []
        logger.info(
            "Query rewrite (original=%r, normalized=%r, rewritten=%r, intent=%s)",
            question[:200], normalized_question[:200], standalone[:300], decision.intent.value,
        )
        logger.info(
            "Bắt đầu truy xuất chat (intent=%s, query_chars=%d, history_messages=%d, current_product=%s)",
            decision.intent.value,
            len(standalone),
            len(hist),
            conversation.current_product,
        )

        try:
            hits = await asyncio.to_thread(
                self.retriever.search,
                standalone,
                self.top_k,
                self.min_score,
                category,
                decision.intent,
            )
        except Exception:
            logger.exception("Truy xuất knowledge base thất bại")
            raise

        if not hits:
            logger.info(
                "Không tìm thấy nguồn đủ liên quan (intent=%s, fallback_reason=no_relevant_document)",
                decision.intent.value,
            )
            return _intent_fallback(decision.intent, hist), []

        hits = _deduplicate_hits(hits)
        logger.info(
            "Retrieval hoàn tất (intent=%s, hits=%d, top_score=%.4f, categories=%s, headings=%s)",
            decision.intent.value,
            len(hits),
            hits[0].score if hits else 0.0,
            sorted({hit.chunk.document_type for hit in hits}),
            [hit.chunk.heading.split(" > ")[-1] for hit in hits[:5]],
        )
        context = _format_context(hits)
        user_msg = USER_TEMPLATE.format(
            intent=decision.intent.value,
            context=context,
            question=standalone,
        )
        messages = hist + [{"role": "user", "content": user_msg}]
        answer = ""
        if decision.intent in DIRECT_ANSWER_INTENTS:
            answer = await self.fallback_llm.generate(
                SYSTEM_PROMPT,
                messages,
                max_tokens=280,
            )
            logger.info("Trả lời grounded trực tiếp cho intent=%s", decision.intent.value)
            if not answer:
                logger.info(
                    "Context không trả lời được fact lookup "
                    "(intent=%s, fallback_reason=unanswerable_context)",
                    decision.intent.value,
                )
                return _intent_fallback(decision.intent, hist), []

        if not answer:
            try:
                answer = await self.llm.generate(
                    SYSTEM_PROMPT,
                    messages,
                    max_tokens=280,
                )
            except Exception:
                # Ollama/OpenAI-compatible outage không làm endpoint mất hoàn toàn.
                # Fallback chỉ trích xuất dữ liệu đã retrieval nên không hallucination.
                logger.exception("LLM provider lỗi; sử dụng câu trả lời trích xuất có căn cứ")
                answer = await self.fallback_llm.generate(
                    SYSTEM_PROMPT,
                    messages,
                    max_tokens=280,
                )

        answer = sanitize_generated_answer(answer or "")
        if answer and confirming_previous:
            answer = f"Dạ, mình vừa kiểm tra lại theo thông tin hiện có: {answer}"
        if answer and not answer_prices_are_grounded(answer, context):
            logger.warning("Loại câu trả lời có giá không tồn tại trong context")
            answer = ""
        if not answer:
            answer = await self.fallback_llm.generate(
                SYSTEM_PROMPT,
                messages,
                max_tokens=280,
            )
            answer = sanitize_generated_answer(answer or "")
        if not answer:
            answer = _intent_fallback(decision.intent, hist) or FALLBACK_ANSWER

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
