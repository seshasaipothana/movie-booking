"""Async database engine and session factory — used everywhere we touch the DB."""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

# A single shared engine for the whole app.
# Engines are heavyweight — create once, reuse forever.
engine = create_async_engine(
    settings.database_url,
    echo=False,           # set True if you want to see every SQL query in logs
    pool_pre_ping=True,   # checks the connection is alive before using it
)

# Session factory — produces new sessions on demand.
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a database session per request."""
    async with AsyncSessionLocal() as session:
        yield session