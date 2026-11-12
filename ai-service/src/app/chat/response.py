"""Tạo và kiểm tra câu trả lời grounded mà không thay đổi API contract."""
from __future__ import annotations

import re

from .intent import Intent
from .normalize import fold_text, search_tokens


_INTERNAL_LINE = re.compile(
    r"^\s*(?:[-*]\s*)?(?:mã món|nguồn|source|similarity(?: score)?|điểm tương đồng|TODO_CHU_QUAN_DIEN[^:]*)\s*:",
    re.I,
)
_PRICE_RE = re.compile(r"(?<!\w)(\d{1,3}(?:[.,]\d{3})+|\d+)\s*(?:vnd|đ|đồng)", re.I)


def _prompt_parts(content: str) -> tuple[Intent, str, str]:
    intent_match = re.search(r"<intent>\s*([^<]+)\s*</intent>", content)
    context_match = re.search(r"<context>\s*(.*?)\s*</context>", content, re.S)
    question_tag_match = re.search(r"<question>\s*(.*?)\s*</question>", content, re.S)
    question_match = re.search(r"Câu hỏi hiện tại:\s*(.*?)(?:\n|$)", content)
    if question_match is None:
        question_match = question_tag_match
    try:
        intent = Intent(intent_match.group(1).strip()) if intent_match else Intent.UNKNOWN
    except ValueError:
        intent = Intent.UNKNOWN
    return (
        intent,
        context_match.group(1).strip() if context_match else "",
        question_match.group(1).strip() if question_match else "",
    )


def _context_blocks(context: str) -> list[tuple[str, str]]:
    blocks: list[tuple[str, str]] = []
    for raw in context.split("\n\n---\n\n"):
        cleaned = re.sub(r"^\(Nguồn:.*?\)\n", "", raw, flags=re.S).strip()
        heading_match = re.match(r"^\[([^\]]+)\]\s*", cleaned)
        heading = heading_match.group(1).strip() if heading_match else ""
        body = cleaned[heading_match.end():].strip() if heading_match else cleaned
        if body:
            blocks.append((heading, body))
    return blocks


def _overlap_score(question: str, text: str) -> int:
    query_tokens = set(search_tokens(question))
    return len(query_tokens & set(search_tokens(text)))


def _best_blocks(blocks: list[tuple[str, str]], question: str) -> list[tuple[str, str]]:
    return sorted(
        blocks,
        key=lambda item: _overlap_score(question, f"{item[0]} {item[1]}"),
        reverse=True,
    )


def _qa_pairs(blocks: list[tuple[str, str]]) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for _, body in blocks:
        pairs.extend(
            (question.strip(), answer.strip())
            for question, answer in re.findall(
                r"Q:\s*(.*?)\nA:\s*(.*?)(?=\n\s*Q:|\Z)",
                body,
                flags=re.S,
            )
        )
    return pairs


def _best_qa(blocks: list[tuple[str, str]], question: str) -> str | None:
    pairs = _qa_pairs(blocks)
    if not pairs:
        return None
    query_tokens = search_tokens(question)

    def relevance(item: tuple[str, str]) -> tuple[int, int]:
        candidate = " ".join(search_tokens(item[0]))
        phrase_hits = sum(
            f"{left} {right}" in candidate
            for left, right in zip(query_tokens, query_tokens[1:])
        )
        return phrase_hits, _overlap_score(question, item[0])

    ranked = sorted(pairs, key=relevance, reverse=True)
    if _overlap_score(question, ranked[0][0]) <= 0:
        return None
    return ranked[0][1]


def _field(body: str, label: str) -> str | None:
    match = re.search(rf"^\s*[-*]\s*{re.escape(label)}:\s*(.+)$", body, re.I | re.M)
    return match.group(1).strip() if match else None


def _display_heading(heading: str) -> str:
    return heading.split(" > ")[-1].strip() if heading else "Món này"


def _clean_business_answer(answer: str) -> str:
    answer = re.sub(r"^Xin chào bạn,?\s*", "", answer.strip(), flags=re.I)
    answer = re.sub(r"\s+([?!.,])", r"\1", answer)
    return answer[:1].upper() + answer[1:] if answer else answer


