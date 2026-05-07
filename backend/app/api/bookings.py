"""Booking endpoints — create a booking with seat locking."""

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.booking import Booking, BookingStatus
from app.models.booking_seat import BookingSeat
from app.models.seat import Seat
from app.models.showtime import Showtime
from app.models.user import User

router = APIRouter(prefix="/api/bookings", tags=["bookings"])


class BookingRequest(BaseModel):
    showtime_id: int
    seat_ids: list[int]


class BookingOut(BaseModel):
    id: int
    showtime_id: int
    status: BookingStatus
    total_amount: float
    seat_ids: list[int]


@router.post("", response_model=BookingOut)
async def create_booking(
    body: BookingRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 1. Verify showtime exists
    showtime = await db.get(Showtime, body.showtime_id)
    if not showtime:
        raise HTTPException(status_code=404, detail="Showtime not found")

    # 2. Lock the requested seat rows (SELECT FOR UPDATE)
    #    This is the concurrency protection — no other transaction
    #    can touch these rows until we commit or rollback.
    result = await db.execute(
        select(Seat)
        .where(Seat.id.in_(body.seat_ids))
        .with_for_update()          # ← THE KEY LINE
    )
    seats = result.scalars().all()

    if len(seats) != len(body.seat_ids):
        raise HTTPException(status_code=404, detail="One or more seats not found")

    # 3. Check none of the seats are already booked for this showtime
    already_booked = await db.execute(
        select(BookingSeat)
        .join(Booking)
        .where(
            BookingSeat.seat_id.in_(body.seat_ids),
            Booking.showtime_id == body.showtime_id,
            Booking.status != BookingStatus.CANCELLED,
        )
    )
    if already_booked.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="One or more seats are already booked",
        )

    # 4. Calculate total
    total = showtime.price * Decimal(len(seats))

    # 5. Create the booking
    booking = Booking(
        user_id=current_user.id,
        showtime_id=body.showtime_id,
        status=BookingStatus.CONFIRMED,
        total_amount=total,
    )
    db.add(booking)
    await db.flush()  # gets booking.id without committing yet

    # 6. Link each seat to this booking
    for seat in seats:
        db.add(BookingSeat(booking_id=booking.id, seat_id=seat.id))

    # 7. Commit — locks released, booking is permanent
    await db.commit()
    await db.refresh(booking)

    return BookingOut(
        id=booking.id,
        showtime_id=booking.showtime_id,
        status=booking.status,
        total_amount=float(booking.total_amount),
        seat_ids=[s.id for s in seats],
    )


@router.get("/my", response_model=list[BookingOut])
async def my_bookings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Booking)
        .where(Booking.user_id == current_user.id)
        .order_by(Booking.id.desc())
    )
    bookings = result.scalars().all()

    out = []
    for b in bookings:
        seats = await db.execute(
            select(BookingSeat).where(BookingSeat.booking_id == b.id)
        )
        seat_ids = [s.seat_id for s in seats.scalars()]
        out.append(BookingOut(
            id=b.id,
            showtime_id=b.showtime_id,
            status=b.status,
            total_amount=float(b.total_amount),
            seat_ids=seat_ids,
        ))
    return out