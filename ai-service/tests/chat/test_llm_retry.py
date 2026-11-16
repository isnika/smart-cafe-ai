import asyncio

import httpx
import pytest

from src.app.chat.llm import OpenAICompatLLM


class FakeAsyncClient:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    async def post(self, *args, **kwargs):
        outcome = self.outcomes[self.calls]
        self.calls += 1
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def response(status, payload=None, headers=None):
    return httpx.Response(
        status,
        json=payload or {"error": "temporary"},
        headers=headers,
        request=httpx.Request("POST", "https://llm.example/chat/completions"),
    )


def success_response(answer="Xin chào bạn ạ"):
    return response(
        200,
        {
            "choices": [{"message": {"content": answer}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5},
        },
    )


def build_client(max_retries=2):
    return OpenAICompatLLM(
        base_url="https://llm.example/v1",
        api_key="test-key",
        model="existing-model",
        timeout=1,
        max_retries=max_retries,
        retry_base_seconds=0,
    )


def test_retries_429_and_503_then_succeeds(monkeypatch):
    fake = FakeAsyncClient([
        response(429, headers={"Retry-After": "0"}),
        response(503),
        success_response(),
    ])
    monkeypatch.setattr(httpx, "AsyncClient", lambda timeout: fake)

    answer = asyncio.run(build_client().generate("system", [{"role": "user", "content": "hi"}]))

    assert answer == "Xin chào bạn ạ"
    assert fake.calls == 3


def test_retries_timeout_then_succeeds(monkeypatch):
    request = httpx.Request("POST", "https://llm.example/chat/completions")
    fake = FakeAsyncClient([
        httpx.ReadTimeout("timeout", request=request),
        success_response("Đã hoạt động lại"),
    ])
    monkeypatch.setattr(httpx, "AsyncClient", lambda timeout: fake)

    answer = asyncio.run(build_client().generate("system", [{"role": "user", "content": "hi"}]))

    assert answer == "Đã hoạt động lại"
    assert fake.calls == 2


def test_does_not_retry_invalid_4xx_request(monkeypatch):
    fake = FakeAsyncClient([response(400)])
    monkeypatch.setattr(httpx, "AsyncClient", lambda timeout: fake)

    with pytest.raises(RuntimeError, match="HTTP 400"):
        asyncio.run(build_client().generate("system", [{"role": "user", "content": "hi"}]))

    assert fake.calls == 1
