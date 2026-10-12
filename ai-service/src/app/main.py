from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.app.api.routes import health, chat, recommendation, forecasting, inventory

app = FastAPI(
    title="Smart Cafe AI Service",
    description="AI backend for recommendations, cafe chatbot, and revenue forecasting.",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict to your frontend origin before production.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(chat.router)
app.include_router(recommendation.router)
app.include_router(forecasting.router)
app.include_router(inventory.router)
