"""Intent classification nhẹ cho truy vấn Smart Café.

Classifier chỉ định tuyến retrieval; nó không chứa giá, giờ mở cửa, Wi-Fi hay bất
kỳ dữ liệu nghiệp vụ nào. Dữ liệu trả lời vẫn phải đến từ knowledge base/API.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum

from .normalize import canonicalize_query, fold_text, search_tokens


class Intent(str, Enum):
    GREETING = "GREETING"
    MENU_QUERY = "MENU_QUERY"
    PRODUCT_PRICE = "PRODUCT_PRICE"
    PRODUCT_DETAIL = "PRODUCT_DETAIL"
    PRODUCT_RECOMMENDATION = "PRODUCT_RECOMMENDATION"
    PRODUCT_FILTER = "PRODUCT_FILTER"
    OPENING_HOURS = "OPENING_HOURS"
    WIFI_QUERY = "WIFI_QUERY"
    LOCATION_QUERY = "LOCATION_QUERY"
    SERVICE_QUERY = "SERVICE_QUERY"
    POLICY_QUERY = "POLICY_QUERY"
    UNKNOWN = "UNKNOWN"


class DocumentType(str, Enum):
    PRODUCT = "product"
    BUSINESS = "business"
    POLICY = "policy"
    INTERNAL = "internal"


PRODUCT_INTENTS = frozenset({
    Intent.MENU_QUERY,
    Intent.PRODUCT_PRICE,
    Intent.PRODUCT_DETAIL,
    Intent.PRODUCT_RECOMMENDATION,
    Intent.PRODUCT_FILTER,
})
BUSINESS_INTENTS = frozenset({
    Intent.OPENING_HOURS,
    Intent.WIFI_QUERY,
    Intent.LOCATION_QUERY,
    Intent.SERVICE_QUERY,
})


@dataclass(frozen=True)
class IntentDecision:
    intent: Intent
    confidence: float
    matched_rule: str


def _contains(text: str, *patterns: str) -> bool:
    return any(re.search(pattern, text) for pattern in patterns)


def classify_intent(query: str) -> IntentDecision:
    """Phân loại deterministic, ưu tiên intent có rủi ro retrieval cao."""
    canonical = canonicalize_query(query)
    folded = fold_text(canonical)
    token_count = len(search_tokens(canonical))

    if token_count <= 4 and _contains(
        folded,
        r"\b(xin chao|chao|hello|hi|alo)\b",
        r"\b(chao buoi sang|chao buoi toi)\b",
    ):
        return IntentDecision(Intent.GREETING, 0.99, "greeting")

    # Chặn các chủ đề rõ ràng ngoài phạm vi trước các rule chung như
    # "giá bao nhiêu"; nếu không, "giá Bitcoin" sẽ bị nhầm thành giá sản phẩm.
    if _contains(
        folded,
        r"\b(bitcoin|crypto|tien ao|chung khoan|co phieu)\b",
        r"\b(thoi tiet|bong da|xo so|chinh tri)\b",
    ):
        return IntentDecision(Intent.UNKNOWN, 0.99, "out-of-scope")

    if _contains(folded, r"\b(wifi|internet|mang)\b"):
        return IntentDecision(Intent.WIFI_QUERY, 0.99, "wifi-synonym")

    if _contains(
        folded,
        r"\b(mo cua|dong cua|gio hoat dong|gio lam viec)\b",
        r"\bmay gio\b.*\b(mo|dong|hoat dong|het ban)\b",
        r"\bbao gio\b.*\b(nghi|mo|dong)\b",
        r"\bluc nao\b.*\b(mo|dong)\b",
    ):
        return IntentDecision(Intent.OPENING_HOURS, 0.98, "opening-hours")

    if _contains(folded, r"\b(dia chi|o dau|vi tri|cho nao)\b"):
        return IntentDecision(Intent.LOCATION_QUERY, 0.98, "location")

    if _contains(
        folded,
        r"\b(hoan tien|huy don|doi mon|doi tra|thanh toan|chuyen khoan|tien mat|otp|refund)\b",
    ):
        return IntentDecision(Intent.POLICY_QUERY, 0.97, "policy")

    if _contains(
        folded,
        r"\b(duoi|tren|tu)\s*\d+[\d.]*\s*k?\b",
        r"\bngan sach\b",
        r"\bkhong (co )?(ca phe|caffeine)\b",
        r"\bgia\s*(duoi|tren|tu)\b",
    ):
        return IntentDecision(Intent.PRODUCT_FILTER, 0.95, "product-filter")

    if _contains(
        folded,
        r"\b(goi y|tu van|nen uong|phu hop|thich)\b",
        r"\bmon nao\b.*\b(it ngot|khong dang|beo|thanh|ngon)\b",
        r"\bco mon nao\b",
    ):
        return IntentDecision(Intent.PRODUCT_RECOMMENDATION, 0.94, "recommendation")

    if _contains(folded, r"\b(gia|bao nhieu|bao tien|may dong)\b"):
        return IntentDecision(Intent.PRODUCT_PRICE, 0.97, "price")

    if _contains(
        folded,
        r"\b(thanh phan|nguyen lieu|caffeine|huong vi|vi gi|do ngot|it ngot|dang khong|nong hay lanh)\b",
        r"\bco gi\b",
    ):
        return IntentDecision(Intent.PRODUCT_DETAIL, 0.93, "product-detail")

    if _contains(
        folded,
        r"\b(menu|thuc don|danh sach mon)\b",
        r"\b(co nhung|nhung loai|mon nuoc nao|loai ca phe nao)\b",
    ):
        return IntentDecision(Intent.MENU_QUERY, 0.94, "menu")

    if _contains(
        folded,
        r"\b(dat ban|giao hang|mang ve|giu xe|nha ve sinh|tien ich|dich vu|dat mon|don hang)\b",
    ):
        return IntentDecision(Intent.SERVICE_QUERY, 0.90, "service")

    return IntentDecision(Intent.UNKNOWN, 0.0, "no-rule")


def allowed_document_types(intent: Intent) -> frozenset[DocumentType]:
    if intent in PRODUCT_INTENTS:
        return frozenset({DocumentType.PRODUCT})
    if intent in BUSINESS_INTENTS:
        return frozenset({DocumentType.BUSINESS})
    if intent is Intent.POLICY_QUERY:
        return frozenset({DocumentType.POLICY})
    return frozenset()


def fallback_for_intent(intent: Intent) -> str:
    fallbacks = {
        Intent.WIFI_QUERY: (
            "Hiện mình chưa xác nhận được thông tin Wi-Fi của quán. "
            "Bạn vui lòng hỏi nhân viên giúp mình nhé!"
        ),
        Intent.OPENING_HOURS: (
            "Hiện mình chưa có giờ hoạt động được xác nhận. "
            "Bạn vui lòng hỏi nhân viên Smart Café nhé!"
        ),
        Intent.LOCATION_QUERY: (
            "Hiện mình chưa có địa chỉ được xác nhận trong dữ liệu. "
            "Bạn vui lòng hỏi nhân viên Smart Café nhé!"
        ),
        Intent.UNKNOWN: (
            "Mình chưa có thông tin phù hợp để trả lời câu hỏi này. "
            "Mình có thể hỗ trợ bạn về menu, giá và dịch vụ của Smart Café nhé!"
        ),
    }
    return fallbacks.get(
        intent,
        "Hiện mình chưa có đủ thông tin xác nhận. Bạn vui lòng hỏi nhân viên Smart Café nhé!",
    )
