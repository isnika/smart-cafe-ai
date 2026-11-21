import asyncio

import numpy as np
import pytest

from src.app.chat.intent import Intent, classify_intent
from src.app.chat.context import build_conversation_context
from src.app.chat.llm import ExtractiveLLM
from src.app.chat.normalize import canonicalize_query, is_contextual_followup
from src.app.chat.rag import RAGPipeline
from src.app.chat.retriever import Retriever, load_chunks
from src.app.chat.schemas import ChatMessage


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


def test_late_booking_question_does_not_select_online_booking_faq_with_history():
    pipeline = _pipeline()
    question = "Đến trễ thì giữ bàn bao lâu?"
    history = [
        ChatMessage(role="user", content="Mình có thể đặt bàn online không?"),
        ChatMessage(
            role="assistant",
            content="Bạn gửi yêu cầu qua mục Đặt bàn hoặc Hỗ trợ trên website nhé.",
        ),
    ]

    for current in (question, "vậy thì Đến trễ thì giữ bàn bao lâu?"):
        answer, sources = asyncio.run(pipeline.answer(current, history if current != question else []))

        assert "15 phút" in answer
        assert "website hiển thị chức năng" not in answer.lower()
        assert sources and all("4. Đặt bàn" in source.heading for source in sources)


@pytest.mark.parametrize(
    "question",
    [
        "vậy giữ bàn bao lâu?",
        "thế giữ bàn bao lâu?",
        "còn giữ bàn bao lâu?",
    ],
)
def test_booking_followups_keep_the_booking_fact_for_discourse_markers(question):
    history = [
        ChatMessage(role="user", content="Mình có thể đặt bàn online không?"),
        ChatMessage(role="assistant", content="Bạn xem mục Đặt bàn trên website nhé."),
    ]

    answer, sources = asyncio.run(_pipeline().answer(question, history))

    assert "15 phút" in answer
    assert "website hiển thị chức năng" not in answer.lower()
    assert sources and all("4. Đặt bàn" in source.heading for source in sources)


def test_booking_late_question_with_leading_discourse_is_not_rewritten_from_history():
    assert not is_contextual_followup("vậy thì Đến trễ thì giữ bàn bao lâu?")
    assert is_contextual_followup("vậy giữ bàn bao lâu?")
    assert is_contextual_followup("còn giữ bàn bao lâu?")


def test_booking_fee_typo_returns_only_the_booking_fee_fact():
    question = "mình đặt bàn có chi phsi gì không"

    assert canonicalize_query(question) == "mình đặt bàn có chi phí gì không"
    answer, sources = asyncio.run(_pipeline().answer(question))

    assert "đặt bàn thông thường không mất phí" in answer.lower()
    assert all(term not in answer.lower() for term in ("thuê cả quán", "số người", "ổ cắm"))
    assert sources and len(sources) == 1


def test_booking_action_and_followup_details_are_not_acknowledged_without_a_tool():
    pipeline = _pipeline()
    request = "Mình muốn đặt bàn"
    first_answer, first_sources = asyncio.run(pipeline.answer(request))
    history = [
        ChatMessage(role="user", content=request),
        ChatMessage(role="assistant", content=first_answer),
    ]
    # Số giả chỉ dùng để kiểm tra không echo dữ liệu cá nhân vào câu trả lời.
    details = "Nguyễn Văn A, 0900000000, 4 người, 20:00 ngày mai"
    answer, sources = asyncio.run(pipeline.answer(details, history))

    assert "chưa thể thực hiện" in first_answer.lower()
    assert first_sources == []
    assert "chưa thể thực hiện" in answer.lower()
    assert "đặt bàn" in answer.lower() and "hỗ trợ" in answer.lower()
    assert "0900000000" not in answer
    assert not any(term in answer.lower() for term in ("đã nhận", "đã gửi", "đã lưu", "thành công"))
    assert sources == []


def test_booking_details_after_information_question_are_not_saved_or_confirmed():
    pipeline = _pipeline()
    first_question = "Cần thông tin gì khi đặt bàn?"
    first_answer, first_sources = asyncio.run(pipeline.answer(first_question))
    history = [
        ChatMessage(role="user", content=first_question),
        ChatMessage(role="assistant", content=first_answer),
    ]
    # Số giả; không ghi nguyên văn dữ liệu khách vào log chẩn đoán.
    details = "Nika, 2 người, 23/2/2027 19h, 0900000000"

    context = build_conversation_context(
        [{"role": "user", "content": first_question}], details, ()
    )
    assert context.booking_details_followup is True

    answer, sources = asyncio.run(pipeline.answer(details, history))

    assert "số điện thoại" in first_answer.lower()
    assert first_sources
    assert "chưa thể thực hiện" in answer.lower()
    assert "đặt bàn" in answer.lower() and "hỗ trợ" in answer.lower()
    assert "nika" not in answer.lower()
    assert "0900000000" not in answer
    assert not any(term in answer.lower() for term in ("đã nhận", "đã gửi", "đã lưu", "thành công"))
    assert sources == []

    # Client có thể lỡ gửi thiếu history; đủ slot vẫn không được định tuyến
    # thành tư vấn loại bàn/tiện ích.
    answer_without_history, sources_without_history = asyncio.run(
        pipeline.answer(details, [])
    )
    assert "chưa thể thực hiện" in answer_without_history.lower()
    assert "hỗ trợ" in answer_without_history.lower()
    assert sources_without_history == []


def test_switching_from_booking_to_opening_hours_does_not_inherit_booking_action():
    pipeline = _pipeline()
    first_question = "Mình muốn đặt bàn"
    first_answer, _ = asyncio.run(pipeline.answer(first_question))
    history = [
        ChatMessage(role="user", content=first_question),
        ChatMessage(role="assistant", content=first_answer),
    ]

    answer, sources = asyncio.run(pipeline.answer("Quán đóng cửa lúc mấy giờ?", history))

    assert "22:00" in answer
    assert "mục Đặt bàn" not in answer
    assert sources


@pytest.mark.parametrize(
    ("question", "expected"),
    [
        ("Đặt bàn cho 7 người nhé.", "trên 6 người"),
        ("Quán có bàn gần ổ cắm không?", "ổ cắm"),
        ("Thuê cả quán có được không?", "không cho thuê riêng toàn bộ không gian"),
        ("Đặt bàn cần cung cấp thông tin gì?", "số điện thoại"),
    ],
)
def test_booking_related_facts_remain_grounded(question, expected):
    answer, _ = asyncio.run(_pipeline().answer(question))

    assert expected in answer.lower()
