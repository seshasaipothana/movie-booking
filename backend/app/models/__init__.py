"""All ORM models — importing here registers them with SQLAlchemy's metadata."""

from app.models.booking import Booking, BookingStatus
from app.models.booking_seat import BookingSeat
from app.models.cinema import Cinema
from app.models.movie import Movie
from app.models.payment import Payment, PaymentStatus
from app.models.screen import Screen
from app.models.seat import Seat
from app.models.showtime import Showtime
from app.models.user import User

__all__ = [
    "Booking",
    "BookingSeat",
    "BookingStatus",
    "Cinema",
    "Movie",
    "Payment",
    "PaymentStatus",
    "Screen",
    "Seat",
    "Showtime",
    "User",
]