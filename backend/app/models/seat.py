"""Seat model — an individual seat in a specific screen."""

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Seat(Base):
    __tablename__ = "seats"
    __table_args__ = (
        UniqueConstraint("screen_id", "row", "number", name="uq_seat_screen_row_number"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    screen_id: Mapped[int] = mapped_column(
        ForeignKey("screens.id", ondelete="CASCADE"),
        index=True,
    )
    row: Mapped[str] = mapped_column(String(5))
    number: Mapped[int] = mapped_column()