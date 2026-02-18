from sqlalchemy import Column, Integer, String, DateTime, Text
from datetime import datetime, timezone

from .database import Base


def utc_now() -> datetime:
    # Store timestamps as naive UTC for SQLite compatibility.
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, default="")
    status = Column(String(20), default="pending", index=True)
    priority = Column(String(10), default="medium", index=True)
    created_at = Column(DateTime, default=utc_now)
    completed_at = Column(DateTime, nullable=True)
