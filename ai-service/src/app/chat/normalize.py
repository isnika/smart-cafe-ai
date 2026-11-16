"""Chuẩn hóa truy vấn tiếng Việt và nhận diện câu hỏi tiếp nối.

Các hàm trong module này chỉ thay đổi *truy vấn tìm kiếm*. Nội dung gốc của
khách vẫn được gửi cho LLM để tránh làm sai ý hoặc sửa quá tay câu trả lời.
"""
from __future__ import annotations

import re
import unicodedata


_SPACE_RE = re.compile(r"\s+")
_WORD_RE = re.compile(r"[0-9a-zA-ZÀ-ỹđĐ]+", re.UNICODE)

# Chỉ chuẩn hóa các biến thể có độ chắc chắn cao và thường gặp trong chat.
# Không dùng một từ điển sửa chính tả rộng vì có thể làm đổi tên món.
_QUERY_REPLACEMENTS = (
    # Sửa các lỗi/cách viết có ngữ cảnh rõ, không dùng autocorrect rộng.
    (re.compile(r"\b(?:quán|quan)\s+(?:ở|o)\s+cửa\b", re.I), "quán mở cửa"),
    (re.compile(r"\b(?:ở|o)\s+cửa(?=\s+(?:lúc|luc|mấy|may|bao|khi))", re.I), "mở cửa"),
    (re.compile(r"\btrả\s+lười\b|\btra\s+luoi\b", re.I), "trả lời"),
    (re.compile(r"\bcsf\s*ph[eê]\s*(?:sữa|sua)\b", re.I), "cà phê sữa"),
    (re.compile(r"\b(?:ca\s*phe|cafe|coffee|cf)\b", re.I), "cà phê"),
    (re.compile(r"\bcà phê\s+sua\b", re.I), "cà phê sữa"),
    (re.compile(r"\b(?:matcha|mat\s*cha|mát\s*cha)\b", re.I), "matcha"),
    (re.compile(r"\b(?:khong|ko|k|hok|hông|hong|hem)\b", re.I), "không"),
    (re.compile(r"\b(?:dc|duoc)\b", re.I), "được"),
    (re.compile(r"\b(?:onl|online)\b", re.I), "online"),
    (re.compile(r"\b(?:dat|đặt)\s*(?:don|đơn)\b", re.I), "đặt hàng"),
    (re.compile(r"\b(?:bao\s*nhiu|bao\s*nhieu|bi\s*nhiu|bn|bnh)\b", re.I), "bao nhiêu"),
    (re.compile(r"\b(?:mấy\s*đồng|bao\s*nhiêu\s*tiền)\b", re.I), "giá bao nhiêu"),
    (re.compile(r"\b(?:wi[\s-]?fi|wf|wife|internet|mạng)\b", re.I), "wifi"),
    # "mang" không dấu chỉ là mạng khi có ngữ cảnh; không sửa
    # trong "sinh to mang cau" (sinh tố mãng cầu).
    (re.compile(r"\b(?:co|quan co)\s+mang\b|\bmang\s+(?:khong|k)\b", re.I), "wifi"),
    (re.compile(r"\b(?:ship|shipping)\b", re.I), "giao hàng"),
    (re.compile(r"\b(?:hot\s*(?:or|/)?\s*(?:ice|iced|cold)|(?:ice|iced|cold)\s*(?:or|/)?\s*hot)\b", re.I), "nóng hay lạnh"),
    (re.compile(r"\bhạy\b", re.I), "hay"),
)

_STOP_WORDS = {
    "a", "ạ", "anh", "ban", "bạn", "bao", "chi", "chị", "cho", "co", "có",
    "cua", "của", "duoc", "được", "gi", "gì", "la", "là", "minh", "mình",
    "khong", "mot", "một", "nhe", "nhé", "nhieu", "oi", "ơi", "quan", "quán",
    "smart", "cafe", "tien", "toi", "tôi", "uong", "va", "và", "voi", "với",
}

_FOLLOWUP_PHRASES = (
    "bao nhiêu", "giá", "món đó", "món này", "loại đó", "loại kia",
    "cái đó", "cái này", "nó", "còn không", "còn món", "còn loại",
    "thứ hai", "thứ 2", "vậy", "thế", "còn cái",
    "tại sao", "vì sao", "sao vậy",
    "đóng cửa", "mở cửa",
)

_ATTRIBUTE_FOLLOWUP_PHRASES = (
    "ít ngọt", "độ ngọt", "caffeine", "thành phần", "nóng không", "lạnh không",
    "ngon không", "nóng hay lạnh", "lạnh hay nóng", "bán nóng", "bán lạnh",
)

