"""Context hội thoại ngắn hạn, được dựng riêng cho từng request.

API hiện tại truyền history từ client và không có session_id. Vì vậy module
này không giữ state toàn cục, tránh rò rỉ context giữa người dùng/phiên.
"""
from __future__ import annotations

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


def build_conversation_context(
    history: list[dict],
    question: str,
    product_names: tuple[str, ...],
) -> ConversationContext:
    current_product = None
    for item in reversed(history):
        content = fold_text(str(item.get("content", "")))
        for product_name in product_names:
            if fold_text(product_name) in content:
                current_product = product_name
                break
        if current_product:
            break

    last_intent = Intent.UNKNOWN
    for item in reversed(history):
        if item.get("role") == "user":
            last_intent = classify_intent(str(item.get("content", ""))).intent
            break

    pending = question if is_contextual_followup(question) else None
    return ConversationContext(
        session_id=None,
        recent_messages=tuple(history),
        current_product=current_product,
        last_intent=last_intent,
        pending_question=pending,
    )
