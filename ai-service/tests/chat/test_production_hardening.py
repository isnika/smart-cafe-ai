import asyncio
import re

import numpy as np
from fastapi.testclient import TestClient

from src.app.chat.intent import Intent, classify_compound_intents, classify_intent
from src.app.chat.live_data import (
    LiveCatalogResult,
    LiveOrder,
    LiveProduct,
    LiveVariant,
    format_catalog_answer,
)
from src.app.chat.llm import ExtractiveLLM
from src.app.chat.rag import RAGPipeline
from src.app.chat.retriever import Retriever, load_chunks
from src.app.chat.schemas import ChatRequest, SourceChunk
from src.app.chat.service import ChatService, get_chat_service
from src.app.core.config import get_settings
from src.app.core.security import InMemoryRateLimiter
from src.app.main import app


def _pipeline(live_data=None) -> RAGPipeline:
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
        live_data=live_data,
    )


def test_amount_attributes_are_not_misrouted_as_price():
    assert classify_intent("Cà phê sữa có bao nhiêu calo?").intent is Intent.PRODUCT_DETAIL
    assert classify_intent("Ly latte dung tích bao nhiêu ml?").intent is Intent.PRODUCT_DETAIL
    assert classify_intent("Sữa tươi đường đen bao nhiêu tiền?").intent is Intent.PRODUCT_PRICE


def test_missing_calories_and_volume_are_stated_instead_of_guessing():
    pipeline = _pipeline()
    calories, _ = asyncio.run(pipeline.answer("Cà phê sữa có bao nhiêu calo?"))
    volume, _ = asyncio.run(pipeline.answer("Latte dung tích bao nhiêu ml?"))
    assert "chưa có thông tin calories" in calories.lower()
    assert "chưa có dung tích" in volume.lower()
    assert "29.000" not in calories


def test_multi_product_price_and_comparison_keep_both_entities():
    pipeline = _pipeline()
    prices, price_sources = asyncio.run(
        pipeline.answer("Giá Matcha latte và Cà phê sữa")
    )
    comparison, comparison_sources = asyncio.run(
        pipeline.answer("So sánh Latte và Cappuccino")
    )
    assert "Matcha latte" in prices and "Cà phê sữa" in prices
    assert "55.000đ" in prices and "29.000đ" in prices
    assert {"Matcha latte", "Cà phê sữa"}.issubset(
        {source.heading.split(" > ")[-1] for source in price_sources}
    )
    assert "Latte" in comparison and "Cappuccino" in comparison
    assert len(comparison_sources) == 2


def test_budget_filter_returns_only_real_product_records_under_limit():
    answer, sources = asyncio.run(_pipeline().answer("Món nào dưới 40k?"))
    assert "phù hợp" in answer.lower()
    assert sources and all("Mã món:" in source.content for source in sources)
    prices = [
        int(re.sub(r"\D", "", re.search(r"Giá:\s*([\d.]+)", source.content).group(1)))
        for source in sources
    ]
    assert all(price < 40_000 for price in prices)
    assert "Tư vấn đồ uống" not in answer


def test_compound_business_query_answers_both_intents():
    decisions = classify_compound_intents("Địa chỉ và giờ mở cửa của quán")
    assert {item.intent for item in decisions} == {Intent.LOCATION_QUERY, Intent.OPENING_HOURS}
    answer, sources = asyncio.run(
        _pipeline().answer("Địa chỉ và giờ mở cửa của quán")
    )
    assert "97 Man Thiện" in answer and "7h" in answer and "22h" in answer
    assert len(sources) >= 2


def test_static_catalog_never_claims_realtime_stock():
    answer, _ = asyncio.run(_pipeline().answer("Matcha latte còn không?"))
    assert "có trong menu" in answer
    assert "chưa có dữ liệu tồn món" in answer
    assert "hiện còn hàng" not in answer


