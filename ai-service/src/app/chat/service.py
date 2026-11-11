from __future__ import annotations

import logging
import time
from functools import lru_cache

from src.app.core.config import get_settings

from .rag import RAGPipeline
from .schemas import ChatRequest, ChatResponse, SourceChunk

logger = logging.getLogger(__name__)


class ChatService:
    def __init__(self, pipeline: RAGPipeline | None = None):
        self.pipeline = pipeline or RAGPipeline()

    @staticmethod
    def _public_sources(sources: list[SourceChunk]) -> list[SourceChunk]:
        mode = get_settings().source_mode
        if mode == "off":
            return []
        if mode == "full":
            return sources
        return [
            SourceChunk(
                source=item.source,
                category=item.category,
                heading=item.heading,
                score=0.0,
                content="",
            )
            for item in sources
        ]

    async def chat(
        self,
        req: ChatRequest,
        branch_id: int | None = None,
        authorization: str | None = None,
    ) -> ChatResponse:
        started = time.perf_counter()
        answer, sources = await self.pipeline.answer(
            req.message,
            req.history,
            branch_id=branch_id,
            authorization=authorization,
        )
        logger.info(
            "Chat hoàn tất (elapsed_ms=%d, history_messages=%d, sources=%d, fallback=%s)",
            round((time.perf_counter() - started) * 1000),
            len(req.history),
            len(sources),
            not sources,
        )
        return ChatResponse(answer=answer, sources=self._public_sources(sources))

    async def preload(self) -> None:
        settings = get_settings()
        await self.pipeline.preload(
            warm_embeddings=settings.warm_embedding_model,
            warm_llm=settings.llm_warmup,
        )

    def readiness(self) -> dict[str, object]:
        chunks = len(getattr(self.pipeline.retriever, "chunks", []))
        return {
            "ready": chunks > 0,
            "knowledge_chunks": chunks,
            "embeddings_enabled": not getattr(
                self.pipeline.retriever, "_embedding_disabled", True
            ),
            "operational_data_enabled": self.pipeline.live_data.enabled,
        }

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
