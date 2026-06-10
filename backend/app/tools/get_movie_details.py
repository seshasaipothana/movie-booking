"""
Tool: get_movie_details

Claude calls this when user wants detailed info about a specific movie.
Returns full details including cast, synopsis, rating, and all showtimes for next 7 days.
"""

import logging
from datetime import datetime, timedelta
from sqlalchemy import select, and_
from sqlalchemy.orm import joinedload

from app.db.session import AsyncSessionLocal
from app.models.movie import Movie
from app.models.showtime import Showtime

logger = logging.getLogger(__name__)


async def get_movie_details(
    user_id: int,
    movie_id: int
) -> dict:
    """
    Get detailed information about a specific movie.
    
    Args:
        user_id: User ID (for logging)
        movie_id: Movie ID
    
    Returns:
        {
            "movie": {
                "id": 1,
                "title": "Fast & Furious",
                "genre": "action",
                "cast": "Vin Diesel, Paul Walker",
                "director": "Justin Lin",
                "rating": 7.5,
                "duration_minutes": 141,
                "synopsis": "...",
                "poster_url": "https://...",
                "showtimes": [
                    {
                        "id": 10,
                        "time": "2026-06-06T18:00:00",
                        "available_seats": 45
                    },
                    ...
                ]
            }
        }
    """
    try:
        async with AsyncSessionLocal() as session:
            # Fetch movie with showtimes
            query = select(Movie).where(Movie.id == movie_id)
            query = query.options(joinedload(Movie.showtimes))
            
            result = await session.execute(query)
            movie = result.unique().scalar_one_or_none()
            
            if not movie:
                logger.warning(f"Movie {movie_id} not found for user {user_id}")
                return {"error": f"Movie {movie_id} not found"}
            
            logger.info(f"get_movie_details: Fetched movie {movie_id} for user {user_id}")
            
            # Format response
            movie_dict = {
                "id": movie.id,
                "title": movie.title,
                "genre": movie.genre,
                "cast": movie.cast,
                "director": movie.director,
                "rating": movie.rating,
                "duration_minutes": movie.duration_minutes,
                "synopsis": movie.synopsis or "No synopsis available",
                "poster_url": movie.poster_url,
                "showtimes": [
                    {
                        "id": showtime.id,
                        "time": showtime.showtime.isoformat() if showtime.showtime else None,
                        "available_seats": showtime.available_seats
                    }
                    for showtime in sorted(movie.showtimes, key=lambda s: s.showtime)
                ]
            }
            
            return {"movie": movie_dict}
    
    except Exception as e:
        logger.error(f"get_movie_details error: {str(e)}")
        return {"error": f"Failed to get movie details: {str(e)}"}