def test_live_variants_and_branch_availability_are_formatted_from_api_data():
    product = LiveProduct(
        id="3",
        name="Matcha latte",
        description="Matcha với sữa",
        variants=(
            LiveVariant("31", "M", 55_000, True),
            LiveVariant("32", "L", 65_000, False, "Hết nguyên liệu"),
        ),
    )
    price, _ = format_catalog_answer(Intent.PRODUCT_PRICE, (product,), branch_id=1)
    stock, _ = format_catalog_answer(Intent.PRODUCT_AVAILABILITY, (product,), branch_id=1)
    assert "M: 55.000đ" in price and "L: 65.000đ" in price
    assert "đang có thể bán Matcha latte" in stock


class _CatalogLiveData:
    enabled = True

    def __init__(self):
        self.intents = []

    async def search_catalog(self, query, intent, branch_id):
        self.intents.append(intent)
        return LiveCatalogResult((LiveProduct(
            id="3",
            name="Matcha latte",
            description="Mô tả mới nhất từ Backend",
            temperature="Hot_Or_Iced",
            caffeine_level="Medium",
            variants=(LiveVariant("31", "M", 55_000, None),),
        ),))

    async def lookup_order(self, order_code, authorization):
        return None


def test_product_description_uses_backend_but_policy_stays_in_knowledge_base():
    live = _CatalogLiveData()
    pipeline = _pipeline(live)
    product_answer, _ = asyncio.run(
        pipeline.answer("Matcha latte có thành phần gì?")
    )
    policy_answer, policy_sources = asyncio.run(
        pipeline.answer("Quán có hoàn đơn không?")
    )
    assert "Mô tả mới nhất từ Backend" in product_answer
    assert live.intents == [Intent.PRODUCT_DETAIL]
    assert "mã đơn" in policy_answer.lower()
    assert policy_sources and all("refund.md" in source.source for source in policy_sources)


class _FakeLiveData:
    enabled = True

    async def search_catalog(self, query, intent, branch_id):
        return LiveCatalogResult(())

    async def lookup_order(self, order_code, authorization):
        assert authorization == "Bearer verified-user-token"
        return LiveOrder(order_code, "Preparing", "Paid")


def test_order_status_requires_identity_and_uses_operational_api():
    pipeline = _pipeline(_FakeLiveData())
    anonymous, _ = asyncio.run(pipeline.answer("Kiểm tra đơn AB123456"))
    verified, _ = asyncio.run(
        pipeline.answer(
            "Kiểm tra đơn AB123456",
            authorization="Bearer verified-user-token",
        )
    )
    assert "đăng nhập" in anonymous
    assert "đang được chuẩn bị" in verified and "đã thanh toán" in verified


class _StaticPipeline:
    async def answer(self, *args, **kwargs):
        return "OK", [SourceChunk(
            source="products.csv",
            category="menu",
            heading="Cà phê sữa",
            score=0.91,
            content="raw internal chunk",
        )]


def test_public_source_mode_redacts_raw_chunk_and_score(monkeypatch):
    monkeypatch.setenv("CHAT_SOURCE_MODE", "metadata")
    get_settings.cache_clear()
    response = asyncio.run(ChatService(_StaticPipeline()).chat(ChatRequest(message="test")))
    assert response.sources and response.sources[0].content == ""
    assert response.sources[0].score == 0.0
    get_settings.cache_clear()


def test_rate_limiter_enforces_sliding_window():
    limiter = InMemoryRateLimiter()
    assert limiter.check("client", 2) == 0
    assert limiter.check("client", 2) == 0
    assert limiter.check("client", 2) >= 1


def test_reindex_requires_configured_admin_key(monkeypatch):
    class Service:
        def reindex(self):
            return 123

    monkeypatch.setenv("CHAT_REINDEX_API_KEY", "a-long-test-secret")
    get_settings.cache_clear()
    app.dependency_overrides[get_chat_service] = lambda: Service()
    try:
        denied = TestClient(app).post("/chat/reindex")
        allowed = TestClient(app).post(
            "/chat/reindex", headers={"X-Reindex-Key": "a-long-test-secret"}
        )
    finally:
        app.dependency_overrides.clear()
        get_settings.cache_clear()
    assert denied.status_code == 403
    assert allowed.status_code == 200 and allowed.json() == {"chunks": 123}