def _opening_hours_answer(answer: str, question: str) -> str:
    """Luôn trả đủ hai mốc khi context có giờ mở và đóng cửa."""
    times = re.findall(r"(?<!\d)(\d{1,2})(?::(\d{2}))?\s*h?\b", answer, re.I)
    if len(times) < 2:
        return _clean_business_answer(answer)

    def display(value: tuple[str, str]) -> str:
        hour, minute = value
        return f"{int(hour):02d}:{minute}" if minute else f"{int(hour)}h"

    opening, closing = display(times[0]), display(times[-1])
    folded_question = fold_text(question)
    asks_closing = "dong cua" in folded_question
    asks_opening = "mo cua" in folded_question
    if asks_closing and not asks_opening:
        return (
            f"Smart Café đóng cửa lúc {closing} nhé. "
            f"Giờ hoạt động đầy đủ là từ {opening} đến {closing} hằng tuần."
        )
    if asks_opening and not asks_closing:
        return f"Smart Café mở cửa lúc {opening} và đóng cửa lúc {closing} hằng tuần nhé!"
    return f"Smart Café mở cửa từ {opening} đến {closing} hằng tuần nhé!"


def _product_headings(blocks: list[tuple[str, str]]) -> list[str]:
    excluded = ("tổng quan", "quy tắc", "câu hỏi", "danh sách", "knowledge base")
    names: list[str] = []
    for heading, body in blocks:
        # FAQ có document_type=product cho mục tư vấn, nhưng không phải
        # record menu và không được hiển thị như tên món.
        if not (_field(body, "Mã món") or _field(body, "Giá") or _field(body, "Giá mẫu")):
            continue
        name = _display_heading(heading)
        if name and not any(term in name.lower() for term in excluded) and name not in names:
            names.append(name)
    return names


def _product_blocks(blocks: list[tuple[str, str]]) -> list[tuple[str, str]]:
    return [(heading, body) for heading, body in blocks if _field(body, "Mã món")]


def _comparison_answer(blocks: list[tuple[str, str]]) -> str:
    rows: list[str] = []
    for heading, body in _product_blocks(blocks)[:4]:
        details = list(filter(None, [
            _field(body, "Mô tả"),
            _field(body, "Nhiệt độ"),
            _field(body, "Caffeine"),
        ]))
        price = _field(body, "Giá") or _field(body, "Giá mẫu")
        if price:
            details.append(re.sub(r"\s*VND\b", "đ", price, flags=re.I))
        rows.append(f"{_display_heading(heading)}: {'; '.join(details[:4])}")
    if len(rows) < 2:
        return ""
    return "So sánh theo menu hiện có: " + ". ".join(rows) + "."


def _filter_answer(blocks: list[tuple[str, str]]) -> str:
    rows: list[str] = []
    for heading, body in _product_blocks(blocks)[:6]:
        price = _field(body, "Giá") or _field(body, "Giá mẫu")
        display_price = re.sub(r"\s*VND\b", "đ", price, flags=re.I) if price else "chưa có giá"
        rows.append(f"{_display_heading(heading)} ({display_price})")
    return "Các món phù hợp: " + "; ".join(rows) + "." if rows else ""


def _plain_excerpt(body: str) -> str:
    lines = []
    for line in body.splitlines():
        cleaned = line.strip().lstrip("*- ").strip()
        if not cleaned or _INTERNAL_LINE.match(line):
            continue
        if cleaned.startswith(("Q:", "A:")):
            cleaned = cleaned[2:].strip()
        lines.append(cleaned)
        if len(" ".join(lines)) >= 300:
            break
    return " ".join(lines)[:360]


def _recommendation_answer(blocks: list[tuple[str, str]]) -> str:
    suggestions: list[str] = []
    for heading, body in blocks:
        if not _field(body, "Mã món"):
            continue
        name = _display_heading(heading)
        description = _field(body, "Mô tả")
        price = _field(body, "Giá") or _field(body, "Giá mẫu")
        details: list[str] = []
        if price:
            details.append(re.sub(r"\s*VND\b", "đ", price, flags=re.I))
        if description:
            details.append(description.rstrip("."))
        suggestions.append(f"{name} ({'; '.join(details)})" if details else name)
        if len(suggestions) == 3:
            break
    if not suggestions:
        return ""
    return (
        "Dạ, bạn có thể thử " + "; ".join(suggestions) + ". "
        "Bạn thích món nóng hay lạnh, vị ngọt béo hay đậm đắng để mình gợi ý sát hơn?"
    )


