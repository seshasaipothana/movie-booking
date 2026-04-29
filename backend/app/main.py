"""FastAPI application entry point."""

from fastapi import FastAPI

from app.api.health import router as health_router

app = FastAPI(
    title="Movie Booking API",
    description="Real-time movie ticket booking backend.",
    version="0.1.0",
)

app.include_router(health_router)