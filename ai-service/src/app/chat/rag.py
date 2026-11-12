"""RAG pipeline: làm sạch lịch sử -> viết lại câu hỏi -> truy xuất -> trả lời có căn cứ."""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import re
from typing import Protocol

from src.app.core.config import get_settings

from .context import build_conversation_context
from .intent import (
    PRODUCT_INTENTS,
    Intent,
    IntentDecision,
    classify_compound_intents,
    classify_intent,
    fallback_for_intent,
)
from .live_data import OperationalDataClient, format_catalog_answer, format_order_answer
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
    NATURALIZE_SYSTEM,
    NATURALIZE_USER,
    OUT_OF_SCOPE_ANSWER,
    SYSTEM_PROMPT,
    USER_TEMPLATE,
)
from .retriever import Retriever, SearchHit, get_retriever
from .response import answer_prices_are_grounded, sanitize_generated_answer
from .schemas import ChatMessage, SourceChunk

logger = logging.getLogger(__name__)

TOP_K = max(1, min(int(os.getenv("RAG_TOP_K", "12")), 15))
MIN_SCORE = float(os.getenv("RAG_MIN_SCORE", "0.68"))
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
    Intent.PRODUCT_COMPARISON,
})

NATURALIZE_INTENTS = frozenset({
    Intent.PRODUCT_DETAIL,
    Intent.PRODUCT_INFO,
    Intent.PRODUCT_INTEREST,
    Intent.CUSTOMIZE_DRINK,
    Intent.PRODUCT_RECOMMENDATION,
    Intent.PRODUCT_FILTER,
    Intent.PRODUCT_COMPARISON,
})

_COMPOUND_FOCUS_QUERIES = {
    Intent.OPENING_HOURS: "Quán mở cửa và đóng cửa lúc mấy giờ?",
    Intent.LOCATION_QUERY: "Địa chỉ quán ở đâu?",
    Intent.CONTACT_QUERY: "Hotline và cách liên hệ quán là gì?",
    Intent.WIFI_QUERY: "Quán có Wi-Fi không?",
    Intent.SERVICE_QUERY: "Quán có dịch vụ hoặc tiện ích này không?",
    Intent.DELIVERY_QUERY: "Quán có giao hàng không?",
    Intent.PAYMENT_QUERY: "Quán hỗ trợ thanh toán thế nào?",
    Intent.PROMOTION_QUERY: "Quán có khuyến mãi không?",
}


def _product_compound_clauses(question: str) -> tuple[tuple[str, IntentDecision], ...]:
    """Tách các ý sản phẩm độc lập khi một câu hỏi có nhiều thuộc tính."""
    canonical = canonicalize_query(question)
    clauses = [
        clause.strip(" ?.!,")
        for clause in re.split(r"\s+(?:và|va|voi|với|rồi)\s+|[,;]", canonical, flags=re.I)
        if clause.strip(" ?.!,")
    ]
    if len(clauses) < 2:
        return ()
    decisions = tuple((clause, classify_intent(clause)) for clause in clauses)
    if not all(decision.intent in PRODUCT_INTENTS for _, decision in decisions):
        return ()
    # Một câu "giá Matcha và Cà phê sữa" chỉ là một intent giá cho hai entity;
    # để resolver hiện có xử lý cả hai, không biến vế trần thành intent info.
    explicit = {
        decision.intent
        for _, decision in decisions
        if decision.intent not in {Intent.PRODUCT_INFO}
    }
    if len(explicit) < 2:
        return ()
    return decisions


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


def _format_prompt_history(history: list[dict]) -> str:
    """Đưa lịch sử đã làm sạch vào prompt mới mà không làm đổi contract messages."""
    return "\n".join(
        f"{item.get('role', 'user')}: {item.get('content', '').strip()}"
        for item in history
        if item.get("content", "").strip()
    )


def _render_user_prompt(
    *,
    intent: Intent | str,
    context: str,
    question: str,
    history: list[dict] | None = None,
    conversation_state: str = "",
    operation_result: str = "",
) -> str:
    """Render cả prompt schema cũ lẫn schema có state/history mở rộng."""
    return USER_TEMPLATE.format(
        intent=intent.value if isinstance(intent, Intent) else intent,
        history=_format_prompt_history(history or []),
        conversation_state=conversation_state,
        context=context,
        operation_result=operation_result,
        resolved_question=question,
        question=question,
    )


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


