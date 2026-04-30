"""Declarative base — every database model inherits from this."""
from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    """Base class for all SQLAlchemy ORM models in this project."""
    pass