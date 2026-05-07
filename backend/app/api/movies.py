"""Browse endpoints — movies, cinemas, showtimes."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.cinema import Cinema
from app.models.movie import Movie
from app.models.screen import Screen
from app.models.seat import Seat
from app.models.showtime import Showtime
from app.models.booking import Booking, BookingStatus
from app.models.booking_seat import BookingSeat

router = APIRouter(prefix="/api", tags=["browse"])


# --- Response shapes ---

class CinemaOut(BaseModel):
    id: int
    name: str
    address: str

    model_config = {"from_attributes": True}


class MovieOut(BaseModel):
    id: int
    title: str
    description: str
    duration_minutes: int
    poster_url: str | None

    model_config = {"from_attributes": True}


class ShowtimeOut(BaseModel):
    id: int
    movie_id: int
    screen_id: int
    start_time: datetime
    price: float

    model_config = {"from_attributes": True}


class SeatOut(BaseModel):
    id: int
    row: str
    number: int

    model_config = {"from_attributes": True}


# --- Endpoints ---

@router.get("/cinemas", response_model=list[CinemaOut])
async def list_cinemas(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Cinema).order_by(Cinema.name))
    return result.scalars().all()


@router.get("/movies", response_model=list[MovieOut])
async def list_movies(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Movie).order_by(Movie.title))
    return result.scalars().all()


@router.get("/showtimes", response_model=list[ShowtimeOut])
async def list_showtimes(
    db: AsyncSession = Depends(get_db),
    cinema_id: int | None = None,
    movie_id: int | None = None,
):
    query = select(Showtime).where(
        Showtime.start_time >= datetime.now(timezone.utc)
    )
    if movie_id:
        query = query.where(Showtime.movie_id == movie_id)
    if cinema_id:
        query = query.join(Screen).where(Screen.cinema_id == cinema_id)

    query = query.order_by(Showtime.start_time)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/showtimes/{showtime_id}/seats", response_model=list[SeatOut])
async def list_seats(showtime_id: int, db: AsyncSession = Depends(get_db)):
    showtime = await db.get(Showtime, showtime_id)
    if not showtime:
        raise HTTPException(status_code=404, detail="Showtime not found")

    result = await db.execute(
        select(Seat)
        .where(Seat.screen_id == showtime.screen_id)
        .order_by(Seat.row, Seat.number)
    )
    return result.scalars().all()

@router.get("/showtimes/{showtime_id}/booked-seats", response_model=list[int])
async def booked_seats(showtime_id: int, db: AsyncSession = Depends(get_db)):
    """Returns list of seat IDs already booked for this showtime."""
    result = await db.execute(
        select(BookingSeat.seat_id)
        .join(Booking, Booking.id == BookingSeat.booking_id)
        .where(
            Booking.showtime_id == showtime_id,
            Booking.status != BookingStatus.CANCELLED,
        )
    )
    return result.scalars().all()