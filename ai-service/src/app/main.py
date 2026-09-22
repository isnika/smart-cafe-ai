from fastapi import FastAPI

from src.app.api.routes import (
    health,
    chat,
    recommendation,
    forecasting,
    inventory
)

app = FastAPI(
    title="Smart Cafe AI Service",
    version="1.0.0"
)

app.include_router(health.router)
app.include_router(chat.router)
app.include_router(recommendation.router)
app.include_router(forecasting.router)
app.include_router(inventory.router)