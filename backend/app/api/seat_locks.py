"""Seat locking endpoints using Redis."""

from fastapi import APIRouter, Depends, HTTPException
from redis.asyncio import Redis

from app.core.redis import get_redis
from app.api.auth import get_current_user
from app.models import User

router = APIRouter(prefix="/api/seat-locks", tags=["seat-locks"])


@router.post("/{showtime_id}/{seat_id}/lock")
async def lock_seat(
    showtime_id: int,
    seat_id: int,
    current_user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
):
    """Lock a seat for 5 minutes while user is selecting."""
    lock_key = f"seat_lock:{showtime_id}:{seat_id}"
    
    # Check if already locked
    existing = await redis.get(lock_key)
    if existing and existing != str(current_user.id):
        raise HTTPException(status_code=409, detail="Seat is temporarily held by another user")
    
    # Set lock with 5 minute expiry
    await redis.setex(lock_key, 300, str(current_user.id))
    return {"locked": True}


@router.post("/{showtime_id}/{seat_id}/unlock")
async def unlock_seat(
    showtime_id: int,
    seat_id: int,
    current_user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
):
    """Release a seat lock."""
    lock_key = f"seat_lock:{showtime_id}:{seat_id}"
    
    # Only allow unlocking your own locks
    existing = await redis.get(lock_key)
    if existing == str(current_user.id):
        await redis.delete(lock_key)
    
    return {"unlocked": True}


@router.get("/{showtime_id}/locked-seats")
async def get_locked_seats(
    showtime_id: int,
    redis: Redis = Depends(get_redis),
):
    """Get all currently locked seat IDs for a showtime."""
    pattern = f"seat_lock:{showtime_id}:*"
    locked_seat_ids = []
    
    async for key in redis.scan_iter(match=pattern):
        # Extract seat_id from key like "seat_lock:123:456"
        seat_id = int(key.split(":")[-1])
        locked_seat_ids.append(seat_id)
    
    return locked_seat_ids