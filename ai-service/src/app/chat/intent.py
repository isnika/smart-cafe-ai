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
    AFFIRMATION = "AFFIRMATION"
    NEGATION = "NEGATION"
    CONFIRMATION = "CONFIRMATION"
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
    ORDER_STATUS = "ORDER_STATUS"
    DELIVERY_QUERY = "DELIVERY_QUERY"
    PAYMENT_QUERY = "PAYMENT_QUERY"
    PROMOTION_QUERY = "PROMOTION_QUERY"
    OPENING_HOURS = "OPENING_HOURS"
    WIFI_QUERY = "WIFI_QUERY"
    LOCATION_QUERY = "LOCATION_QUERY"
    CONTACT_QUERY = "CONTACT_QUERY"
    STORE_INFO = "STORE_INFO"
    SERVICE_QUERY = "SERVICE_QUERY"
    IDENTITY = "IDENTITY"
    CAPABILITIES = "CAPABILITIES"
    POLICY_QUERY = "POLICY_QUERY"
    COMPLAINT = "COMPLAINT"
    CHITCHAT = "CHITCHAT"
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
    Intent.ORDER_STATUS,
    Intent.DELIVERY_QUERY,
    Intent.PROMOTION_QUERY,
    Intent.CONTACT_QUERY,
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
        r"^\s*(xin\s+chao|chao|hello|hi|alo)(?:\s+(ban|quan|shop))?(?:\s+(nha|nhe|a))?\s*[?.!]*$",
        r"^\s*chao buoi (sang|toi)(?:\s+ban)?\s*[?.!]*$",
    ):
        return IntentDecision(Intent.GREETING, 0.99, "greeting")

    if _contains(
        folded,
        r"^\s*(no|nope|khong|thoi|khong can|khong dau)\s*[?.!]*$",
    ):
        return IntentDecision(Intent.NEGATION, 0.99, "short-negation")

    if _contains(
        folded,
        r"^\s*(that khong|that a|dung that khong|sure|really)\s*[?.!]*$",
    ):
        return IntentDecision(Intent.CONFIRMATION, 0.98, "verify-previous-answer")

    if _contains(
        folded,
        r"^\s*(co|da|duoc|ok|okay|uh|u|dung|xem di)\s*[?.!]*$",
    ):
        return IntentDecision(Intent.AFFIRMATION, 0.99, "short-affirmation")

    if _contains(
        folded,
        r"^\s*[?/!]{2,}(?:\s+(nha|nhe|a))?\s*$",
        r"\b(tra loi kieu gi|tra loi gi vay|noi gi vay|khong hieu|bot bi sao|te qua)\b",
        r"\b(buc minh|that vong|khieu nai|phan nan)\b",
    ):
        return IntentDecision(Intent.COMPLAINT, 0.98, "complaint-or-confusion")

    if _contains(
        folded,
        r"^\s*(cam on|thanks|thank you|ok cam on|da cam on)(?:\s+(nha|nhe|a))?\s*[?.!]*$",
        r"^\s*(ban khoe khong|hom nay the nao)\s*[?.!]*$",
    ):
        return IntentDecision(Intent.CHITCHAT, 0.96, "light-chitchat")

    if _contains(
        folded,
        r"\b(ban la ai|ban la gi|chatbot la ai|chatbot la gi|tro ly ai la ai|tro ly la gi|ai dang tra loi)\b",
    ):
        return IntentDecision(Intent.IDENTITY, 0.99, "identity")

    if _contains(
        folded,
        r"\b(chuc nang|co the lam gi|ban lam duoc gi|ho tro duoc gi|giup duoc gi)\b",
        r"\b(chatbot|tro ly)\s+(co vai tro gi|co chuc nang gi|lam duoc gi|ho tro gi)\b",
        r"\b(vai tro cua chatbot|vai tro cua tro ly)\b",
        r"\bban\s+(co the|lam duoc|giup duoc)\b",
    ):
        return IntentDecision(Intent.CAPABILITIES, 0.99, "capabilities")

    # Prompt injection không phải câu hỏi menu; chặn trước các rule giá/sản phẩm.
    if _contains(
        folded,
        r"\bbo qua\b.*\b(quy tac|huong dan|system|prompt)\b",
        r"\b(tu bia|bia gia|gia mao)\b",
        r"\b(api key|mat khau|system prompt|thong tin noi bo)\b",
    ):
        return IntentDecision(Intent.UNKNOWN, 0.99, "out-of-scope")

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

    if _contains(folded, r"\b(wifi|internet)\b"):
        return IntentDecision(Intent.WIFI_QUERY, 0.99, "wifi-synonym")

    if _contains(
        folded,
        r"\b(mo cua|dong cua|gio hoat dong|gio lam viec)\b",
        r"\bmay gio\b.*\b(mo|dong|hoat dong|het ban)\b",
        r"\bbao gio\b.*\b(nghi|mo|dong)\b",
        r"\bluc nao\b.*\b(mo|dong)\b",
    ):
        return IntentDecision(Intent.OPENING_HOURS, 0.98, "opening-hours")

    if _contains(folded, r"\b(hotline|lien he|so dien thoai|sdt|phone)\b"):
        return IntentDecision(Intent.CONTACT_QUERY, 0.98, "contact")

    if _contains(folded, r"\b(dia chi|o dau|vi tri|cho nao)\b"):
        return IntentDecision(Intent.LOCATION_QUERY, 0.98, "location")

    if _contains(
        folded,
        r"\b(don|don hang)\b.*\b(chua giao|chua duoc giao|dang giao|giao toi dau|that lac|tre|cham)\b",
        r"\b(don|don hang)\b.*\b(giao chua|giao roi chua|da giao chua|toi chua)\b",
        r"\b(chua nhan|khong nhan duoc)\b.*\b(don|hang|mon)\b",
        r"\b(trang thai|theo doi|kiem tra)\b.*\b(don|don hang)\b",
    ):
        return IntentDecision(Intent.ORDER_STATUS, 0.99, "order-status")

    if _contains(
        folded,
        r"\b(thanh toan|chuyen khoan|tien mat|the ngan hang|the atm|visa|mastercard|momo|zalopay|vi dien tu|otp)\b",
        r"\b(xuat hoa don|hoa don vat|hoa don do)\b",
    ):
        return IntentDecision(Intent.PAYMENT_QUERY, 0.98, "payment")

    if _contains(
        folded,
        r"\b(khuyen mai|giam gia|voucher|ma giam|uu dai|tich diem|thanh vien)\b",
    ):
        return IntentDecision(Intent.PROMOTION_QUERY, 0.98, "promotion")

    if _contains(
        folded,
        r"\b(hoan tien|hoan don|huy don|doi mon|doi tra|refund)\b",
    ):
        return IntentDecision(Intent.POLICY_QUERY, 0.97, "policy")

    if _contains(
        folded,
        r"\b(dat hang|dat mon|don hang)\b.*\b(online|truc tuyen|app|web)\b",
        r"\b(online|truc tuyen)\b.*\b(dat hang|dat mon|don hang)\b",
        r"\b(dat|mua|goi)\b.*\b(online|truc tuyen)\b",
    ):
        return IntentDecision(Intent.ORDER_ONLINE, 0.98, "order-online")

    if _contains(
        folded,
        r"\b(giao hang|phi giao|phi ship|khu vuc giao|mang di|take away)\b",
    ):
        return IntentDecision(Intent.DELIVERY_QUERY, 0.97, "delivery")

    if _contains(
        folded,
        r"\b(dat hang|dat mon|muon dat|goi mon)\b",
        r"\bdat\b.*\b(cho minh|mot ly|mot mon)\b",
    ):
        return IntentDecision(Intent.ORDER_INTENT, 0.96, "order-intent")

    # Dịch vụ phải được định tuyến trước rule "có ... không" của sản phẩm.
    if _contains(
        folded,
        r"\b(dat ban|giao hang|mang ve|giu xe|nha ve sinh|tien ich|dich vu)\b",
        r"\b(cho ngoi|ban ghe|may lanh|dieu hoa|bai xe|cho dau xe)\b",
        r"\b(o cam|o dien|sac dien|cho sac)\b",
    ):
        return IntentDecision(Intent.SERVICE_QUERY, 0.96, "service")

    if _contains(
        folded,
        r"\b(duoi|tren|tu)\s*\d+[\d.]*\s*k?\b",
        r"\bngan sach\b",
        r"\bkhong (co )?(ca phe|caffeine)\b",
        r"\b(khong uong|tranh|khong dung duoc)\b.*\bcaffeine\b",
        r"\b(khong uong|khong dung|khong dung duoc|tranh)\b.*\b(sua|dairy|milk)\b",
        r"\bgia\s*(duoi|tren|tu)\b",
        r"\b(mon gi|mon nao|co mon gi|co mon nao)\b.*\b(man\b|vi man)\b",
    ):
        return IntentDecision(Intent.PRODUCT_FILTER, 0.95, "product-filter")

    if _contains(
        folded,
        r"\b(so sanh|khac nhau|hon nhau)\b",
        r"\bkhac\b.+\b(the nao|ra sao|gi)\b",
    ):
        return IntentDecision(Intent.PRODUCT_COMPARISON, 0.96, "product-comparison")

    if _contains(
        folded,
        r"\b(di ung|chat gay di ung|allergen|allergy)\b",
    ):
        return IntentDecision(Intent.PRODUCT_DETAIL, 0.96, "allergy-safety")

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

    # "bao nhiêu" không mặc định là giá: calories, dung tích, khối
    # lượng và caffeine là thuộc tính sản phẩm. Chỉ route PRICE khi có
    # từ khóa tiền hoặc "bao nhiêu" không đi kèm đơn vị thuộc tính.
    has_explicit_price_unit = _contains(folded, r"\b(gia|tien|vnd|dong)\b")
    asks_non_price_amount = _contains(
        folded,
        r"\b(calo|calorie|kcal|dung tich|bao nhieu ml|bao nhieu lit|bao nhieu gram|bao nhieu g)\b",
    ) or (
        not has_explicit_price_unit
        and _contains(folded, r"\b(caffeine|duong)\b.*\bbao nhieu\b")
    )
    if not asks_non_price_amount and _contains(
        folded, r"\b(gia|bao nhieu|bao tien|may dong)\b"
    ):
        return IntentDecision(Intent.PRODUCT_PRICE, 0.97, "price")

    if _contains(
        folded,
        r"\b(co|ban|phuc vu)\b.+\b(khong|khong vay|chu)\b",
        r"\b(con)\b.+\b(khong)\b",
    ) and not _contains(
        folded,
        r"\b(thanh phan|nguyen lieu|caffeine|huong vi|do ngot|nong hay lanh)\b",
        r"\b(don|don hang|giao hang|hoan|huy|thanh toan)\b",
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
    ) and not _contains(folded, r"\b(vi|huong vi)\s+(the nao|gi)\b"):
        return IntentDecision(Intent.PRODUCT_INFO, 0.94, "product-info")

    if _contains(
        folded,
        r"\b(thanh phan|nguyen lieu|caffeine|huong vi|vi gi|vi the nao|do ngot|it ngot|dang khong|nong hay lanh)\b",
        r"\b(calo|calorie|kcal|dung tich|the tich|bao nhieu ml|bao nhieu lit|khoi luong|bao nhieu gram)\b",
        r"\b(lanh hay nong|ban nong|ban lanh)\b",
        r"\b(ngon khong|co ngon|vi the nao)\b",
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
        r"\b(ca phe|matcha|latte|bac xiu|cappuccino|cold brew)\b",
    ):
        return IntentDecision(Intent.PRODUCT_INFO, 0.85, "product-mention")

    return IntentDecision(Intent.UNKNOWN, 0.0, "no-rule")


