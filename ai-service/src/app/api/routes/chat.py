from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(
    prefix="/api/chat",
    tags=["Chat"]
)


class ChatRequest(BaseModel):
    message: str
    user_id: int | None = None


@router.post("")
def chat(request: ChatRequest):

    return {
        "message": request.message,
        "response": "Xin chào! Tôi là trợ lý AI của Smart Café.",
        "user_id": request.user_id
    }
