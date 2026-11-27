"""Function-calling adapter for menu recommendations.

``user_id`` is deliberately absent from the tool schema.  The pipeline gets
it from the HTTP request/session context and injects it when executing the
server-side function.
"""

from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

GET_RECOMMENDATIONS_TOOL: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "get_recommendations",
        "description": "Lấy danh sách món đang bán được gợi ý cho khách.",
        "parameters": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 10,
                    "default": 5,
                    "description": "Số món cần giới thiệu, mặc định 5.",
                }
            },
            "additionalProperties": False,
        },
    },
}


def _safe_limit(arguments: Any) -> int:
    if not isinstance(arguments, dict):
        return 5
    try:
        return max(1, min(int(arguments.get("limit", 5)), 10))
    except (TypeError, ValueError):
        return 5


def call_recommendations_tool(
    *,
    session_user_id: str | None,
    arguments: Any = None,
) -> dict[str, Any]:
    """Execute the tool with trusted request context, never model arguments."""

    if isinstance(arguments, dict) and "user_id" in arguments:
        logger.warning("Bỏ qua user_id do LLM gửi trong recommendation tool arguments")
    from src.app.recommendation.chat_service import get_recommendations

    try:
        return get_recommendations(user_id=session_user_id, limit=_safe_limit(arguments))
    except Exception as exc:
        logger.exception("Recommendation tool lỗi; trả kết quả rỗng (error_type=%s)", type(exc).__name__)
        return {"source": "best_seller", "items": []}


def serialise_tool_result(result: dict[str, Any]) -> str:
    return json.dumps(result, ensure_ascii=False, separators=(",", ":"))


def recommendation_prompt_result(result: dict[str, Any]) -> str:
    return (
        "Đây là kết quả get_recommendations từ hệ thống, chỉ được dùng đúng dữ liệu này; "
        "không tự thêm món, giá hoặc mô tả:\n"
        + serialise_tool_result(result)
    )


def deterministic_recommendation_answer(result: dict[str, Any]) -> str:
    items = result.get("items") if isinstance(result, dict) else None
    source = result.get("source") if isinstance(result, dict) else ""
    if not isinstance(items, list) or not items:
        return "Mình xin lỗi, hiện chưa lấy được gợi ý món phù hợp. Bạn vui lòng xem menu hiện có hoặc hỏi nhân viên Smart Café nhé."

    if source == "personalized":
        answer = "Mình gợi ý riêng cho bạn các món sau ạ:"
    else:
        answer = "Đây là những món được nhiều khách chọn gần đây ạ:"
        if source == "best_seller":
            answer = "Đây là những món bán chạy nhất của quán ạ:"

    lines = [answer]
    for item in items:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        if not name:
            continue
        price = item.get("price", item.get("price_vnd"))
        price_text = f"{int(price):,}".replace(",", ".") + "đ" if price is not None else ""
        description = str(item.get("description", "")).strip()
        detail = f" — {price_text}" if price_text else ""
        if description:
            detail += f" ({description})"
        lines.append(f"- {name}{detail}")
    return "\n".join(lines)
