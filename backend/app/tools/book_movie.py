"""
Tool: book_movie

Claude calls this when user wants to book a movie ticket.
Handles race conditions with SELECT FOR UPDATE locking.
"""

import logging
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.movie import Movie
from app.models.showtime import Showtime
from app.models.booking import Booking
from app.models.booking_seat import BookingSeat
from app.models.seat import Seat

logger = logging.getLogger(__name__)


async def book_movie(
    user_id: int,
    movie_id: int,
    showtime_id: int,
    seat_ids: list[int]
) -> dict:
    """
    Book a movie ticket for the user.
    
    Uses SELECT FOR UPDATE to prevent double-booking race conditions.
    
    Args:
        user_id: User ID
        movie_id: Movie ID
        showtime_id: Showtime ID
        seat_ids: List of seat IDs to book
    
    Returns:
        {
            "booking": {
                "booking_id": 42,
                "movie_title": "Fast & Furious",
                "showtime": "2026-06-06T18:00:00",
                "seats": [10, 11, 12],
                "total_price": 600.00
            }
        }
    """
    try:
        async with AsyncSessionLocal() as session:
            # Step 1: Fetch and lock showtime (SELECT FOR UPDATE)
            query = select(Showtime).where(Showtime.id == showtime_id)
            query = query.with_for_update()  # Lock the row
            
            result = await session.execute(query)
            showtime = result.scalar_one_or_none()
            
            if not showtime:
                return {"error": f"Showtime {showtime_id} not found"}
            
            # Step 2: Fetch and lock seats
            seat_query = select(Seat).where(Seat.id.in_(seat_ids))
            seat_query = seat_query.with_for_update()  # Lock the rows
            
            seat_result = await session.execute(seat_query)
            seats = seat_result.scalars().all()
            
            if len(seats) != len(seat_ids):
                return {"error": "One or more seats not found"}
            
            # Step 3: Check if seats are already booked
            booked_seats_query = select(BookingSeat).where(
                BookingSeat.seat_id.in_(seat_ids),
                BookingSeat.showtime_id == showtime_id
            )
            booked_result = await session.execute(booked_seats_query)
            booked = booked_result.scalars().all()
            
            if booked:
                return {"error": f"One or more seats are already booked"}
            
            # Step 4: Create booking
            booking = Booking(
                user_id=user_id,
                total_price=len(seat_ids) * 100.00,  # $100 per seat
                status="confirmed",
                created_at=datetime.utcnow()
            )
            session.add(booking)
            await session.flush()  # Get booking.id without committing
            
            # Step 5: Create booking_seat records
            for seat in seats:
                booking_seat = BookingSeat(
                    booking_id=booking.id,
                    showtime_id=showtime_id,
                    seat_id=seat.id
                )
                session.add(booking_seat)
            
            # Step 6: Commit everything
            await session.commit()
            
            logger.info(f"Booking {booking.id} created for user {user_id}")
            
            # Step 7: Fetch movie details for response
            movie_query = select(Movie).where(Movie.id == movie_id)
            movie_result = await session.execute(movie_query)
            movie = movie_result.scalar_one_or_none()
            
            return {
                "booking": {
                    "booking_id": booking.id,
                    "movie_title": movie.title if movie else "Unknown",
                    "showtime": showtime.showtime.isoformat() if showtime.showtime else None,
                    "seats": seat_ids,
                    "total_price": float(booking.total_price)
                }
            }
    
    except Exception as e:
        logger.error(f"book_movie error: {str(e)}")
        await session.rollback()
        return {"error": f"Booking failed: {str(e)}"}