_COMPOUND_BUSINESS_INTENTS = frozenset({
    Intent.OPENING_HOURS,
    Intent.LOCATION_QUERY,
    Intent.CONTACT_QUERY,
    Intent.WIFI_QUERY,
    Intent.SERVICE_QUERY,
    Intent.DELIVERY_QUERY,
    Intent.PAYMENT_QUERY,
    Intent.PROMOTION_QUERY,
})


def classify_compound_intents(query: str) -> tuple[IntentDecision, ...]:
    """Nhận diện các yêu cầu business độc lập trong cùng một câu.

    Intent sản phẩm nhiều entity được resolver xử lý trên toàn query;
    hàm này chỉ tách các vế như "địa chỉ và giờ mở cửa".
    """
    canonical = canonicalize_query(query)
    clauses = [
        clause.strip(" ?.!,")
        for clause in re.split(r"\s+(?:và|rồi|với)\s+|[,;]", canonical, flags=re.I)
        if clause.strip(" ?.!,")
    ]
    if len(clauses) < 2:
        return ()
    decisions: list[IntentDecision] = []
    for clause in clauses:
        decision = classify_intent(clause)
        if decision.intent not in _COMPOUND_BUSINESS_INTENTS:
            continue
        if all(item.intent is not decision.intent for item in decisions):
            decisions.append(decision)
    return tuple(decisions) if len(decisions) >= 2 else ()


