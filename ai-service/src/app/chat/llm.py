
"""LLM adapters for Smart Café RAG chatbot."""

from __future__ import annotations

import asyncio
import logging
import os
import random
import time

from .response import build_extractive_answer

logger = logging.getLogger(__name__)


class ExtractiveLLM:
    """Fallback không dùng model sinh câu trả lời."""

    async def generate(
            self,
            system: str,
            messages: list[dict],
            max_tokens: int = 256,
    ) -> str:
        content = messages[-1]["content"] if messages else ""
        return build_extractive_answer(content)


class OpenAICompatLLM:
    """Dùng API tương thích OpenAI của Ollama hoặc nhà cung cấp khác."""

    def __init__(
            self,
            base_url: str | None = None,
            api_key: str | None = None,
            model: str | None = None,
            timeout: float | None = None,
            max_retries: int | None = None,
            retry_base_seconds: float | None = None,
    ):
        self.base_url = (
                base_url
                or os.getenv("LLM_BASE_URL", "http://localhost:11434/v1")
        ).rstrip("/")

        self.api_key = api_key or os.getenv("LLM_API_KEY", "ollama")
        self.model = model or os.getenv("LLM_MODEL", "qwen2.5:3b")
        self.timeout = timeout if timeout is not None else float(
            os.getenv("LLM_TIMEOUT_SECONDS", "45")
        )
        configured_retries = max_retries if max_retries is not None else int(
            os.getenv("LLM_MAX_RETRIES", "2")
        )
        self.max_retries = max(0, min(configured_retries, 4))
        self.retry_base_seconds = (
            retry_base_seconds if retry_base_seconds is not None
            else float(os.getenv("LLM_RETRY_BASE_SECONDS", "0.4"))
        )
        self.retry_max_seconds = float(os.getenv("LLM_RETRY_MAX_SECONDS", "4"))

    async def _wait_before_retry(self, attempt: int, response=None) -> None:
        delay = max(0.0, self.retry_base_seconds) * (2 ** attempt)
        if response is not None:
            retry_after = response.headers.get("Retry-After")
            if retry_after:
                try:
                    delay = max(delay, float(retry_after))
                except ValueError:
                    pass
        delay = min(delay, max(0.0, self.retry_max_seconds))
        delay += random.uniform(0.0, min(0.2, max(0.0, self.retry_base_seconds)))
        logger.warning(
            "Thử lại LLM (attempt=%d/%d, delay=%.2fs)",
            attempt + 2,
            self.max_retries + 1,
            delay,
        )
        await asyncio.sleep(delay)

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

        started = time.perf_counter()
        timeout = httpx.Timeout(self.timeout, connect=min(5.0, self.timeout))
        async with httpx.AsyncClient(timeout=timeout) as client:
            for attempt in range(self.max_retries + 1):
                try:
                    response = await client.post(
                        f"{self.base_url}/chat/completions",
                        headers={
                            "Authorization": f"Bearer {self.api_key}",
                        },
                        json=payload,
                    )
                    response.raise_for_status()
                    data = response.json()
                    break
                except httpx.TimeoutException as exc:
                    if attempt < self.max_retries:
                        await self._wait_before_retry(attempt)
                        continue
                    logger.error("LLM timeout sau %s giây", self.timeout)
                    raise RuntimeError(
                        f"Model phản hồi quá thời gian cho phép ({self.timeout}s)."
                    ) from exc
                except httpx.HTTPStatusError as exc:
                    status = exc.response.status_code
                    retryable = status == 429 or status in {500, 502, 503, 504}
                    if retryable and attempt < self.max_retries:
                        await self._wait_before_retry(attempt, exc.response)
                        continue
                    logger.error("LLM HTTP error: status=%s", status)
                    raise RuntimeError(f"LLM API trả về HTTP {status}.") from exc
                except httpx.TransportError as exc:
                    if attempt < self.max_retries:
                        await self._wait_before_retry(attempt)
                        continue
                    logger.error("Không kết nối được LLM provider")
                    raise RuntimeError("Không kết nối được LLM provider.") from exc
        try:
            answer = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise RuntimeError(
                "LLM trả về dữ liệu không hợp lệ; hãy kiểm tra model và API URL."
            ) from exc

        if not isinstance(answer, str) or not answer.strip():
            raise RuntimeError("LLM trả về câu trả lời rỗng.")

        usage = data.get("usage") if isinstance(data, dict) else None
        logger.info(
            "LLM hoàn tất (model=%s, elapsed_ms=%d, prompt_tokens=%s, completion_tokens=%s)",
            self.model,
            round((time.perf_counter() - started) * 1000),
            usage.get("prompt_tokens") if isinstance(usage, dict) else None,
            usage.get("completion_tokens") if isinstance(usage, dict) else None,
        )
        return answer.strip()


def get_llm():
    """Khởi tạo adapter theo biến môi trường."""

    provider = os.getenv("LLM_PROVIDER", "openai_compatible").strip().lower()
    logger.info("LLM provider: %s", provider)

    if provider in {"openai", "ollama", "openai_compatible"}:
        return OpenAICompatLLM()

    if provider == "anthropic":
        raise ValueError(
            "LLM_PROVIDER='anthropic' chưa có adapter trong source hiện tại."
        )

    if provider == "extractive":
        logger.warning("Đang sử dụng ExtractiveLLM, không gọi model sinh.")
        return ExtractiveLLM()

    raise ValueError(
        f"LLM_PROVIDER='{provider}' không được hỗ trợ."
    )