def build_extractive_answer(prompt_content: str) -> str:
    """Fallback tự nhiên, chỉ trích thông tin có trong context đã lọc."""
    intent, context, question = _prompt_parts(prompt_content)
    blocks = _best_blocks(_context_blocks(context), question)
    if not blocks:
        return ""

    if intent is Intent.PRODUCT_PRICE:
        priced: list[tuple[str, str, str | None]] = []
        for heading, body in blocks:
            price = _field(body, "Giá mẫu") or _field(body, "Giá")
            if price:
                priced.append((
                    _display_heading(heading),
                    re.sub(r"\s*VND\b", "đ", price, flags=re.I),
                    _field(body, "Mô tả"),
                ))
        if len(priced) > 1:
            options = "; ".join(f"{name}: {price}" for name, price, _ in priced[:5])
            return f"Các món phù hợp trong menu gồm {options}. Bạn muốn chọn món nào nha?"
        if priced:
            name, price, description = priced[0]
            answer = f"{name} có giá tham khảo {price} nha!"
            if description:
                answer += f" {description}"
            return answer

    if intent is Intent.PRODUCT_AVAILABILITY:
        names = _product_headings(blocks)[:5]
        if len(names) == 1:
            return (
                f"Dạ có nha! Ý mình là {names[0]} có trong menu; mình chưa "
                "có dữ liệu tồn món theo chi nhánh. Bạn muốn mình xem giá "
                "món này hay chọn chi nhánh để kiểm tra tình trạng còn món?"
            )
        if names:
            return (
                f"{', '.join(names)} có trong menu. Tình trạng còn món cần "
                "được kiểm tra theo chi nhánh nhé!"
            )

    if intent in {
        Intent.PRODUCT_DETAIL,
        Intent.PRODUCT_INFO,
        Intent.PRODUCT_INTEREST,
        Intent.CUSTOMIZE_DRINK,
    }:
        if intent is Intent.PRODUCT_INFO:
            names = _product_headings(blocks)[:5]
            if len(names) > 1:
                return (
                    f"Mình tìm thấy {', '.join(names)}. "
                    "Bạn muốn hỏi thông tin món nào?"
                )
        heading, body = blocks[0]
        query_tokens = set(search_tokens(question))
        folded_question = fold_text(question)
        fields: list[str] = []
        if {"calo", "calorie", "kcal"} & query_tokens:
            return (
                f"Catalog hiện chưa có thông tin calories được xác nhận cho "
                f"{_display_heading(heading)}; mình không muốn đoán sai cho bạn."
            )
        if {"dung", "tich", "ml", "lit", "gram", "khoi", "luong"} & query_tokens:
            return (
                f"Catalog hiện chưa có dung tích hoặc khối lượng được xác nhận cho "
                f"{_display_heading(heading)}; bạn hỏi nhân viên giúp mình nhé!"
            )
        if {"ngot", "duong"} & query_tokens:
            sweetness = _field(body, "Độ ngọt")
            customization = _field(body, "Tùy chỉnh")
            if not sweetness:
                description = _field(body, "Mô tả")
                prefix = f"{_display_heading(heading)}: {description}. " if description else f"{_display_heading(heading)}: "
                if any(phrase in folded_question for phrase in ("tai sao", "vi sao", "sao vay")):
                    return prefix + "Vì catalog chưa có mức ngọt hoặc tùy chọn giảm đường được xác nhận, mình không muốn đoán sai cho bạn."
                return prefix + "Mức ngọt và khả năng giảm đường hiện chưa được xác nhận; bạn hỏi nhân viên giúp mình nhé!"
            supports_sweetness_change = bool(
                customization and re.search(r"ngọt|đường|sữa", customization, re.I)
            )
            if sweetness and any(
                phrase in folded_question for phrase in ("tai sao", "vi sao", "sao vay")
            ):
                detail = sweetness.rstrip(".")
                detail = detail[:1].lower() + detail[1:] if detail else detail
                return (
                    f"Độ ngọt của {_display_heading(heading)} {detail}. "
                    "Vì vậy, mức ngọt thực tế cần được quán xác nhận nhé!"
                )
            if intent is Intent.CUSTOMIZE_DRINK and sweetness and not supports_sweetness_change:
                return (
                    f"{_display_heading(heading)} có độ ngọt {sweetness[:1].lower() + sweetness[1:]} "
                    "Hiện mình chưa xác nhận được quán có hỗ trợ làm ít ngọt cho món này; "
                    "bạn hỏi nhân viên giúp mình nhé!"
                )
            fields.extend(filter(None, [sweetness]))
            if customization and supports_sweetness_change:
                fields.append(customization)
        elif "caffeine" in query_tokens:
            fields.extend(filter(None, [_field(body, "Caffeine")]))
        elif {"thanh", "phan", "nguyen", "lieu"} & query_tokens:
            fields.extend(filter(None, [_field(body, "Mô tả"), _field(body, "Lưu ý")]))
        elif {"nong", "lanh", "ice", "iced", "hot", "cold"} & query_tokens:
            temperature = _field(body, "Nhiệt độ")
            temperature_folded = fold_text(temperature or "")
            name = _display_heading(heading)
            if "nong" in temperature_folded and "lanh" in temperature_folded:
                return f"{name} có cả lựa chọn nóng và lạnh nha."
            if "nong" in temperature_folded:
                return f"{name} được phục vụ nóng nha."
            if "lanh" in temperature_folded:
                return f"{name} được phục vụ lạnh nha."
            return (
                f"Mình chưa có thông tin nóng/lạnh được xác nhận cho {name}; "
                "bạn hỏi nhân viên tại quầy giúp mình nhé!"
            )
        elif "ngon" in query_tokens:
            description = _field(body, "Mô tả")
            suitable = _field(body, "Phù hợp với")
            name = _display_heading(heading)
            if description:
                taste = description.rstrip(".")
                taste = taste[:1].lower() + taste[1:] if taste else taste
                preference = (
                    f" Món này phù hợp với {suitable[:1].lower() + suitable[1:].rstrip('.')}"
                    if suitable else ""
                )
                return (
                    f"Nếu bạn thích {taste}, {name} có thể khá hợp khẩu vị.{preference} "
                    "Khẩu vị mỗi người khác nhau; bạn thích vị đậm hay béo ngọt để mình tư vấn sát hơn?"
                )
            return (
                f"Mình chưa có mô tả hương vị đủ rõ để đánh giá {name}. "
                "Bạn cho mình biết khẩu vị thích đậm, béo hay thanh để mình gợi ý món khác nhé!"
            )
        elif intent is Intent.CUSTOMIZE_DRINK:
            customization = _field(body, "Tùy chỉnh")
            requested_terms = {"da", "topping", "size"} & query_tokens
            if customization and any(
                term in set(search_tokens(customization)) for term in requested_terms
            ):
                fields.append(customization)
            else:
                return (
                    f"Hiện mình chưa xác nhận được quán có hỗ trợ tùy chỉnh này cho "
                    f"{_display_heading(heading)}; bạn hỏi nhân viên giúp mình nhé!"
                )
        else:
            fields.extend(filter(None, [_field(body, "Mô tả")]))
        if fields:
            return f"{_display_heading(heading)}: {' '.join(fields[:2])}"
        description = _field(body, "Mô tả")
        if description:
            return f"{_display_heading(heading)}: {description}"
        return ""

    if intent in {
        Intent.WIFI_QUERY,
        Intent.OPENING_HOURS,
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
    }:
        answer = _best_qa(blocks, question)
        if answer:
            if intent is Intent.OPENING_HOURS:
                return _opening_hours_answer(answer, question)
            return _clean_business_answer(answer)
        # Có chunk cùng loại tài liệu không đồng nghĩa context trả lời được câu hỏi.
        # Không rơi xuống plain excerpt vì có thể trả một dịch vụ hoàn toàn khác.
        return ""

    if intent in {
        Intent.MENU_QUERY,
        Intent.PRODUCT_COMPARISON,
        Intent.PRODUCT_RECOMMENDATION,
        Intent.PRODUCT_FILTER,
    }:
        if intent is Intent.PRODUCT_COMPARISON:
            return _comparison_answer(blocks)
        if intent is Intent.PRODUCT_FILTER:
            return _filter_answer(blocks)
        if intent is Intent.PRODUCT_RECOMMENDATION:
            recommendation = _recommendation_answer(blocks)
            if recommendation:
                return recommendation
        answer = _best_qa(blocks, question)
        if answer:
            return _clean_business_answer(answer)
        names = _product_headings(blocks)[:5]
        if names:
            return f"Một số món hiện có trong menu gồm {', '.join(names)} nhé."

    answer = _best_qa(blocks, question)
    return _clean_business_answer(answer) if answer else _plain_excerpt(blocks[0][1])


def sanitize_generated_answer(answer: str) -> str:
    """Loại prefix máy móc và metadata nội bộ nếu model vô tình xuất ra."""
    cleaned = re.sub(
        r"^\s*(?:Thông tin mình có là|Theo dữ liệu(?: được cung cấp)?|Dựa trên nguồn truy xuất)\s*:?\s*",
        "",
        answer.strip(),
        flags=re.I,
    )
    lines = [line for line in cleaned.splitlines() if not _INTERNAL_LINE.match(line)]
    return "\n".join(lines).strip()


def answer_prices_are_grounded(answer: str, context: str) -> bool:
    """Không cho phép model sinh một mức giá không xuất hiện trong context."""
    normalize = lambda value: re.sub(r"\D", "", value)
    answer_prices = {normalize(match.group(1)) for match in _PRICE_RE.finditer(answer)}
    if not answer_prices:
        return True
    context_prices = {normalize(match.group(1)) for match in _PRICE_RE.finditer(context)}
    return answer_prices.issubset(context_prices)
