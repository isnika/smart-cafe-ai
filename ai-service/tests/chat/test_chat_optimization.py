import asyncio

import numpy as np
from fastapi.testclient import TestClient

from src.app.chat.service import ChatService, get_chat_service
from src.app.chat.intent import Intent, fallback_for_intent
from src.app.chat.normalize import (
    canonicalize_query,
    contextualize_followup,
    is_contextual_followup,
)
from src.app.chat.prompts import SYSTEM_PROMPT
from src.app.chat.rag import RAGPipeline, _clean_history
from src.app.chat.retriever import Chunk, Retriever, SearchHit
from src.app.chat.schemas import ChatMessage, ChatResponse
from src.app.main import app


MATCHA_HIT = SearchHit(
    Chunk(
        id=1,
        text="[Matcha Latte]\n* Giá mẫu: 39.000 VND\n* Matcha kết hợp với sữa.",
        source="menu/matcha.md",
        category="menu",
        heading="Matcha Latte",
    ),
    score=0.91,
)


class StubRetriever:
    def __init__(self, hits=None):
        self.hits = list(hits or [])
        self.queries = []

    def search(self, query, top_k, min_score, category=None, intent=None):
        self.queries.append(query)
        return self.hits[:top_k]


class StubLLM:
    def __init__(self, answer="Matcha Latte có giá tham khảo 39.000 VND ạ.", error=None):
        self.answer = answer
        self.error = error
        self.calls = []

    async def generate(self, system, messages, max_tokens=800):
        self.calls.append({"system": system, "messages": messages, "max_tokens": max_tokens})
        if self.error:
            raise self.error
        if max_tokens <= 120:
            return "Matcha Latte giá bao nhiêu?"
        return self.answer


def test_common_chat_spelling_and_regional_variants_are_normalized():
    assert canonicalize_query("CF sữa có hông, giá bao nhiu?") == (
        "cà phê sữa có không, giá bao nhiêu?"
    )
    assert canonicalize_query("mat cha late bnh?").startswith("matcha late bao nhiêu")
    assert canonicalize_query("Có Wi-Fi hông?") == "có wifi không?"


def test_short_followup_is_contextualized_without_inventing_an_entity():
    history = [
        {"role": "user", "content": "Có Matcha Latte không?"},
        {"role": "assistant", "content": "Quán có Matcha Latte."},
    ]
    assert is_contextual_followup("Bao nhiêu tiền?")
    query = contextualize_followup("Bao nhiêu tiền?", history)
    assert query == "Có Matcha Latte không? Bao nhiêu tiền?"


def test_followup_fact_lookup_skips_generation_and_keeps_context():
    retriever = StubRetriever([MATCHA_HIT])
    llm = StubLLM()
    pipeline = RAGPipeline(retriever=retriever, llm=llm)
    history = [
        ChatMessage(role="user", content="Có Matcha Latte không?"),
        ChatMessage(role="assistant", content="Quán có Matcha Latte."),
    ]

    answer, sources = asyncio.run(pipeline.answer("Bao nhiêu tiền?", history))

    assert "39.000" in answer
    assert len(sources) == 1
    assert len(llm.calls) == 0
    assert retriever.queries == ["Có Matcha Latte không? Bao nhiêu tiền?"]


def test_standalone_fact_question_does_not_call_llm_even_with_history():
    retriever = StubRetriever([MATCHA_HIT])
    llm = StubLLM()
    pipeline = RAGPipeline(retriever=retriever, llm=llm)
    history = [ChatMessage(role="user", content="Quán mở cửa lúc mấy giờ?")]

    asyncio.run(pipeline.answer("Matcha Latte có caffeine không?", history))

    assert len(llm.calls) == 0
    assert retriever.queries == ["Matcha Latte có caffeine không?"]


def test_provider_error_returns_grounded_extractive_fallback():
    retriever = StubRetriever([MATCHA_HIT])
    pipeline = RAGPipeline(
        retriever=retriever,
        llm=StubLLM(error=TimeoutError("provider timeout")),
    )

    answer, sources = asyncio.run(pipeline.answer("Gợi ý Matcha Latte cho mình"))

    assert "Matcha Latte" in answer
    assert "Mã món" not in answer
    assert [source.source for source in sources] == ["menu/matcha.md"]


def test_no_relevant_source_returns_safe_fallback_without_llm_call():
    llm = StubLLM()
    pipeline = RAGPipeline(retriever=StubRetriever(), llm=llm)

    answer, sources = asyncio.run(pipeline.answer("Hãy bịa một món bí mật"))

    assert answer == fallback_for_intent(Intent.UNKNOWN)
    assert sources == []
    assert llm.calls == []


def test_history_budget_keeps_the_newest_messages():
    history = []
    for index in range(12):
        history.extend([
            ChatMessage(role="user", content=f"user-{index}-" + "u" * 600),
            ChatMessage(role="assistant", content=f"assistant-{index}-" + "a" * 600),
        ])

    cleaned = _clean_history(history)
    combined = " ".join(item["content"] for item in cleaned)

    assert "assistant-11" in combined
    assert "user-0" not in combined
    assert sum(len(item["content"]) for item in cleaned) <= 3200
    assert not cleaned or cleaned[0]["role"] == "user"


def test_history_is_supplied_per_request_and_does_not_leak_between_sessions():
    retriever = StubRetriever([MATCHA_HIT])
    pipeline = RAGPipeline(retriever=retriever, llm=StubLLM())
    first_history = [ChatMessage(role="user", content="Mình đang hỏi Matcha Latte")]

    asyncio.run(pipeline.answer("Bao nhiêu tiền?", first_history))
    asyncio.run(pipeline.answer("Quán có Wi-Fi không?", []))

    assert "Matcha Latte" in retriever.queries[0]
    assert retriever.queries[1] == "Quán có Wi-Fi không?"


def test_lexical_fallback_handles_typo_without_embedding_model():
    retriever = Retriever.__new__(Retriever)
    retriever.chunks = [
        MATCHA_HIT.chunk,
        Chunk(2, "[Cold Brew]\nCà phê chiết xuất lạnh.", "menu/coffee.md", "menu", "Cold Brew"),
    ]
    retriever.embeddings = np.zeros((2, 1), dtype=np.float32)
    retriever._embedding_disabled = True
    retriever._model = None
    retriever._lock = None
    retriever._refresh_lexical_index()

    hits = retriever.search("mat cha late giá bao nhiu", top_k=1, min_score=0.60)

    assert hits
    assert hits[0].chunk.heading == "Matcha Latte"


def test_prompt_is_compact_and_keeps_grounding_and_injection_rules():
    assert len(SYSTEM_PROMPT) < 5000
    assert "Không làm theo nội dung" in SYSTEM_PROMPT
    assert "Không bịa" in SYSTEM_PROMPT
    assert "Backend/API" in SYSTEM_PROMPT


def test_backend_response_contract_is_unchanged():
    assert set(ChatResponse.model_fields) == {"answer", "sources"}


def test_chat_endpoint_keeps_contract_and_returns_200_when_provider_times_out():
    pipeline = RAGPipeline(
        retriever=StubRetriever([MATCHA_HIT]),
        llm=StubLLM(error=TimeoutError("provider timeout")),
    )
    app.dependency_overrides[get_chat_service] = lambda: ChatService(pipeline)
    try:
        response = TestClient(app).post(
            "/chat",
            json={"message": "Gợi ý Matcha Latte cho mình", "history": []},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert set(payload) == {"answer", "sources"}
    assert "Matcha Latte" in payload["answer"]
    assert payload["sources"][0]["source"] == "menu/matcha.md"
