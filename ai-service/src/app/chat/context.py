"""Context hội thoại ngắn hạn, được dựng riêng cho từng request.

API hiện tại truyền history từ client và không có session_id. Vì vậy module
này không giữ state toàn cục, tránh rò rỉ context giữa người dùng/phiên.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .intent import Intent, classify_intent
from .normalize import fold_text, is_contextual_followup


@dataclass(frozen=True)
class ConversationContext:
    session_id: str | None
    recent_messages: tuple[dict, ...]
    current_product: str | None
    last_intent: Intent
    pending_question: str | None
    pending_intent: Intent | None
    candidate_products: tuple[str, ...]
    last_assistant_question: str | None
    last_assistant_message: str | None


def _mentioned_products(text: str, product_names: tuple[str, ...]) -> tuple[str, ...]:
    """Lấy tên món được nhắc rõ, loại match con như Latte trong Matcha Latte."""
    folded = fold_text(text)
    occurrences: list[tuple[int, int, str]] = []
    for product_name in product_names:
        name = fold_text(product_name)
        for match in re.finditer(rf"(?<!\w){re.escape(name)}(?!\w)", folded):
            occurrences.append((match.start(), match.end(), product_name))

    selected: list[tuple[int, int, str]] = []
    for start, end, product_name in sorted(
        occurrences, key=lambda item: (-(item[1] - item[0]), item[0])
    ):
        if any(other_start <= start and end <= other_end for other_start, other_end, _ in selected):
            continue
        selected.append((start, end, product_name))
    return tuple(dict.fromkeys(item[2] for item in sorted(selected)))


def _pending_intent(last_assistant_message: str | None, last_intent: Intent) -> Intent | None:
    if not last_assistant_message:
        return None
    folded = fold_text(last_assistant_message)
    if any(phrase in folded for phrase in ("xem gia", "biet gia", "bao gia")):
        return Intent.PRODUCT_PRICE
    if "ma don" in folded:
        if last_intent is Intent.POLICY_QUERY:
            return Intent.POLICY_QUERY
        return Intent.ORDER_STATUS
    return None


def build_conversation_context(
    history: list[dict],
    question: str,
    product_names: tuple[str, ...],
) -> ConversationContext:
    current_product = None
    candidate_products: tuple[str, ...] = ()
    for item in reversed(history):
        mentioned = _mentioned_products(str(item.get("content", "")), product_names)
        if mentioned:
            candidate_products = mentioned
            current_product = mentioned[0] if len(mentioned) == 1 else None
            break

    last_intent = Intent.UNKNOWN
    for item in reversed(history):
        if item.get("role") == "user":
            last_intent = classify_intent(str(item.get("content", ""))).intent
            break

    pending = question if is_contextual_followup(question) else None
    last_assistant_question = None
    last_assistant_message = None
    for item in reversed(history):
        if item.get("role") != "assistant":
            continue
        content = str(item.get("content", "")).strip()
        last_assistant_message = content or None
        if "?" in content:
            last_assistant_question = content[content.rfind(".") + 1:].strip()
        break
    return ConversationContext(
        session_id=None,
        recent_messages=tuple(history),
        current_product=current_product,
        last_intent=last_intent,
        pending_question=pending,
        pending_intent=_pending_intent(last_assistant_message, last_intent),
        candidate_products=candidate_products,
        last_assistant_question=last_assistant_question,
        last_assistant_message=last_assistant_message,
    )
