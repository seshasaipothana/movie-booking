"""Seed script — populates the database with sample data for development.

Run from the backend folder:
    uv run python -m scripts.seed
"""

import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models import Cinema, Movie, Screen, Seat, Showtime

async def seed():
    async with AsyncSessionLocal() as session:

        # --- CINEMAS ---
        cinemas_data = [
            {"name": "PVR Forum Mall", "address": "Koramangala, Bangalore"},
            {"name": "INOX Garuda", "address": "Magrath Road, Bangalore"},
        ]

        # --- MOVIES ---
        movies_data = [
            {"title": "Interstellar", "description": "Space, time, love.", "duration_minutes": 169, "poster_url": None},
            {"title": "Inception", "description": "Dreams within dreams.", "duration_minutes": 148, "poster_url": None},
            {"title": "The Dark Knight", "description": "Gotham's reckoning.", "duration_minutes": 152, "poster_url": None},
            {"title": "Dune", "description": "Desert planet. Chosen one.", "duration_minutes": 155, "poster_url": None},
            {"title": "Oppenheimer", "description": "Father of the atomic bomb.", "duration_minutes": 180, "poster_url": None},
        ]

        # --- SCREENS per cinema ---
        # PVR gets 2 screens, INOX gets 1
        screens_data = {
            "PVR Forum Mall": ["Screen 1", "Screen 2"],
            "INOX Garuda": ["Screen 1"],
        } 
# --- INSERT CINEMAS (skip if already exist) ---
        cinema_objs = {}
        for c in cinemas_data:
            existing = await session.execute(
                select(Cinema).where(Cinema.name == c["name"])
            )
            obj = existing.scalar_one_or_none()
            if not obj:
                obj = Cinema(**c)
                session.add(obj)
                await session.flush()
            cinema_objs[c["name"]] = obj

        # --- INSERT MOVIES ---
        movie_objs = []
        for m in movies_data:
            existing = await session.execute(
                select(Movie).where(Movie.title == m["title"])
            )
            obj = existing.scalar_one_or_none()
            if not obj:
                obj = Movie(**m)
                session.add(obj)
                await session.flush()
            movie_objs.append(obj)

        # --- INSERT SCREENS ---
        screen_objs = []
        for cinema_name, screen_names in screens_data.items():
            cinema = cinema_objs[cinema_name]
            for name in screen_names:
                existing = await session.execute(
                    select(Screen).where(
                        Screen.cinema_id == cinema.id,
                        Screen.name == name,
                    )
                )
                obj = existing.scalar_one_or_none()
                if not obj:
                    obj = Screen(cinema_id=cinema.id, name=name)
                    session.add(obj)
                    await session.flush()
                screen_objs.append(obj)

        # --- INSERT SEATS (rows A-F, numbers 1-10 per screen) ---
        for screen in screen_objs:
            for row in "ABCDEF":
                for number in range(1, 11):
                    existing = await session.execute(
                        select(Seat).where(
                            Seat.screen_id == screen.id,
                            Seat.row == row,
                            Seat.number == number,
                        )
                    )
                    if not existing.scalar_one_or_none():
                        session.add(Seat(screen_id=screen.id, row=row, number=number))

        await session.flush()

        # --- INSERT SHOWTIMES (20 across next 7 days) ---
        now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        show_times = [10, 13, 16, 19, 22]  # hours: 10am, 1pm, 4pm, 7pm, 10pm
        prices = [Decimal("150.00"), Decimal("200.00"), Decimal("250.00")]
        count = 0

        for day_offset in range(7):
            day = now + timedelta(days=day_offset)
            for screen in screen_objs:
                for hour in show_times:
                    if count >= 20:
                        break
                    movie = movie_objs[count % len(movie_objs)]
                    start = day.replace(hour=hour)
                    existing = await session.execute(
                        select(Showtime).where(
                            Showtime.screen_id == screen.id,
                            Showtime.start_time == start,
                        )
                    )
                    if not existing.scalar_one_or_none():
                        session.add(Showtime(
                            movie_id=movie.id,
                            screen_id=screen.id,
                            start_time=start,
                            price=prices[count % len(prices)],
                        ))
                        count += 1
                if count >= 20:
                    break
            if count >= 20:
                break

        await session.commit()
        print(f"Seeded: {len(cinema_objs)} cinemas, {len(movie_objs)} movies, "
              f"{len(screen_objs)} screens, 60 seats/screen, {count} showtimes.")


if __name__ == "__main__":
    asyncio.run(seed())