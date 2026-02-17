from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date

from .database import engine, get_db, Base
from .models import Expense
from .seed import seed_expenses

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Expense Report API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    db = next(get_db())
    try:
        seed_expenses(db)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class ExpenseCreate(BaseModel):
    title: str
    description: str = ""
    amount: float
    category: str
    expense_date: date


class ExpenseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    status: Optional[str] = None
    expense_date: Optional[date] = None


class ExpenseResponse(BaseModel):
    id: int
    title: str
    description: str
    amount: float
    category: str
    status: str
    expense_date: date
    created_at: datetime

    class Config:
        from_attributes = True


class ExpenseListResponse(BaseModel):
    expenses: list[ExpenseResponse]
    total: int


class SummaryResponse(BaseModel):
    total: float
    by_category: dict[str, float]
    count: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/api/expenses", response_model=ExpenseListResponse)
def list_expenses(
    category: Optional[str] = None,
    status: Optional[str] = None,
    date_start: Optional[str] = None,
    date_end: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Expense)
    if category:
        query = query.filter(Expense.category == category)
    if status:
        query = query.filter(Expense.status == status)
    if date_start:
        start = datetime.strptime(date_start, "%Y-%m-%d").date()
        query = query.filter(Expense.expense_date >= start)
    if date_end:
        end = datetime.strptime(date_end, "%Y-%m-%d").date()
        query = query.filter(Expense.expense_date < end)

    query = query.order_by(Expense.expense_date.desc())
    expenses = query.all()

    return ExpenseListResponse(expenses=expenses, total=len(expenses))


@app.get("/api/expenses/summary", response_model=SummaryResponse)
def get_summary(db: Session = Depends(get_db)):
    expenses = db.query(Expense).all()

    total = sum(e.amount for e in expenses)
    by_category: dict[str, float] = {}
    for exp in expenses:
        by_category.setdefault(exp.category, 0.0)
        by_category[exp.category] += exp.amount

    return SummaryResponse(
        total=round(total, 2),
        by_category={k: round(v, 2) for k, v in sorted(by_category.items())},
        count=len(expenses),
    )


@app.post("/api/expenses", response_model=ExpenseResponse, status_code=201)
def create_expense(expense: ExpenseCreate, db: Session = Depends(get_db)):
    db_expense = Expense(
        title=expense.title,
        description=expense.description,
        amount=expense.amount,
        category=expense.category,
        status="pending",
        expense_date=expense.expense_date,
        created_at=datetime.utcnow(),
    )
    db.add(db_expense)
    db.commit()
    db.refresh(db_expense)
    return db_expense


@app.get("/api/expenses/{expense_id}", response_model=ExpenseResponse)
def get_expense(expense_id: int, db: Session = Depends(get_db)):
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    return expense


@app.patch("/api/expenses/{expense_id}", response_model=ExpenseResponse)
def update_expense(
    expense_id: int, update: ExpenseUpdate, db: Session = Depends(get_db)
):
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    if update.title is not None:
        expense.title = update.title
    if update.description is not None:
        expense.description = update.description
    if update.amount is not None:
        expense.amount = update.amount
    if update.category is not None:
        expense.category = update.category
    if update.status is not None:
        expense.status = update.status
    if update.expense_date is not None:
        expense.expense_date = update.expense_date

    db.commit()
    db.refresh(expense)
    return expense


@app.delete("/api/expenses/{expense_id}", status_code=204)
def delete_expense(expense_id: int, db: Session = Depends(get_db)):
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    db.delete(expense)
    db.commit()