def allowed_document_types(intent: Intent) -> frozenset[DocumentType]:
    if intent in PRODUCT_INTENTS:
        return frozenset({DocumentType.PRODUCT})
    if intent in BUSINESS_INTENTS:
        return frozenset({DocumentType.BUSINESS})
    if intent in {Intent.POLICY_QUERY, Intent.PAYMENT_QUERY}:
        return frozenset({DocumentType.POLICY})
    return frozenset()


def fallback_for_intent(intent: Intent, previous_answer: str = "") -> str:
    """Fallback đúng chủ đề; đổi biến thể nếu lượt trước vừa dùng cùng một câu."""
    variants: dict[Intent, tuple[str, ...]] = {
        Intent.WIFI_QUERY: (
            "Mình chưa xác nhận được thông tin Wi-Fi này. Bạn hỏi nhân viên tại quầy giúp mình nhé!",
        ),
        Intent.OPENING_HOURS: (
            "Mình chưa có giờ hoạt động được xác nhận. Bạn hỏi nhân viên Smart Café giúp mình nhé!",
        ),
        Intent.LOCATION_QUERY: (
            "Mình chưa có địa chỉ được xác nhận trong dữ liệu. Bạn hỏi nhân viên Smart Café giúp mình nhé!",
        ),
        Intent.CONTACT_QUERY: (
            "Mình chưa có hotline chính thức được xác nhận. Bạn có thể gặp nhân viên tại quầy Smart Café, 97 Man Thiện, phường Hiệp Phú, Thành phố Hồ Chí Minh; nếu hỏi về đơn hàng, hãy dùng lại kênh bạn đã đặt đơn nhé!",
        ),
        Intent.CUSTOMIZE_DRINK: (
            "Bạn muốn tùy chỉnh món nào? Cho mình tên món để mình kiểm tra nhé!",
        ),
        Intent.PRODUCT_AVAILABILITY: (
            "Mình chưa tìm thấy chính xác món này trong menu. Bạn cho mình tên đầy đủ hơn nhé!",
        ),
        Intent.PRODUCT_PRICE: (
            "Mình chưa tìm thấy đúng món để báo giá. Bạn cho mình tên món đầy đủ hơn nhé!",
        ),
        Intent.PRODUCT_DETAIL: (
            "Bạn đang hỏi hương vị của món nào? Cho mình tên món để mình xem mô tả trong menu nhé!",
        ),
        Intent.PRODUCT_FILTER: (
            "Mình chưa tìm thấy món có vị mặn trong menu hiện tại. Nếu bạn muốn, mình có thể gợi ý một món đồ uống theo vị ngọt, béo, thanh hoặc đậm nhé!",
        ),
        Intent.AFFIRMATION: (
            "Mình chưa rõ bạn đang xác nhận điều gì. Bạn muốn xem giá hay thông tin món nào vậy?",
        ),
        Intent.NEGATION: (
            "Dạ được nha. Khi cần xem thêm món hoặc thông tin quán, bạn cứ nhắn mình nhé!",
        ),
        Intent.CONFIRMATION: (
            "Mình hiểu bạn muốn kiểm tra lại. Bạn cho mình biết thông tin cụ thể cần xác nhận nhé!",
        ),
        Intent.SERVICE_QUERY: (
            "Mình chưa có thông tin xác nhận về tiện ích này. Bạn hỏi nhân viên tại quầy giúp mình nhé!",
        ),
        Intent.DELIVERY_QUERY: (
            "Mình chưa xác nhận được quán có giao hàng hoặc mức phí giao hàng. Bạn hỏi nhân viên trước khi đặt nhé!",
        ),
        Intent.ORDER_ONLINE: (
            "Mình chưa có kênh đặt hàng online được xác nhận. Bạn liên hệ nhân viên Smart Café giúp mình nhé!",
        ),
        Intent.ORDER_INTENT: (
            "Bạn muốn đặt món nào? Mình có thể tư vấn, nhưng chưa thể tạo đơn khi chưa có API đặt hàng.",
        ),
        Intent.ORDER_STATUS: (
            "Mình xin lỗi vì đơn của bạn chưa được giao. Chatbot chưa tra cứu được trạng thái đơn; bạn chuẩn bị mã đơn rồi gửi qua kênh đã đặt đơn hoặc cho nhân viên tại quầy kiểm tra giúp nhé!",
            "Rất tiếc vì bạn vẫn chưa nhận được đơn. Mình chưa có quyền tra cứu đơn hàng; bạn vui lòng gửi mã đơn qua kênh đã đặt đơn hoặc cho nhân viên tại quầy để được hỗ trợ nhé!",
        ),
        Intent.POLICY_QUERY: (
            "Mình chưa thể xác nhận yêu cầu hoàn hoặc hủy đơn khi chưa biết trạng thái đơn. Bạn cung cấp mã đơn để nhân viên kiểm tra giúp nhé!",
            "Chính sách hoàn/hủy cần được nhân viên xác minh theo từng đơn. Bạn giữ mã đơn và biên nhận thanh toán để được hỗ trợ nhé!",
        ),
        Intent.PAYMENT_QUERY: (
            "Mình chưa có phương thức thanh toán này được xác nhận. Bạn kiểm tra với nhân viên và không chia sẻ OTP qua chat nhé!",
        ),
        Intent.PROMOTION_QUERY: (
            "Mình chưa có chương trình khuyến mãi hoặc thành viên được xác nhận. Bạn hỏi nhân viên để biết ưu đãi hiện tại nhé!",
        ),
        Intent.FOLLOW_UP: (
            "Bạn muốn hỏi tiếp về món hay thông tin nào vậy?",
            "Mình chưa nối được câu này với nội dung trước. Bạn nói rõ thêm một chút giúp mình nhé!",
        ),
        Intent.UNKNOWN: (
            "Mình chưa hiểu rõ câu hỏi này. Mình có thể hỗ trợ về menu, giá, đơn hàng và thông tin Smart Café nhé!",
            "Mình xin lỗi, mình vẫn chưa bắt đúng ý. Bạn thử nói ngắn hơn hoặc cho mình biết bạn đang hỏi về món, đơn hàng hay thông tin quán nhé!",
        ),
    }
    choices = variants.get(
        intent,
        ("Mình chưa có đủ thông tin xác nhận. Bạn hỏi nhân viên Smart Café giúp mình nhé!",),
    )
    previous = previous_answer.strip().casefold()
    return next((item for item in choices if item.strip().casefold() != previous), choices[0])
