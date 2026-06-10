"""Fetch popular movies from TMDB and seed into the database."""

import asyncio
import httpx
from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.models.movie import Movie
from sqlalchemy import select


TMDB_BASE = "https://api.themoviedb.org/3"
POSTER_BASE = "https://image.tmdb.org/t/p/w500"
HEADERS = {"Authorization": f"Bearer {settings.tmdb_read_access_token}"}


async def fetch_popular_movies(pages: int = 5) -> list[dict]:
    movies = []
    async with httpx.AsyncClient() as client:
        for page in range(1, pages + 1):
            r = await client.get(
                f"{TMDB_BASE}/movie/popular",
                headers=HEADERS,
                params={"language": "en-US", "page": page},
            )
            for m in r.json()["results"]:
                detail = await client.get(
                    f"{TMDB_BASE}/movie/{m['id']}",
                    headers=HEADERS,
                )
                d = detail.json()
                movies.append({
                    "title": d["title"],
                    "description": d["overview"] or "No description available.",
                    "duration_minutes": d["runtime"] or 120,
                    "poster_url": f"{POSTER_BASE}{d['poster_path']}" if d.get("poster_path") else None,
                })
    return movies


async def seed():
    print("Fetching movies from TMDB...")
    movies = await fetch_popular_movies(pages=5)
    print(f"Fetched {len(movies)} movies")

    async with AsyncSessionLocal() as session:
        added = 0
        for m in movies:
            existing = await session.execute(
                select(Movie).where(Movie.title == m["title"])
            )
            if not existing.scalar_one_or_none():
                session.add(Movie(**m))
                added += 1
        await session.commit()
        print(f"Added {added} new movies to DB")


async def fix_missing_posters():
    print("Fixing movies with missing posters...")
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Movie).where(Movie.poster_url == None)
        )
        movies = result.scalars().all()
        print(f"Found {len(movies)} movies with no poster")

        async with httpx.AsyncClient() as client:
            for movie in movies:
                r = await client.get(
                    f"{TMDB_BASE}/search/movie",
                    headers=HEADERS,
                    params={"query": movie.title, "language": "en-US"},
                )
                results = r.json().get("results", [])
                if results and results[0].get("poster_path"):
                    movie.poster_url = f"{POSTER_BASE}{results[0]['poster_path']}"
                    print(f"Fixed: {movie.title}")
                else:
                    print(f"No poster found for: {movie.title}")

        await session.commit()
        print("Done")


if __name__ == "__main__":
    asyncio.run(fix_missing_posters())