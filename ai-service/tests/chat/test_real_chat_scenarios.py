"""Regression từ log chat thật; chạy với ``pytest -s`` để xem debug RAG."""
from __future__ import annotations

import asyncio
import json

import numpy as np

from src.app.chat.intent import Intent, classify_intent
from src.app.chat.llm import ExtractiveLLM
from src.app.chat.rag import RAGPipeline, _clean_history
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
    return RAGPipeline(retriever=retriever, llm=llm, fallback_llm=llm)


async def _ask(pipeline: RAGPipeline, query: str, history: list[ChatMessage] | None = None):
    history = history or []
    rewritten = await pipeline._condense(query, _clean_history(history))
    decision = classify_intent(query)
    answer, sources = await pipeline.answer(query, history)
    debug = {
        "query": query,
        "rewrite": rewritten,
        "intent": decision.intent.value,
        "chunks": [
            {"heading": source.heading, "score": source.score}
            for source in sources
        ],
        "answer": answer,
    }
    print("\nRAG_DEBUG:", json.dumps(debug, ensure_ascii=True))
    return answer, sources, rewritten, decision.intent


def test_required_real_chat_scenarios():
    async def scenario():
        pipeline = _pipeline()

        hello, _, _, intent = await _ask(pipeline, "hello")
        assert intent is Intent.GREETING and "Xin chào" in hello

        wifi, wifi_sources, _, intent = await _ask(pipeline, "quán có mạng không ạ")
        assert intent is Intent.WIFI_QUERY and "Wi-Fi" in wifi and wifi_sources

        recommendation, product_sources, _, intent = await _ask(
            pipeline, "quán có món gì ngon"
        )
        assert intent is Intent.PRODUCT_RECOMMENDATION
        assert "29.000đ" in recommendation and "Bạn thích" in recommendation
        assert product_sources and all(source.source == "products.csv" for source in product_sources)

        typo_hours, _, _, intent = await _ask(
            pipeline, "quán ở cửa lúc mấy giờ"
        )
        assert intent is Intent.OPENING_HOURS
        assert "7h" in typo_hours and "22h" in typo_hours

        opening_query = "quán mở cửa lúc mấy giờ"
        opening, _, _, _ = await _ask(pipeline, opening_query)
        history = [
            ChatMessage(role="user", content=opening_query),
            ChatMessage(role="assistant", content=opening),
        ]
        closing, _, rewritten, intent = await _ask(pipeline, "đóng cửa", history)
        assert intent is Intent.OPENING_HOURS and "mở cửa" in rewritten.lower()
        assert "22h" in closing

        refund, refund_sources, _, intent = await _ask(
            pipeline, "quán có hoàn đơn không"
        )
        assert intent is Intent.POLICY_QUERY
        assert "mã đơn" in refund.lower() and "menu" not in refund.lower()
        assert refund_sources and all("refund.md" in source.source for source in refund_sources)

        missing_order, _, _, intent = await _ask(
            pipeline, "đơn của mình chưa được giao"
        )
        assert intent is Intent.ORDER_STATUS
        assert "xin lỗi" in missing_order.lower() and "mã đơn" in missing_order.lower()
        assert "menu" not in missing_order.lower()

        confused, _, _, intent = await _ask(pipeline, "??")
        assert intent is Intent.COMPLAINT and "xin lỗi" in confused.lower()
        complaint_history = [
            ChatMessage(role="user", content="??"),
            ChatMessage(role="assistant", content=confused),
        ]
        complaint, _, _, intent = await _ask(
            pipeline, "trả lời kiểu gì vậy", complaint_history
        )
        assert intent is Intent.COMPLAINT and complaint != confused
        assert "xin lỗi" in complaint.lower()

        no_accent_hours, _, _, intent = await _ask(
            pipeline, "quan mo cua may gio"
        )
        assert intent is Intent.OPENING_HOURS and "22h" in no_accent_hours

        no_accent_wifi, _, _, intent = await _ask(pipeline, "co wifi k")
        assert intent is Intent.WIFI_QUERY and "Wi-Fi" in no_accent_wifi

        weather, weather_sources, _, intent = await _ask(
            pipeline, "thời tiết hôm nay thế nào"
        )
        assert intent is Intent.UNKNOWN and not weather_sources
        assert "chưa hỗ trợ" in weather.lower() and "Smart Café" in weather

    asyncio.run(scenario())
