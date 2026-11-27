def get_recommendations(user_id: str | None, limit: int = 5):
    """Lazy export for the chatbot recommendation contract.

    The legacy recommendation implementation lives in this package too, so
    the import is intentionally lazy to avoid a circular import at startup.
    """

    from src.app.recommendation.chat_service import get_recommendations as _get_recommendations

    return _get_recommendations(user_id=user_id, limit=limit)
