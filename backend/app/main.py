"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.bookings import router as bookings_router
from app.api.health import router as health_router
from app.api.movies import router as movies_router
from app.api.seat_locks import router as seat_locks_router
from app.api.websockets import router as websockets_router

app = FastAPI(
    title="Movie Booking API",
    description="Real-time movie ticket booking backend.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(movies_router)
app.include_router(bookings_router)
app.include_router(seat_locks_router)
app.include_router(websockets_router)