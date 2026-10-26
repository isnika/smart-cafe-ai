from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, validator


class ChatMessage(BaseModel):
    """Một tin nhắn cũ trong lịch sử; không bao gồm câu hỏi hiện tại."""

    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=2000)

    @validator("content")
    def clean_content(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Nội dung tin nhắn không được để trống.")
        return value


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000, description="Câu hỏi hiện tại")
    # Chặn payload quá lớn; RAGPipeline cũng chỉ dùng số lượt gần nhất.
    history: list[ChatMessage] = Field(default_factory=list, max_items=30)

    @validator("message")
    def clean_message(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Tin nhắn không được để trống.")
        return value


class SourceChunk(BaseModel):
    source: str
    category: str
    heading: str
    score: float
    content: str


class ChatResponse(BaseModel):
    answer: str
    sources: list[SourceChunk] = Field(default_factory=list)
