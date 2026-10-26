
"""
Chạy service:
uvicorn src.app.main:app --reload --port 8000

Swagger:
http://127.0.0.1:8000/docs
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.app.api.routes import (
    health,
    chat,
    recommendation,
    forecasting,
)

app = FastAPI(
    title="Smart Cafe AI Service",
    description=(
        "AI backend for recommendations, cafe chatbot, "
        "and revenue forecasting."
    ),
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(chat.router)
app.include_router(recommendation.router)
app.include_router(forecasting.router)
