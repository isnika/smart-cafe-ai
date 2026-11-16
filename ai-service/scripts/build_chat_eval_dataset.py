"""Tạo evaluation seed hoặc nhập câu hỏi từ log thật sau khi ẩn danh.

Seed 320 câu giúp CI chạy ngay. Dữ liệu log nhập qua ``--logs`` luôn được
đánh dấu ``needs_review=true``; không tự bịa ground truth cho log production.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRODUCTS = ROOT / "src/app/chat/knowledge_base/products.csv"
DEFAULT_OUTPUT = ROOT / "evaluation/chat_eval_seed.jsonl"


def _case(
    index: int,
    query: str,
    intent: str,
    source_terms: list[str] | None = None,
    answer_terms: list[str] | None = None,
    forbidden_terms: list[str] | None = None,
) -> dict:
    return {
        "id": f"eval-{index:04d}",
        "query": query,
        "expected_intent": intent,
        "expected_source_terms": source_terms or [],
        "required_answer_terms": answer_terms or [],
        "forbidden_answer_terms": forbidden_terms or ["TODO_CHU_QUAN_DIEN"],
        "needs_review": False,
    }


def build_seed() -> list[dict]:
    with PRODUCTS.open(encoding="utf-8-sig", newline="") as handle:
        products = list(csv.DictReader(handle))
    cases: list[dict] = []

    def add(query: str, intent: str, sources=None, answers=None, forbidden=None):
        cases.append(_case(len(cases) + 1, query, intent, sources, answers, forbidden))

    price_templates = (
        "{name} giá bao nhiêu?",
        "Cho mình xem giá {name}",
        "{name} bao nhiêu tiền vậy?",
        "gia {name} bn",
    )
    for index, product in enumerate(products):
        name = product["name"]
        price = f"{int(product['price_vnd']):,}".replace(",", ".")
        add(
            price_templates[index % len(price_templates)].format(name=name),
            "PRODUCT_PRICE",
            [name],
            [name, price],
        )

    availability_templates = (
        "Quán có {name} không?",
        "{name} còn không?",
        "Mình tìm {name}, menu có không?",
    )
    for index, product in enumerate(products[:60]):
        name = product["name"]
        add(
            availability_templates[index % 3].format(name=name),
            "PRODUCT_AVAILABILITY",
            [name],
            [name, "menu"],
            ["TODO_CHU_QUAN_DIEN", "hiện còn hàng"],
        )

    detail_templates = (
        "{name} có caffeine không?",
        "{name} uống nóng hay lạnh?",
        "{name} có thành phần gì?",
        "{name} vị thế nào?",
    )
    for index, product in enumerate(products[:40]):
        name = product["name"]
        add(
            detail_templates[index % 4].format(name=name),
            "PRODUCT_DETAIL",
            [name],
            [name],
        )

    for index in range(20):
        left = products[index * 2]["name"]
        right = products[index * 2 + 1]["name"]
        add(
            f"So sánh {left} và {right}",
            "PRODUCT_COMPARISON",
            [left, right],
            [left, right],
        )

    filters = [
        ("Món nào dưới 40k?", ["phù hợp"]),
        ("Cho mình các món dưới 50 nghìn", ["phù hợp"]),
        ("Có món nào không caffeine?", ["phù hợp"]),
        ("Ngân sách 45k thì uống gì?", ["phù hợp"]),
        ("Món giá trên 55k", ["phù hợp"]),
    ]
    for index in range(20):
        query, terms = filters[index % len(filters)]
        add(f"{query} {'nhé' if index % 2 else ''}".strip(), "PRODUCT_FILTER", ["products.csv"], terms)

    business = [
        ("Quán mở cửa lúc mấy giờ?", "OPENING_HOURS", ["Giờ mở cửa"], ["7h", "22h"]),
        ("Mấy giờ quán đóng cửa?", "OPENING_HOURS", ["Giờ mở cửa"], ["22h"]),
        ("Quán có wifi không?", "WIFI_QUERY", ["Wi-Fi"], ["Wi-Fi"]),
        ("Co mang khong?", "WIFI_QUERY", ["Wi-Fi"], ["Wi-Fi"]),
        ("Địa chỉ Smart Café ở đâu?", "LOCATION_QUERY", ["Địa chỉ"], ["97 Man Thiện"]),
        ("Hotline quán là gì?", "CONTACT_QUERY", ["Địa chỉ và liên hệ"], ["chưa có hotline"]),
        ("Quán có giao hàng không?", "DELIVERY_QUERY", ["Đặt hàng"], ["chưa có thông tin"]),
        ("Mình muốn hủy đơn", "POLICY_QUERY", ["refund.md"], ["mã đơn"]),
        ("Đơn của mình chưa giao", "ORDER_STATUS", ["Đặt hàng"], ["mã đơn"]),
        ("Quán nhận chuyển khoản không?", "PAYMENT_QUERY", ["payment.md"], ["xác nhận"]),
    ]
    for index in range(40):
        query, intent, sources, answers = business[index % len(business)]
        add(f"{query} {'ạ' if index % 2 else ''}".strip(), intent, sources, answers)

    tail = [
        ("Xin chào", "GREETING", [], ["Xin chào"]),
        ("hello bạn", "GREETING", [], ["Xin chào"]),
        ("Cảm ơn nha", "CHITCHAT", [], ["Cảm ơn"]),
        ("Thời tiết hôm nay sao?", "UNKNOWN", [], ["chưa hỗ trợ"]),
        ("Giá Bitcoin ngày mai", "UNKNOWN", [], ["chưa hỗ trợ"]),
        ("Quán có nhà vệ sinh không?", "SERVICE_QUERY", [], ["chưa có thông tin"]),
        ("Mình muốn đặt món", "ORDER_INTENT", ["Đặt hàng"], ["API"]),
        ("??", "COMPLAINT", [], ["xin lỗi"]),
        ("Cho mình xem menu", "MENU_QUERY", ["products.csv"], ["menu"]),
        ("Mình không uống caffeine", "PRODUCT_FILTER", ["products.csv"], ["phù hợp"]),
    ]
    while len(cases) < 320:
        query, intent, sources, answers = tail[(len(cases) - 282) % len(tail)]
        add(query + (" nha" if len(cases) % 2 else ""), intent, sources, answers)
    return cases[:320]


_EMAIL = re.compile(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b")
_PHONE = re.compile(r"(?<!\d)(?:\+?84|0)\d{8,10}(?!\d)")
_ORDER = re.compile(r"(?<!\w)(?=[A-Za-z0-9-]{6,24}\b)(?=[A-Za-z0-9-]*\d)[A-Za-z0-9-]+(?!\w)")


def redact(text: str) -> str:
    text = _EMAIL.sub("[EMAIL]", text)
    text = _PHONE.sub("[PHONE]", text)
    return _ORDER.sub("[ORDER_CODE]", text)


def import_logs(path: Path) -> list[dict]:
    records: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        payload = json.loads(line)
        query = payload.get("message") or payload.get("query") or payload.get("user_message")
        if not isinstance(query, str) or not query.strip():
            continue
        records.append({
            "id": f"log-{len(records) + 1:06d}",
            "query": redact(query.strip())[:2000],
            "expected_intent": None,
            "expected_source_terms": [],
            "required_answer_terms": [],
            "forbidden_answer_terms": ["TODO_CHU_QUAN_DIEN"],
            "needs_review": True,
        })
    return records


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--logs", type=Path, help="JSONL log thật cần ẩn danh và gắn nhãn")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    rows = import_logs(args.logs) if args.logs else build_seed()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows),
        encoding="utf-8",
    )
    print(f"Đã ghi {len(rows)} câu vào {args.output}")


if __name__ == "__main__":
    main()
