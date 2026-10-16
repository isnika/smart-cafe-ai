"""LLM adapters for the Smart Café RAG chatbot.

Providers:
- openai: OpenAI-compatible API. Works with local Ollama or hosted providers.
- anthropic: Anthropic Messages API.
- extractive: no model; returns retrieved passages (development fallback).

Recommended local setup:
    LLM_PROVIDER=openai
    LLM_BASE_URL=http://localhost:11434/v1
    LLM_API_KEY=ollama
    LLM_MODEL=qwen2.5:3b
"""
from __future__ import annotations

import logging
import os
import re

from .prompts import CONDENSE_SYSTEM

logger = logging.getLogger(__name__)


class ExtractiveLLM:
    """Fallback without a generative model; returns retrieved text only."""

    MAX_BLOCKS = 2

    async def generate(self, system: str, messages: list[dict], max_tokens: int = 800) -> str:
        if system == CONDENSE_SYSTEM:
            return ""
        content = messages[-1]["content"] if messages else ""
        match = re.search(r"<context>\s*(.*?)\s*</context>", content, re.S)
        if not match:
            return ""
        blocks = match.group(1).split("\n\n---\n\n")[: self.MAX_BLOCKS]
        texts = [re.sub(r"^\(Nguồn:.*?\)\n", "", block).strip() for block in blocks]
        return "Mình tìm được thông tin liên quan:\n\n" + "\n\n".join(texts)


class OpenAICompatLLM:
    """Call /v1/chat/completions on Ollama or another compatible provider."""

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
        timeout: float | None = None,
    ):
        self.base_url = (base_url or os.getenv("LLM_BASE_URL", "http://localhost:11434/v1")).rstrip("/")
        self.api_key = api_key or os.getenv("LLM_API_KEY", "ollama")
        self.model = model or os.getenv("LLM_MODEL", "qwen2.5:3b")
        self.timeout = timeout or float(os.getenv("LLM_TIMEOUT_SECONDS", "120"))

    async def generate(self, system: str, messages: list[dict], max_tokens: int = 800) -> str:
        import httpx

        payload = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, *messages],
            "max_tokens": max_tokens,
            "temperature": float(os.getenv("LLM_TEMPERATURE", "0.2")),
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

        try:
            answer = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise RuntimeError("LLM trả về định dạng không hợp lệ; kiểm tra LLM_BASE_URL và model.") from exc
        if not isinstance(answer, str) or not answer.strip():
            raise RuntimeError("LLM trả về câu trả lời rỗng.")
        return answer.strip()


def get_llm():
    """Build the selected provider; extractive is opt-in, not an accidental default."""
    provider = (os.getenv("LLM_PROVIDER") or "extractive").strip().lower()
    logger.info("LLM provider: %s", provider)

    if provider in {"openai", "ollama", "openai_compatible"}:
        return OpenAICompatLLM()
    if provider == "anthropic":
        from .rag import AnthropicLLM  # late import avoids circular imports
        return AnthropicLLM()
    if provider == "extractive":
        logger.warning("LLM_PROVIDER=extractive: chatbot chỉ trả đoạn văn bản truy xuất, không sinh câu trả lời.")
        return ExtractiveLLM()
    raise ValueError(
        f"LLM_PROVIDER='{provider}' không được hỗ trợ. Chọn 'openai', 'anthropic' hoặc 'extractive'."
    )
