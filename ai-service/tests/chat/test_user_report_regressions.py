import asyncio

import numpy as np
import pytest

from src.app.chat.intent import Intent, classify_intent
from src.app.chat.llm import ExtractiveLLM
from src.app.chat.rag import RAGPipeline
from src.app.chat.retriever import Retriever, load_chunks


def _pipeline() -> RAGPipeline:
    retriever = Retriever.__new__(Retriever)
    retriever.chunks = load_chunks()
    retriever.embeddings = np.zeros((len(retriever.chunks), 1), dtype=np.float32)
    retriever._embedding_disabled = True
    retriever._model = None
    retriever._lock = None
    retriever._refresh_lexical_index()
    llm = ExtractiveLLM()
    return RAGPipeline(
        retriever=retriever,
        llm=llm,
        fallback_llm=llm,
        top_k=12,
        min_score=0.20,
    )


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("Quán có mấy chi nhánh?", Intent.CONTACT_QUERY),
        ("Gửi góp ý qua email nào?", Intent.CONTACT_QUERY),
        ("Mật khẩu wifi là 12345678 phải không?", Intent.WIFI_QUERY),
        ("Quán có phòng riêng không?", Intent.SERVICE_QUERY),
        ("Gửi xe máy ở đâu và bao nhiêu tiền?", Intent.SERVICE_QUERY),
        ("Đơn 500 nghìn được freeship chứ?", Intent.DELIVERY_QUERY),
        ("Tích điểm thế nào?", Intent.PROMOTION_QUERY),
        ("Tạo giúp mình một đơn nhé.", Intent.ORDER_INTENT),
    ],
)
def test_reported_questions_are_routed_to_the_business_domain(query, expected):
    assert classify_intent(query).intent is expected


@pytest.mark.parametrize(
    ("query", "expected_terms"),
    [
        ("Quán có bao nhiêu chỗ?", ("40 chỗ",)),
        ("Wifi bảo đảm đủ để livestream 4K không?", ("không bảo đảm tốc độ mạng",)),
        ("Quán có phòng riêng không?", ("không có phòng riêng",)),
        ("Gửi xe máy ở đâu và bao nhiêu tiền?", ("miễn phí",)),
        ("Đặt bàn cho 7 người nhé.", ("trên 6 người",)),
        ("Tạo giúp mình một đơn nhé.", ("chưa thể thực hiện",)),
        ("Hệ thống báo 0 km thì phí bao nhiêu?", ("15.000đ",)),
        ("Hệ thống tính 3,01 km thì ship bao nhiêu?", ("25.000đ",)),
        ("5,01 km có giao trực tiếp không?", ("trên 5 km",)),
        ("Đơn 500 nghìn được freeship chứ?", ("không có miễn phí giao hàng",)),
        ("100.000đ tiền món đủ điều kiện và 15.000đ ship được mấy điểm?", ("10 điểm",)),
        ("Điểm có hạn bao lâu?", ("12 tháng",)),
    ],
)
def test_reported_questions_return_the_matching_fact(query, expected_terms):
    answer, sources = asyncio.run(_pipeline().answer(query))
    lowered = answer.lower()
    assert all(term.lower() in lowered for term in expected_terms)
    assert sources or "chưa thể thực hiện" in lowered
