"""Các primitive bảo vệ endpoint không phụ thuộc hạ tầng ngoài."""
from __future__ import annotations

import hmac
import threading
import time
from collections import defaultdict, deque

from fastapi import Header, HTTPException, Request

from .config import get_settings


class InMemoryRateLimiter:
    """Sliding-window limiter cho một instance.

    Khi chạy nhiều replica, gateway/Redis vẫn nên là lớp giới hạn chính.
    Lớp này là fail-safe để endpoint không hoàn toàn không được bảo vệ.
    """

    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()
        self._last_cleanup = 0.0

    def check(self, key: str, limit: int, window_seconds: float = 60.0) -> int:
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            if now - self._last_cleanup >= window_seconds:
                for existing_key in list(self._events):
                    existing = self._events[existing_key]
                    while existing and existing[0] <= cutoff:
                        existing.popleft()
                    if not existing:
                        self._events.pop(existing_key, None)
                self._last_cleanup = now
            events = self._events[key]
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= limit:
                retry_after = max(1, round(events[0] + window_seconds - now))
                return retry_after
            events.append(now)
        return 0


_chat_limiter = InMemoryRateLimiter()


def _client_key(request: Request) -> str:
    settings = get_settings()
    if settings.trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for", "").split(",", 1)[0].strip()
        if forwarded:
            return forwarded
    return request.client.host if request.client else "unknown"


def enforce_chat_rate_limit(request: Request) -> None:
    settings = get_settings()
    if not settings.chat_rate_limit_enabled:
        return
    retry_after = _chat_limiter.check(
        f"chat:{_client_key(request)}", settings.chat_rate_limit_per_minute
    )
    if retry_after:
        raise HTTPException(
            status_code=429,
            detail="Bạn đang gửi tin nhắn quá nhanh. Vui lòng thử lại sau ít giây.",
            headers={"Retry-After": str(retry_after)},
        )


def require_reindex_key(x_reindex_key: str | None = Header(default=None)) -> None:
    expected = get_settings().reindex_api_key
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="Reindex endpoint chưa được cấu hình khóa quản trị.",
        )
    if not x_reindex_key or not hmac.compare_digest(x_reindex_key, expected):
        raise HTTPException(status_code=403, detail="Không có quyền reindex chatbot.")
