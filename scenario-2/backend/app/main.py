import logging
from enum import Enum

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime, date

from .database import engine, get_db, Base
from .models import Expense
from .seed import seed_expenses

logger = logging.getLogger(__name__)

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
# Error response models
# ---------------------------------------------------------------------------


class ErrorDetail(BaseModel):
    field: str | None = None
    message: str


class ErrorResponse(BaseModel):
    code: str
    message: str
    details: list[ErrorDetail] = []


# ---------------------------------------------------------------------------
# Global exception handlers
# ---------------------------------------------------------------------------


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    details = []
    for error in exc.errors():
        field = ".".join(str(loc) for loc in error["loc"] if loc != "body")
        details.append({"field": field, "message": error["msg"]})
    return JSONResponse(
        status_code=422,
        content={
            "code": "VALIDATION_ERROR",
            "message": "Validation failed",
            "details": details,
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    code_map = {404: "NOT_FOUND", 403: "FORBIDDEN", 401: "UNAUTHORIZED"}
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "code": code_map.get(exc.status_code, "HTTP_ERROR"),
            "message": exc.detail,
        },
    )


@app.exception_handler(SQLAlchemyError)
async def db_exception_handler(request: Request, exc: SQLAlchemyError):
    logger.error(f"Database error: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "code": "INTERNAL_ERROR",
            "message": "An unexpected error occurred. Please try again later.",
        },
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "code": "INTERNAL_ERROR",
            "message": "An unexpected error occurred. Please try again later.",
        },
    )


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class CategoryEnum(str, Enum):
    travel = "travel"
    meals = "meals"
    office = "office"
    software = "software"
    other = "other"


class StatusEnum(str, Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class ExpenseCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="", max_length=1000)
    amount: float = Field(..., gt=0, le=1_000_000)
    category: CategoryEnum
    expense_date: date

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Title cannot be blank")
        return v.strip()


class ExpenseUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    amount: float | None = Field(default=None, gt=0, le=1_000_000)
    category: CategoryEnum | None = None
    status: StatusEnum | None = None
    expense_date: date | None = None


class ExpenseResponse(BaseModel):
    id: int
    title: str
    description: str
    amount: float
    category: CategoryEnum
    status: StatusEnum
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
    date_start: Optional[date] = None,
    date_end: Optional[date] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Expense)
    if category:
        query = query.filter(Expense.category == category)
    if status:
        query = query.filter(Expense.status == status)
    if date_start:
        query = query.filter(Expense.expense_date >= date_start)
    if date_end:
        query = query.filter(Expense.expense_date <= date_end)

    query = query.order_by(Expense.expense_date.desc())
    expenses = query.all()

    return ExpenseListResponse(expenses=expenses, total=len(expenses))


@app.get("/api/expenses/summary", response_model=SummaryResponse)
def get_summary(db: Session = Depends(get_db)):
    expenses = db.query(Expense).filter(Expense.status != "rejected").all()

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
