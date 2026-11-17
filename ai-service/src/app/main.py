
"""
Chạy service:
uvicorn src.app.main:app --reload --port 8000

Swagger:
http://127.0.0.1:8000/docs
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.app.chat.service import get_chat_service
from src.app.core.config import get_settings
from src.app.api.routes import (
    health,
    chat,
    recommendation,
    forecasting,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.chat_ready = False
    app.state.chat_startup_error = None
    if settings.preload_chat:
        try:
            service = await asyncio.to_thread(get_chat_service)
            await service.preload()
            app.state.chat_ready = True
            logger.info("Chat index/model đã preload; service sẵn sàng")
        except Exception as exc:
            app.state.chat_startup_error = type(exc).__name__
            logger.exception("Chat preload thất bại; readiness sẽ trả 503")
    yield

app = FastAPI(
    title="Smart Cafe AI Service",
    description=(
        "AI backend for recommendations, cafe chatbot, "
        "and revenue forecasting."
    ),
    version="1.2.0",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_allowed_origins),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(chat.router)
app.include_router(recommendation.router)
app.include_router(forecasting.router)
