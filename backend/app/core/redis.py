"""Redis client for seat locking and caching."""

from redis.asyncio import from_url, Redis

from app.core.config import settings

redis_client: Redis | None = None


async def get_redis() -> Redis:
    """Dependency for getting Redis connection."""
    global redis_client
    if redis_client is None:
        redis_client = from_url(settings.redis_url, decode_responses=True)
    return redis_client