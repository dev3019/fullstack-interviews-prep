from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Text
from datetime import datetime

from .database import Base


class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, default="")
    amount = Column(Float, nullable=False)
    category = Column(String(50), nullable=False, index=True)
    status = Column(String(20), default="pending", index=True)
    expense_date = Column(Date, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
