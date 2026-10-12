from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.app.chat.service import CafeChatService

router = APIRouter(prefix="/api/chat", tags=["Chat"])
_service = CafeChatService()


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    user_id: str | None = None


@router.post("")
def chat(request: ChatRequest):
    try:
        result = _service.reply(request.message, request.user_id)
        return {"message": request.message, **result}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
