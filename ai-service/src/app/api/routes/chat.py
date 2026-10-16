from fastapi import APIRouter, Depends, HTTPException

from src.app.chat.schemas import ChatRequest, ChatResponse
from src.app.chat.service import ChatService, get_chat_service

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=ChatResponse, summary="Hỏi đáp với chatbot (RAG)")
async def chat(req: ChatRequest, svc: ChatService = Depends(get_chat_service)):
    try:
        return await svc.chat(req)
    except Exception as e:  # lỗi LLM / API key...
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")


@router.post("/reindex", summary="Nạp lại knowledge_base")
def reindex(svc: ChatService = Depends(get_chat_service)):
    return {"chunks": svc.reindex()}
