from __future__ import annotations

import logging
import time
from functools import lru_cache

from .rag import RAGPipeline
from .schemas import ChatRequest, ChatResponse

logger = logging.getLogger(__name__)


class ChatService:
    def __init__(self, pipeline: RAGPipeline | None = None):
        self.pipeline = pipeline or RAGPipeline()

    async def chat(self, req: ChatRequest) -> ChatResponse:
        started = time.perf_counter()
        answer, sources = await self.pipeline.answer(req.message, req.history)
        logger.info(
            "Chat hoàn tất (elapsed_ms=%d, history_messages=%d, sources=%d, fallback=%s)",
            round((time.perf_counter() - started) * 1000),
            len(req.history),
            len(sources),
            not sources,
        )
        return ChatResponse(answer=answer, sources=sources)

    def reindex(self) -> int:
        """Gọi sau khi sửa file trong knowledge_base."""
        self.pipeline.retriever.build_index(force=True)
        return len(self.pipeline.retriever.chunks)


@lru_cache
def get_chat_service() -> ChatService:
    return ChatService()


# --------------------------------------------------------------------------- #
# Ví dụ gắn vào FastAPI (đặt trong src/app/api/..., ví dụ api/chat.py):
#
#   from fastapi import APIRouter, Depends
#   from app.chat.schemas import ChatRequest, ChatResponse
#   from app.chat.service import ChatService, get_chat_service
#
#   router = APIRouter(prefix="/chat", tags=["chat"])
#
#   @router.post("", response_model=ChatResponse)
#   async def chat(req: ChatRequest, svc: ChatService = Depends(get_chat_service)):
#       return await svc.chat(req)
#
#   @router.post("/reindex")
#   async def reindex(svc: ChatService = Depends(get_chat_service)):
#       return {"chunks": svc.reindex()}
# --------------------------------------------------------------------------- #
