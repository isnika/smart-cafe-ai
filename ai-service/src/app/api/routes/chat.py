import logging

from fastapi import APIRouter, Depends, HTTPException

from src.app.chat.schemas import ChatRequest, ChatResponse
from src.app.chat.service import ChatService, get_chat_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=ChatResponse, summary="Hỏi đáp với chatbot (RAG)")
async def chat(req: ChatRequest, svc: ChatService = Depends(get_chat_service)):
    try:
        return await svc.chat(req)
    except Exception as exc:
        # Không gửi chi tiết nội bộ (URL, cấu hình, trace) về trình duyệt.
        logger.exception("Chat request thất bại")
        raise HTTPException(
            status_code=503,
            detail="Chatbot tạm thời chưa thể trả lời. Bạn vui lòng thử lại sau ít phút nhé.",
        ) from exc


@router.post("/reindex", summary="Nạp lại knowledge_base")
def reindex(svc: ChatService = Depends(get_chat_service)):
    try:
        return {"chunks": svc.reindex()}
    except Exception as exc:
        logger.exception("Không thể tạo lại chỉ mục knowledge base")
        raise HTTPException(
            status_code=500,
            detail="Không thể cập nhật dữ liệu chatbot lúc này.",
        ) from exc
