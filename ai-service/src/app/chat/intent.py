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
    PRODUCT_AVAILABILITY = "PRODUCT_AVAILABILITY"
    PRODUCT_PRICE = "PRODUCT_PRICE"
    PRODUCT_DETAIL = "PRODUCT_DETAIL"
    PRODUCT_INFO = "PRODUCT_INFO"
    PRODUCT_INTEREST = "PRODUCT_INTEREST"
    PRODUCT_COMPARISON = "PRODUCT_COMPARISON"
    CUSTOMIZE_DRINK = "CUSTOMIZE_DRINK"
    PRODUCT_RECOMMENDATION = "PRODUCT_RECOMMENDATION"
    PRODUCT_FILTER = "PRODUCT_FILTER"
    ORDER_INTENT = "ORDER_INTENT"
    ORDER_ONLINE = "ORDER_ONLINE"
    OPENING_HOURS = "OPENING_HOURS"
    WIFI_QUERY = "WIFI_QUERY"
    LOCATION_QUERY = "LOCATION_QUERY"
    STORE_INFO = "STORE_INFO"
    SERVICE_QUERY = "SERVICE_QUERY"
    POLICY_QUERY = "POLICY_QUERY"
    FOLLOW_UP = "FOLLOW_UP"
    UNKNOWN = "UNKNOWN"


class DocumentType(str, Enum):
    PRODUCT = "product"
    BUSINESS = "business"
    POLICY = "policy"
    INTERNAL = "internal"


