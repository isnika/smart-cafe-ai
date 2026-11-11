from fastapi import APIRouter, HTTPException

from src.app.chat.service import get_chat_service

router = APIRouter()


@router.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "smart-cafe-ai"
    }


@router.get("/ready")
def readiness_check():
    """Readiness: index tri thức phải nạp được trước khi nhận traffic."""
    try:
        status = get_chat_service().readiness()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={"ready": False, "reason": type(exc).__name__},
        ) from exc
    if not status["ready"]:
        raise HTTPException(status_code=503, detail=status)
    return {"status": "ready", **status}
