
"""LLM adapters for Smart Café RAG chatbot."""

from __future__ import annotations

import logging
import os
import re

logger = logging.getLogger(__name__)


class ExtractiveLLM:
    """Fallback không dùng model sinh câu trả lời."""

    MAX_BLOCKS = 2

    async def generate(
            self,
            system: str,
            messages: list[dict],
            max_tokens: int = 256,
    ) -> str:
        content = messages[-1]["content"] if messages else ""
        match = re.search(r"<context>\s*(.*?)\s*</context>", content, re.S)

        if not match:
            return ""

        blocks = match.group(1).split("\n\n---\n\n")[: self.MAX_BLOCKS]
        texts = [
            re.sub(r"^\(Nguồn:.*?\)\n", "", block, flags=re.S).strip()
            for block in blocks
        ]
        texts = [item for item in texts if item]

        if not texts:
            return ""

        return "Mình tìm được thông tin liên quan:\n\n" + "\n\n".join(texts)


class OpenAICompatLLM:
    """Dùng API tương thích OpenAI của Ollama hoặc nhà cung cấp khác."""

    def __init__(
            self,
            base_url: str | None = None,
            api_key: str | None = None,
            model: str | None = None,
            timeout: float | None = None,
    ):
        self.base_url = (
                base_url
                or os.getenv("LLM_BASE_URL", "http://localhost:11434/v1")
        ).rstrip("/")

        self.api_key = api_key or os.getenv("LLM_API_KEY", "ollama")
        self.model = model or os.getenv("LLM_MODEL", "qwen2.5:3b")
        self.timeout = timeout or float(
            os.getenv("LLM_TIMEOUT_SECONDS", "90")
        )

    async def generate(
            self,
            system: str,
            messages: list[dict],
            max_tokens: int = 256,
    ) -> str:
        import httpx

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                *messages,
            ],
            "max_tokens": max_tokens,
            "temperature": float(os.getenv("LLM_TEMPERATURE", "0.1")),
            "stream": False,
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                    },
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()

        except httpx.TimeoutException as exc:
            logger.exception("LLM timeout sau %s giây", self.timeout)
            raise RuntimeError(
                f"Model phản hồi quá thời gian cho phép ({self.timeout}s)."
            ) from exc

        except httpx.HTTPStatusError as exc:
            logger.error(
                "LLM HTTP error: status=%s body=%s",
                exc.response.status_code,
                exc.response.text[:500],
            )
            raise RuntimeError(
                f"LLM API trả về HTTP {exc.response.status_code}."
            ) from exc

        except httpx.HTTPError as exc:
            logger.exception("Không kết nối được LLM tại %s", self.base_url)
            raise RuntimeError(
                "Không kết nối được Ollama. Hãy kiểm tra Ollama đang chạy."
            ) from exc

        try:
            answer = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise RuntimeError(
                "LLM trả về dữ liệu không hợp lệ; hãy kiểm tra model và API URL."
            ) from exc

        if not isinstance(answer, str) or not answer.strip():
            raise RuntimeError("LLM trả về câu trả lời rỗng.")

        return answer.strip()


def get_llm():
    """Khởi tạo adapter theo biến môi trường."""

    provider = os.getenv("LLM_PROVIDER", "openai").strip().lower()
    logger.info("LLM provider: %s", provider)

    if provider in {"openai", "ollama", "openai_compatible"}:
        return OpenAICompatLLM()

    if provider == "anthropic":
        from .rag import AnthropicLLM
        return AnthropicLLM()

    if provider == "extractive":
        logger.warning("Đang sử dụng ExtractiveLLM, không gọi model sinh.")
        return ExtractiveLLM()

    raise ValueError(
        f"LLM_PROVIDER='{provider}' không được hỗ trợ."
    )