_SHORT_ATTRIBUTE_TOKENS = {
    "ngon", "nong", "lanh", "hay", "caffeine", "thanh", "phan", "nguyen",
    "lieu", "ngot", "duong", "it", "giam", "bot", "them", "vi", "dang", "beo",
    "ice", "iced", "hot", "cold",
}

_REFERENCE_PHRASES = (
    "món đó", "món này", "loại đó", "loại kia", "cái đó", "cái này",
    "nó", "thứ hai", "thứ 2", "vậy", "thế", "tại sao", "vì sao", "sao vậy",
    "còn cái kia", "còn món kia",
)


def clean_text(text: str) -> str:
    """Chuẩn hóa Unicode và khoảng trắng nhưng giữ nguyên dấu tiếng Việt."""
    return _SPACE_RE.sub(" ", unicodedata.normalize("NFKC", text or "")).strip()


def canonicalize_query(text: str) -> str:
    """Chuẩn hóa một số cách viết chat phổ biến để tăng recall khi retrieval."""
    normalized = clean_text(text).lower()
    for pattern, replacement in _QUERY_REPLACEMENTS:
        normalized = pattern.sub(replacement, normalized)
    return _SPACE_RE.sub(" ", normalized).strip()


def fold_text(text: str) -> str:
    """Bỏ dấu để so khớp lexical; không dùng chuỗi này làm nội dung trả lời."""
    value = canonicalize_query(text).replace("đ", "d")
    return "".join(
        char for char in unicodedata.normalize("NFD", value)
        if unicodedata.category(char) != "Mn"
    )


def search_tokens(text: str) -> list[str]:
    """Tạo token gọn cho lexical/fuzzy retrieval."""
    tokens = [token.lower() for token in _WORD_RE.findall(fold_text(text))]
    return [token for token in tokens if len(token) > 1 and token not in _STOP_WORDS]


def _has_phrase(folded_text: str, phrase: str) -> bool:
    """Khớp cả cụm/từ, không để "giá" khớp "giao" hay "nó" khớp "nóng"."""
    folded_phrase = fold_text(phrase)
    return bool(re.search(rf"(?<!\w){re.escape(folded_phrase)}(?!\w)", folded_text))


def is_contextual_followup(question: str) -> bool:
    """Nhận diện câu ngắn cần gắn với lượt trước, không gọi LLM."""
    canonical = canonicalize_query(question)
    folded = fold_text(canonical)
    tokens = search_tokens(canonical)
    has_reference = any(_has_phrase(folded, phrase) for phrase in _REFERENCE_PHRASES)
    has_followup_cue = any(_has_phrase(folded, phrase) for phrase in _FOLLOWUP_PHRASES)
    has_attribute_cue = any(
        _has_phrase(folded, phrase) for phrase in _ATTRIBUTE_FOLLOWUP_PHRASES
    )
    attribute_only = bool(tokens) and all(token in _SHORT_ATTRIBUTE_TOKENS for token in tokens)
    # Khi câu đã có tên món (vd. "Matcha Latte có caffeine không?") thì
    # không ghép chủ đề cũ. Câu thuộc tính rút gọn thường chỉ còn 1–2 token.
    return (
        has_reference
        or (has_followup_cue and len(tokens) <= 5)
        or (has_attribute_cue and len(tokens) <= 4 and attribute_only)
    )


def needs_llm_rewrite(question: str) -> bool:
    """Chỉ dành lượt rewrite tốn phí cho câu dài nhưng còn đại từ mơ hồ."""
    if not question:
        return False
    folded = fold_text(question)
    return len(search_tokens(question)) > 5 and any(
        _has_phrase(folded, phrase) for phrase in _REFERENCE_PHRASES
    )


def contextualize_followup(question: str, history: list[dict]) -> str | None:
    """Ghép câu tiếp nối với lượt gần nhất mà không tự thêm dữ kiện mới."""
    if not history or not is_contextual_followup(question):
        return None

    previous_user = ""
    previous_assistant = ""
    for item in reversed(history):
        content = clean_text(str(item.get("content", "")))
        if not content:
            continue
        if item.get("role") == "assistant" and not previous_assistant:
            previous_assistant = content[:500]
        elif item.get("role") == "user":
            previous_user = content[:500]
            break

    if not previous_user:
        return None

    parts = [previous_user]
    # Câu kiểu "món thứ 2" cần danh sách vừa được bot nêu; câu hỏi giá đơn
    # giản thường chỉ cần lời khách trước đó, giúp query ngắn hơn.
    folded = fold_text(question)
    if previous_assistant and any(_has_phrase(folded, p) for p in _REFERENCE_PHRASES):
        parts.append(previous_assistant)
    parts.append(clean_text(question))
    return " ".join(parts)
