"""Tạo và kiểm tra câu trả lời grounded mà không thay đổi API contract."""
from __future__ import annotations

import re

from .intent import Intent
from .normalize import fold_text, search_tokens


_INTERNAL_LINE = re.compile(
    r"^\s*(?:[-*]\s*)?(?:mã món|nguồn|source|similarity(?: score)?|điểm tương đồng)\s*:",
    re.I,
)
_PRICE_RE = re.compile(r"(?<!\w)(\d{1,3}(?:[.,]\d{3})+|\d+)\s*(?:vnd|đ|đồng)", re.I)


def _prompt_parts(content: str) -> tuple[Intent, str, str]:
    intent_match = re.search(r"<intent>\s*([^<]+)\s*</intent>", content)
    context_match = re.search(r"<context>\s*(.*?)\s*</context>", content, re.S)
    question_match = re.search(r"Câu hỏi hiện tại:\s*(.*?)(?:\n|$)", content)
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
    ranked = sorted(
        pairs,
        key=lambda item: _overlap_score(question, item[0]),
        reverse=True,
    )
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
    """Trả lời đúng điểm mở/đóng cửa bằng giá trị parse từ context."""
    times = re.findall(r"(?<!\d)(\d{1,2})(?::(\d{2}))?\s*h?\b", answer, re.I)
    if len(times) < 2:
        return _clean_business_answer(answer)

    def display(value: tuple[str, str]) -> str:
        hour, minute = value
        return f"{int(hour):02d}:{minute}" if minute else f"{int(hour)}h"

    folded_question = fold_text(question)
    opening, closing = display(times[0]), display(times[-1])
    if "dong cua" in folded_question:
        return f"Smart Café đóng cửa lúc {closing} nhé!"
    if "mo cua" in folded_question:
        return f"Smart Café mở cửa lúc {opening} nhé!"
    return f"Smart Café mở cửa từ {opening} đến {closing} nhé!"


def _product_headings(blocks: list[tuple[str, str]]) -> list[str]:
    excluded = ("tổng quan", "quy tắc", "câu hỏi", "danh sách", "knowledge base")
    names: list[str] = []
    for heading, _ in blocks:
        name = _display_heading(heading)
        if name and not any(term in name.lower() for term in excluded) and name not in names:
            names.append(name)
    return names


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
                f"Dạ có nha! Quán hiện có {names[0]}. "
                "Bạn muốn mình xem giá món này không?"
            )
        if names:
            return (
                f"Dạ có nha! Quán hiện có {', '.join(names)}. "
                "Bạn muốn mình xem giá món nào?"
            )

    if intent in {
        Intent.PRODUCT_DETAIL,
        Intent.PRODUCT_INFO,
        Intent.PRODUCT_INTEREST,
        Intent.CUSTOMIZE_DRINK,
    }:
        heading, body = blocks[0]
        query_tokens = set(search_tokens(question))
        folded_question = fold_text(question)
        fields: list[str] = []
        if {"ngot", "duong"} & query_tokens:
            sweetness = _field(body, "Độ ngọt")
            customization = _field(body, "Tùy chỉnh")
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

    if intent in {
        Intent.WIFI_QUERY,
        Intent.OPENING_HOURS,
        Intent.LOCATION_QUERY,
        Intent.STORE_INFO,
        Intent.SERVICE_QUERY,
        Intent.ORDER_INTENT,
        Intent.ORDER_ONLINE,
        Intent.POLICY_QUERY,
    }:
        answer = _best_qa(blocks, question)
        if answer:
            if intent is Intent.OPENING_HOURS:
                return _opening_hours_answer(answer, question)
            return _clean_business_answer(answer)

    if intent in {
        Intent.MENU_QUERY,
        Intent.PRODUCT_COMPARISON,
        Intent.PRODUCT_RECOMMENDATION,
        Intent.PRODUCT_FILTER,
    }:
        answer = _best_qa(blocks, question)
        if answer:
            return _clean_business_answer(answer)
        names = _product_headings(blocks)[:5]
        if names:
            if intent is Intent.PRODUCT_RECOMMENDATION:
                return f"Dạ, bạn có thể thử {', '.join(names)} nhé. Đây đều là các món hiện có trong menu."
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
