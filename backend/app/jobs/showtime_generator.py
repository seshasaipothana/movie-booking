from datetime import datetime, timedelta, timezone
from decimal import Decimal
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.models import Movie, Screen, Showtime


async def generate_showtimes():
    async with AsyncSessionLocal() as session:
        movies = (await session.execute(select(Movie))).scalars().all()
        screens = (await session.execute(select(Screen))).scalars().all()

        now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        show_times = [10, 13, 16, 19, 22]
        prices = [Decimal("150.00"), Decimal("200.00"), Decimal("250.00")]
        count = 0

        for day_offset in range(7):
            day = now + timedelta(days=day_offset)
            for screen in screens:
                for i, hour in enumerate(show_times):
                    start = day.replace(hour=hour)
                    existing = await session.execute(
                        select(Showtime).where(
                            Showtime.screen_id == screen.id,
                            Showtime.start_time == start,
                        )
                    )
                    if not existing.scalar_one_or_none():
                        movie = movies[count % len(movies)]
                        session.add(Showtime(
                            movie_id=movie.id,
                            screen_id=screen.id,
                            start_time=start,
                            price=prices[i % len(prices)],
                        ))
                        count += 1

        await session.commit()
        print(f"Cron: generated {count} new showtimes.")