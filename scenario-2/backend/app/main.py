import logging
from datetime import date, datetime
from enum import Enum

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .database import engine, get_db, Base
from .models import Expense
from .seed import seed_expenses

Base.metadata.create_all(bind=engine)

logger = logging.getLogger(__name__)
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


class ErrorDetail(BaseModel):
    field: str | None = None
    message: str


class ErrorResponse(BaseModel):
    code: str
    message: str
    details: list[ErrorDetail] = Field(default_factory=list)


class ApiError(Exception):
    def __init__(
        self,
        *,
        status_code: int,
        code: str,
        message: str,
        details: list[ErrorDetail] | None = None,
    ):
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or []
        super().__init__(message)


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
    def title_not_blank(cls, value: str) -> str:
        title = value.strip()
        if not title:
            raise ValueError("Title cannot be blank")
        return title

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str) -> str:
        return value.strip()


class ExpenseUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    amount: float | None = Field(default=None, gt=0, le=1_000_000)
    category: CategoryEnum | None = None
    status: StatusEnum | None = None
    expense_date: date | None = None

    @field_validator("title")
    @classmethod
    def optional_title_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return value

        title = value.strip()
        if not title:
            raise ValueError("Title cannot be blank")
        return title

    @field_validator("description")
    @classmethod
    def optional_description_normalized(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return value.strip()


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


@app.exception_handler(ApiError)
async def api_exception_handler(request: Request, exc: ApiError):
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(
            code=exc.code,
            message=exc.message,
            details=exc.details,
        ).model_dump(),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    details: list[ErrorDetail] = []
    for error in exc.errors():
        field = ".".join(str(loc) for loc in error["loc"] if loc != "body") or None
        details.append(ErrorDetail(field=field, message=error["msg"]))

    return JSONResponse(
        status_code=422,
        content=ErrorResponse(
            code="VALIDATION_ERROR",
            message="Validation failed",
            details=details,
        ).model_dump(),
    )


@app.exception_handler(SQLAlchemyError)
async def db_exception_handler(request: Request, exc: SQLAlchemyError):
    logger.error("Database error: %s", exc)
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(
            code="INTERNAL_ERROR",
            message="An unexpected error occurred. Please try again later.",
        ).model_dump(),
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception: %s", exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(
            code="INTERNAL_ERROR",
            message="An unexpected error occurred. Please try again later.",
        ).model_dump(),
    )


def get_expense_or_404(expense_id: int, db: Session) -> Expense:
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise ApiError(status_code=404, code="NOT_FOUND", message="Expense not found")
    return expense


def commit_session(db: Session, instance: Expense | None = None) -> None:
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise

    if instance is not None:
        db.refresh(instance)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/api/expenses", response_model=ExpenseListResponse)
def list_expenses(
    category: CategoryEnum | None = None,
    status: StatusEnum | None = None,
    date_start: date | None = None,
    date_end: date | None = None,
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
        status=StatusEnum.pending.value,
        expense_date=expense.expense_date,
        created_at=datetime.utcnow(),
    )
    db.add(db_expense)
    commit_session(db, db_expense)
    return db_expense


@app.get("/api/expenses/{expense_id}", response_model=ExpenseResponse)
def get_expense(expense_id: int, db: Session = Depends(get_db)):
    return get_expense_or_404(expense_id, db)


@app.patch("/api/expenses/{expense_id}", response_model=ExpenseResponse)
def update_expense(
    expense_id: int, update: ExpenseUpdate, db: Session = Depends(get_db)
):
    expense = get_expense_or_404(expense_id, db)

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

    commit_session(db, expense)
    return expense


@app.delete("/api/expenses/{expense_id}", status_code=204)
def delete_expense(expense_id: int, db: Session = Depends(get_db)):
    expense = get_expense_or_404(expense_id, db)
    db.delete(expense)
    commit_session(db)