def _extract_order_code(value: str) -> str | None:
    if _looks_like_order_code(value):
        return value.strip()
    for candidate in re.findall(r"(?<!\w)[A-Za-z0-9-]{6,24}(?!\w)", value):
        if re.search(r"\d", candidate) and re.search(r"[A-Za-z]", candidate):
            return candidate
    return None


def _query_fingerprint(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8", errors="ignore")).hexdigest()[:12]


def _fact_numbers(value: str) -> set[str]:
    return {
        re.sub(r"[.,]", "", match)
        for match in re.findall(r"(?<!\w)\d[\d.,]*", value)
    }


def _naturalization_is_safe(
    draft: str,
    rewritten: str,
    protected_phrases: tuple[str, ...],
    required_fact_phrases: tuple[str, ...] = (),
) -> bool:
    """Chặn rewrite làm thay đổi fact, sản phẩm hoặc mức độ chắc chắn."""
    if not rewritten or len(rewritten) > max(700, len(draft) * 3):
        return False
    if _fact_numbers(draft) != _fact_numbers(rewritten):
        return False
    folded_draft = fold_text(draft)
    folded_rewritten = fold_text(rewritten)
    uncertainty_groups = (
        ("chua",),
        ("khong the", "chua the"),
        ("tham khao",),
        ("xac nhan", "kiem tra"),
    )
    for group in uncertainty_groups:
        if any(cue in folded_draft for cue in group) and not any(
            cue in folded_rewritten for cue in group
        ):
            return False
    for phrase in protected_phrases:
        folded_phrase = fold_text(phrase)
        if folded_phrase in folded_draft and folded_phrase not in folded_rewritten:
            return False
    for phrase in required_fact_phrases:
        if fold_text(phrase) not in folded_rewritten:
            return False
    return True


def _required_source_facts(draft: str, sources: list[SourceChunk]) -> tuple[str, ...]:
    """Các field đã xuất hiện trong draft phải còn nguyên sau rewrite."""
    folded_draft = fold_text(draft)
    facts: list[str] = []
    field_pattern = re.compile(
        r"^\s*[-*]?\s*(?:Mô tả|Nhiệt độ|Caffeine|Giá(?: mẫu)?):\s*(.+)$",
        re.I | re.M,
    )
    for source in sources:
        for match in field_pattern.finditer(source.content):
            value = match.group(1).strip().rstrip(".")
            if len(value) >= 2 and fold_text(value) in folded_draft and value not in facts:
                facts.append(value)
    return tuple(facts)


def _order_code_answer(order_code: str) -> str:
    return (
        f"Mình đã nhận mã đơn {order_code.strip()}. Tuy nhiên chatbot chưa kết nối hệ thống "
        "đơn hàng để tra cứu; bạn vui lòng gửi mã này qua kênh đã đặt đơn hoặc cho nhân viên "
        "tại quầy để được kiểm tra trực tiếp nhé."
    )


def _intent_fallback(intent: Intent, history: list[dict]) -> str:
    return fallback_for_intent(intent, _last_assistant_answer(history))


def _is_why_followup(question: str) -> bool:
    folded = fold_text(question).strip(" ?!.\t")
    return folded in {"tai sao", "vi sao", "sao vay", "the thi sao"}


def _explain_previous_limit(
    question: str,
    previous_answer: str,
    current_product: str | None,
) -> str | None:
    """Giải thích giới hạn của lượt trước thay vì retrieval lại một câu "tại sao?"."""
    if not _is_why_followup(question) or not previous_answer:
        return None
    folded = fold_text(previous_answer)
    limitation_cues = (
        "chua co du lieu",
        "chua duoc xac nhan",
        "khong muon doan sai",
        "chua truy cap",
        "chua ket noi",
    )
    if not any(cue in folded for cue in limitation_cues):
        return None
    subject = current_product or "thông tin này"
    detail = (
        ", đặc biệt là mức ngọt hoặc khả năng giảm đường"
        if "ngot" in folded or "duong" in folded
        else ""
    )
    return (
        f"Vì hiện mình chưa có dữ liệu được xác nhận về {subject}{detail}, nên mình không muốn "
        "đoán sai hoặc khẳng định thay cho quán. Bạn có thể hỏi nhân viên để xác nhận "
        "thông tin này nhé!"
    )


def _looks_like_unknown_product_request(question: str) -> bool:
    """Nhận diện câu nhắc một món lạ để trả fallback phạm vi dữ liệu, không bịa."""
    folded = fold_text(question)
    if not re.search(r"\b(mon|loai)\b", folded):
        return False
    if re.search(r"\b(mon|loai)\s+(nao|gi|nay|do|kia|ngon)\b", folded):
        return False
    return bool(
        re.search(r"\b(mon|loai)\b.*\b(khong co|khong thay|ten la)\b", folded)
        or re.search(r"\b(mon|loai)\s+[a-z0-9]{3,}", folded)
    )


def _unknown_product_answer() -> str:
    return (
        "Mình chưa tìm thấy món này trong danh mục dữ liệu hiện có. Điều đó chưa đủ "
        "để kết luận quán không bán; bạn cho mình tên món đầy đủ hoặc hỏi nhân viên "
        "để xác nhận nhé!"
    )


class RAGPipeline:
    def __init__(
        self,
        retriever: Retriever | None = None,
        llm: LLMClient | None = None,
        fallback_llm: LLMClient | None = None,
        live_data: OperationalDataClient | None = None,
        naturalize_responses: bool | None = None,
        top_k: int = TOP_K,
        min_score: float = MIN_SCORE,
    ):
        self.retriever = retriever or get_retriever()
        explicit_llm = llm is not None
        self.llm = llm or get_llm()
        self.fallback_llm = fallback_llm or ExtractiveLLM()
        self.live_data = live_data or OperationalDataClient()
        self.top_k = max(1, min(int(top_k), 15))
        self.min_score = float(min_score)
        self.naturalize_responses = (
            get_settings().naturalize_responses and not explicit_llm
            if naturalize_responses is None
            else bool(naturalize_responses)
        )
        self.product_names = tuple(sorted({
            chunk.heading.split(" > ")[-1]
            for chunk in getattr(self.retriever, "chunks", [])
            if chunk.document_type == "product" and "Mã món:" in chunk.text
        }, key=len, reverse=True))

    async def _naturalize(
        self,
        draft: str,
        intent: Intent,
        context: str,
        sources: list[SourceChunk],
    ) -> str:
        if (
            not self.naturalize_responses
            or intent not in NATURALIZE_INTENTS
            or isinstance(self.llm, ExtractiveLLM)
            or not draft
        ):
            return draft
        protected = tuple(
            source.heading.split(" > ")[-1].strip()
            for source in sources
            if source.heading
        )
        required_facts = _required_source_facts(draft, sources)
        try:
            rewritten = await self.llm.generate(
                NATURALIZE_SYSTEM,
                [{
                    "role": "user",
                    "content": NATURALIZE_USER.format(intent=intent.value, draft=draft),
                }],
                max_tokens=240,
            )
        except Exception as exc:
            logger.warning(
                "Naturalizer không khả dụng; giữ câu grounded (error_type=%s)",
                type(exc).__name__,
            )
            return draft
        rewritten = sanitize_generated_answer(rewritten or "")
        if not _naturalization_is_safe(draft, rewritten, protected, required_facts):
            logger.warning("Naturalizer thay đổi fact; giữ câu grounded ban đầu")
            return draft
        if not answer_prices_are_grounded(rewritten, context):
            logger.warning("Naturalizer sinh giá không grounded; giữ câu ban đầu")
            return draft
        logger.info("Naturalizer được chấp nhận (intent=%s)", intent.value)
        return rewritten

    async def preload(self, warm_embeddings: bool = True, warm_llm: bool = False) -> None:
        """Nạp index/model trước khi readiness chuyển sang ready."""
        if warm_embeddings and not getattr(self.retriever, "_embedding_disabled", True):
            embed = getattr(self.retriever, "_embed", None)
            if callable(embed):
                await asyncio.to_thread(embed, ["kiểm tra sẵn sàng"], "query: ")
        if warm_llm and not isinstance(self.llm, ExtractiveLLM):
            await self.llm.generate(
                "Chỉ trả lời OK.",
                [{"role": "user", "content": "OK"}],
                max_tokens=1,
            )

    @staticmethod
    def _source_chunks(hits: list[SearchHit]) -> list[SourceChunk]:
        return [
            SourceChunk(
                source=hit.chunk.source,
                category=hit.chunk.category,
                heading=hit.chunk.heading,
                score=round(hit.score, 4),
                content=hit.chunk.text,
            )
            for hit in hits
        ]

    async def _answer_compound_business(
        self,
        question: str,
        decisions: tuple[IntentDecision, ...],
        category: str | None,
    ) -> tuple[str, list[SourceChunk]] | None:
        answers: list[str] = []
        collected: list[SearchHit] = []
        for decision in decisions:
            focused_question = _COMPOUND_FOCUS_QUERIES.get(decision.intent, question)
            hits = await asyncio.to_thread(
                self.retriever.search,
                focused_question,
                self.top_k,
                self.min_score,
                category,
                decision.intent,
            )
            hits = _deduplicate_hits(hits)
            if not hits:
                continue
            context = _format_context(hits)
            prompt = _render_user_prompt(
                intent=decision.intent,
                context=context,
                question=focused_question,
            )
            answer = await self.fallback_llm.generate(
                SYSTEM_PROMPT, [{"role": "user", "content": prompt}], max_tokens=180
            )
            answer = sanitize_generated_answer(answer or "")
            if answer:
                answers.append(answer.rstrip(".!? "))
                collected.extend(hits)
        if len(answers) < 2:  # business compound
            return None
        unique_hits: list[SearchHit] = []
        seen: set[tuple[str, str]] = set()
        for hit in collected:
            key = (hit.chunk.source, hit.chunk.heading)
            if key not in seen:
                unique_hits.append(hit)
                seen.add(key)
        return ". ".join(answers) + ".", self._source_chunks(unique_hits)

    async def _answer_compound_product(
        self,
        clauses: tuple[tuple[str, IntentDecision], ...],
        category: str | None,
        branch_id: int | None = None,
    ) -> tuple[str, list[SourceChunk]] | None:
        """Trả đủ các ý sản phẩm, mỗi ý có context và nguồn riêng."""
        answers: list[str] = []
        collected: list[SearchHit] = []
        collected_sources: list[SourceChunk] = []
        for focused_question, decision in clauses:
            if self.live_data.enabled:
                live_catalog = await self.live_data.search_catalog(
                    focused_question, decision.intent, branch_id
                )
                if live_catalog is None:
                    continue
                live_answer, live_sources = format_catalog_answer(
                    decision.intent, live_catalog.products, branch_id
                )
                if live_answer:
                    answers.append(live_answer.rstrip(".!? "))
                    collected_sources.extend(live_sources)
                continue
            hits = await asyncio.to_thread(
                self.retriever.search,
                focused_question,
                self.top_k,
                self.min_score,
                category,
                decision.intent,
            )
            hits = _deduplicate_hits(hits)
            if not hits:
                continue
            context = _format_context(hits)
            prompt = _render_user_prompt(
                intent=decision.intent,
                context=context,
                question=focused_question,
            )
            answer = await self.fallback_llm.generate(
                SYSTEM_PROMPT,
                [{"role": "user", "content": prompt}],
                max_tokens=220,
            )
            answer = sanitize_generated_answer(answer or "")
            if answer:
                answers.append(answer.rstrip(".! "))
                collected.extend(hits)
        if len(answers) < 2:
            return None
        if collected_sources:
            unique_sources: list[SourceChunk] = []
            seen_sources: set[tuple[str, str]] = set()
            for source in collected_sources:
                key = (source.source, source.heading)
                if key not in seen_sources:
                    unique_sources.append(source)
                    seen_sources.add(key)
            return (
                "Mình trả lời từng ý nhé: " + ". ".join(answers) + ".",
                unique_sources,
            )
        unique_hits: list[SearchHit] = []
        seen: set[tuple[str, str]] = set()
        for hit in collected:
            key = (hit.chunk.source, hit.chunk.heading)
            if key not in seen:
                unique_hits.append(hit)
                seen.add(key)
        return "Mình trả lời từng ý nhé: " + ". ".join(answers) + ".", self._source_chunks(unique_hits)

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
        branch_id: int | None = None,
        authorization: str | None = None,
    ) -> tuple[str, list[SourceChunk]]:
        question = question.strip()
        if not question:
            return FALLBACK_ANSWER, []

        hist = _clean_history(history or [])
        conversation = build_conversation_context(hist, question, self.product_names)
        decision = classify_intent(question)
        compound_decisions = classify_compound_intents(question)
        confirming_previous = False
        normalized_question = canonicalize_query(question)
        resolver = getattr(self.retriever, "resolve_product_names", None)
        explicit_question_products = resolver(question) if callable(resolver) else ()
        logger.info(
            "Phân loại chat (intent=%s, confidence=%.2f, rule=%s, query_id=%s, query_chars=%d)",
            decision.intent.value,
            decision.confidence,
            decision.matched_rule,
            _query_fingerprint(normalized_question),
            len(normalized_question),
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

        explanation = _explain_previous_limit(
            question,
            conversation.last_assistant_message or "",
            conversation.current_product,
        )
        if explanation:
            logger.info("Follow-up giải thích giới hạn lượt trước (intent=FOLLOW_UP)")
            explanation_sources: list[SourceChunk] = []
            previous_question = _last_meaningful_user_question(hist)
            if conversation.current_product and previous_question:
                focus = f"{conversation.current_product} {previous_question}"
                previous_hits = await asyncio.to_thread(
                    self.retriever.search,
                    focus,
                    self.top_k,
                    self.min_score,
                    category,
                    Intent.PRODUCT_DETAIL,
                )
                explanation_sources = self._source_chunks(_deduplicate_hits(previous_hits))
            return explanation, explanation_sources

        if compound_decisions:
            compound = await self._answer_compound_business(
                question, compound_decisions, category
            )
            if compound:
                return compound

        product_clauses = _product_compound_clauses(question)
        if product_clauses:
            compound = await self._answer_compound_product(
                product_clauses, category, branch_id
            )
            if compound:
                return compound

        order_code = _extract_order_code(question)
        order_context = decision.intent is Intent.ORDER_STATUS or (
            conversation.pending_intent in {Intent.ORDER_STATUS, Intent.POLICY_QUERY}
        )
        if order_context and order_code:
            logger.info(
                "Đã nhận slot mã đơn (pending_intent=%s, order_code_hash=%s)",
                conversation.pending_intent.value if conversation.pending_intent else None,
                _query_fingerprint(order_code),
            )
            if self.live_data.enabled:
                if not authorization:
                    return (
                        "Để bảo vệ đơn hàng, bạn vui lòng đăng nhập hoặc dùng lại "
                        "kênh đã đặt đơn để mình xác minh trước khi tra cứu nhé.",
                        [],
                    )
                order = await self.live_data.lookup_order(order_code, authorization)
                if order:
                    return format_order_answer(order), []
                return (
                    "Mình chưa xác minh được đơn này. Bạn kiểm tra lại mã đơn "
                    "hoặc liên hệ qua kênh đã đặt đơn nhé.",
                    [],
                )
            return _order_code_answer(order_code), []

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
                standalone = (
                    question
                    if explicit_question_products
                    else await self._condense(question, hist)
                )
            else:
                standalone = question
        explicit_products = ()
        if callable(resolver):
            explicit_products = resolver(standalone)
        if (
            decision.intent in PRODUCT_INTENTS
            and conversation.current_product
            and conversation.pending_question
            and not explicit_products
            and fold_text(conversation.current_product) not in fold_text(standalone)
        ):
            standalone = f"{conversation.current_product} {standalone}"[:MAX_STANDALONE_QUERY_CHARS]
        if decision.intent in {Intent.UNKNOWN, Intent.FOLLOW_UP} and standalone != question:
            contextual_decision = classify_intent(standalone)
            if contextual_decision.intent not in {Intent.UNKNOWN, Intent.FOLLOW_UP}:
                decision = contextual_decision
        if decision.intent is Intent.UNKNOWN and decision.matched_rule == "no-rule":
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
                "Query rewrite (query_id=%s, rewritten_chars=%d, intent=%s)",
                _query_fingerprint(normalized_question), len(standalone), decision.intent.value,
            )
            logger.info(
                "Không nhận diện được intent phù hợp; fallback_reason=missing_context, query_id=%s",
                _query_fingerprint(normalized_question),
            )
            if decision.intent is Intent.UNKNOWN and _looks_like_unknown_product_request(standalone):
                return _unknown_product_answer(), []
            return _intent_fallback(decision.intent, hist), []
        logger.info(
            "Query rewrite (query_id=%s, rewritten_chars=%d, intent=%s)",
            _query_fingerprint(normalized_question), len(standalone), decision.intent.value,
        )
        logger.info(
            "Bắt đầu truy xuất chat (intent=%s, query_chars=%d, history_messages=%d, current_product=%s)",
            decision.intent.value,
            len(standalone),
            len(hist),
            conversation.current_product,
        )

        folded_standalone = fold_text(standalone)
        if decision.intent is Intent.PRODUCT_FILTER and re.search(
            r"\b(khong uong|khong dung|khong dung duoc|tranh)\b.*\b(sua|dairy|milk)\b",
            folded_standalone,
        ):
            return (
                "Mình chưa có dữ liệu thành phần đủ chi tiết để xác nhận món không sữa. "
                "Mình không muốn suy đoán về thành phần; bạn hỏi nhân viên để kiểm tra "
                "chính xác giúp mình nhé!",
                [],
            )
        if decision.intent is Intent.PRODUCT_DETAIL and re.search(
            r"\b(di ung|chat gay di ung|allergen|allergy)\b",
            folded_standalone,
        ):
            return (
                "Mình chưa có dữ liệu thành phần gây dị ứng đủ tin cậy để xác nhận món này "
                "an toàn. Bạn vui lòng xác nhận trực tiếp với quán trước khi dùng nhé!",
                [],
            )

        if decision.intent in {
            Intent.PRODUCT_PRICE,
            Intent.PRODUCT_AVAILABILITY,
            Intent.PRODUCT_COMPARISON,
            Intent.PRODUCT_FILTER,
            Intent.PRODUCT_DETAIL,
            Intent.PRODUCT_INFO,
            Intent.PRODUCT_INTEREST,
            Intent.MENU_QUERY,
            Intent.PRODUCT_RECOMMENDATION,
        }:
            live_catalog = await self.live_data.search_catalog(
                standalone, decision.intent, branch_id
            )
            if live_catalog is not None:
                live_answer, live_sources = format_catalog_answer(
                    decision.intent, live_catalog.products, branch_id
                )
                live_context = "\n".join(source.content for source in live_sources)
                live_answer = await self._naturalize(
                    live_answer,
                    decision.intent,
                    live_context,
                    live_sources,
                )
                return live_answer, live_sources
            if self.live_data.enabled:
                return (
                    "Mình chưa truy cập được menu và tình trạng hiện hành, "
                    "nên không dùng dữ liệu cũ để trả lời. Bạn vui lòng thử lại "
                    "sau hoặc hỏi nhân viên nhé!",
                    [],
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
        conversation_state = "\n".join(
            value
            for value in (
                f"current_product: {conversation.current_product}"
                if conversation.current_product
                else "",
                f"pending_intent: {conversation.pending_intent.value}"
                if conversation.pending_intent
                else "",
                f"candidate_products: {', '.join(conversation.candidate_products)}"
                if conversation.candidate_products
                else "",
            )
            if value
        )
        user_msg = _render_user_prompt(
            intent=decision.intent,
            context=context,
            question=standalone,
            history=hist,
            conversation_state=conversation_state,
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

        sources = self._source_chunks(hits)
        if decision.intent in DIRECT_ANSWER_INTENTS:
            answer = await self._naturalize(
                answer,
                decision.intent,
                context,
                sources,
            )
        return answer, sources