PRODUCT_INTENTS = frozenset({
    Intent.MENU_QUERY,
    Intent.PRODUCT_AVAILABILITY,
    Intent.PRODUCT_PRICE,
    Intent.PRODUCT_DETAIL,
    Intent.PRODUCT_INFO,
    Intent.PRODUCT_INTEREST,
    Intent.PRODUCT_COMPARISON,
    Intent.CUSTOMIZE_DRINK,
    Intent.PRODUCT_RECOMMENDATION,
    Intent.PRODUCT_FILTER,
})
BUSINESS_INTENTS = frozenset({
    Intent.OPENING_HOURS,
    Intent.WIFI_QUERY,
    Intent.LOCATION_QUERY,
    Intent.STORE_INFO,
    Intent.SERVICE_QUERY,
    Intent.ORDER_INTENT,
    Intent.ORDER_ONLINE,
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
        r"^\s*(xin\s+chao|chao|hello|hi|alo)(?:\s+(ban|quan|shop))?\s*[?.!]*$",
        r"^\s*chao buoi (sang|toi)(?:\s+ban)?\s*[?.!]*$",
    ):
        return IntentDecision(Intent.GREETING, 0.99, "greeting")

    if token_count <= 3 and _contains(
        folded,
        r"^\s*(tai sao|vi sao|sao vay|the thi sao|con mon kia)\s*[?.!]*$",
    ):
        return IntentDecision(Intent.FOLLOW_UP, 0.98, "short-follow-up")

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
        r"\b(dat hang|dat mon|don hang)\b.*\b(online|truc tuyen|app|web)\b",
        r"\b(online|truc tuyen)\b.*\b(dat hang|dat mon|don hang)\b",
    ):
        return IntentDecision(Intent.ORDER_ONLINE, 0.98, "order-online")

    if _contains(folded, r"\b(dat hang|dat mon|muon dat|goi mon)\b"):
        return IntentDecision(Intent.ORDER_INTENT, 0.96, "order-intent")

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
        r"\b(so sanh|khac nhau|hon nhau)\b",
    ):
        return IntentDecision(Intent.PRODUCT_COMPARISON, 0.96, "product-comparison")

    if _contains(
        folded,
        r"\b(it ngot|giam ngot|giam duong|them duong|khong duong|tuy chinh)\b",
        r"\b(it da|them da|bot da|nhieu da|them topping|bo topping|doi topping|doi size)\b",
    ) and not _contains(folded, r"\b(mon nao|co mon nao)\b"):
        return IntentDecision(Intent.CUSTOMIZE_DRINK, 0.96, "customize-drink")

    if _contains(
        folded,
        r"\b(goi y|tu van|nen uong|phu hop|thich)\b",
        r"\bmon nao\b.*\b(it ngot|khong dang|beo|thanh|ngon)\b",
        r"\bco mon nao\b",
        r"\b(mon gi|gi)\b.*\bngon\b",
        r"\bngon\b.*\b(mon gi|mon nao)\b",
    ):
        return IntentDecision(Intent.PRODUCT_RECOMMENDATION, 0.94, "recommendation")

    if _contains(folded, r"\b(gia|bao nhieu|bao tien|may dong)\b"):
        return IntentDecision(Intent.PRODUCT_PRICE, 0.97, "price")

    if _contains(
        folded,
        r"\b(co|ban|phuc vu)\b.+\b(khong|khong vay|chu)\b",
        r"\b(con)\b.+\b(khong)\b",
    ) and not _contains(
        folded,
        r"\b(thanh phan|nguyen lieu|caffeine|huong vi|do ngot|nong hay lanh)\b",
    ):
        return IntentDecision(Intent.PRODUCT_AVAILABILITY, 0.96, "product-availability")

    if _contains(
        folded,
        r"\b(muon uong|muon dung|goi|lay)\b.*\b(ca phe|matcha|latte|bac xiu|cold brew)\b",
    ):
        return IntentDecision(Intent.PRODUCT_INTEREST, 0.95, "product-interest")

    if _contains(
        folded,
        r"\b(ca phe|matcha|latte|bac xiu|cold brew)\b.*\b(thi sao|the nao|co khong|con khong)\b",
    ):
        return IntentDecision(Intent.PRODUCT_INFO, 0.94, "product-info")

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

    if _contains(folded, r"\b(thong tin quan|quan co gi|gioi thieu quan)\b"):
        return IntentDecision(Intent.STORE_INFO, 0.90, "store-info")

    if _contains(
        folded,
        r"\b(dat ban|giao hang|mang ve|giu xe|nha ve sinh|tien ich|dich vu)\b",
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
        Intent.CUSTOMIZE_DRINK: (
            "Bạn muốn tùy chỉnh món nào? Bạn cho mình tên món để mình kiểm tra thông tin nhé!"
        ),
        Intent.PRODUCT_AVAILABILITY: (
            "Mình chưa tìm thấy thông tin chính xác về món này trong menu. "
            "Bạn cho mình tên món đầy đủ hơn để mình kiểm tra lại nhé!"
        ),
        Intent.PRODUCT_PRICE: (
            "Mình chưa tìm thấy thông tin chính xác về món này trong menu nên chưa thể báo giá. "
            "Bạn cho mình tên món đầy đủ hơn nhé!"
        ),
        Intent.ORDER_ONLINE: (
            "Mình chưa có thông tin xác nhận về kênh đặt hàng online. "
            "Bạn vui lòng hỏi nhân viên Smart Café nhé!"
        ),
        Intent.ORDER_INTENT: (
            "Bạn muốn đặt món nào? Mình có thể hỗ trợ tư vấn, nhưng chưa thể xác nhận tạo đơn khi chưa có API đặt hàng."
        ),
        Intent.FOLLOW_UP: "Bạn đang muốn hỏi thêm về món hoặc thông tin nào vậy?",
        Intent.UNKNOWN: (
            "Mình chưa có thông tin phù hợp để trả lời câu hỏi này. "
            "Mình có thể hỗ trợ bạn về menu, giá và dịch vụ của Smart Café nhé!"
        ),
    }
    return fallbacks.get(
        intent,
        "Hiện mình chưa có đủ thông tin xác nhận. Bạn vui lòng hỏi nhân viên Smart Café nhé!",
    )
