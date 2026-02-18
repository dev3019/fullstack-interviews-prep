import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import or_, and_, func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .database import engine, get_db, SessionLocal, Base
from .models import Task
from .seed import seed_tasks

logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)

# ---------------------------------------------------------------------------
# Lifespan (replaces deprecated @app.on_event)
# ---------------------------------------------------------------------------

VALID_STATUSES = Literal["pending", "in_progress", "completed"]
VALID_PRIORITIES = Literal["low", "medium", "high"]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db = SessionLocal()
    try:
        seed_tasks(db)
    except Exception:
        logger.exception("Startup seeding failed")
    finally:
        db.close()
    yield


app = FastAPI(title="Task Tracker API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    priority: VALID_PRIORITIES = "medium"


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    status: Optional[VALID_STATUSES] = None
    priority: Optional[VALID_PRIORITIES] = None


class TaskResponse(BaseModel):
    id: int
    title: str
    description: str
    status: str
    priority: str
    created_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TaskListResponse(BaseModel):
    tasks: list[TaskResponse]
    total: int
    page: int
    limit: int


class TaskStatsResponse(BaseModel):
    total: int
    completed: int
    in_progress: int
    pending: int
    completion_rate: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _escape_like(value: str) -> str:
    """Escape special SQL LIKE wildcard characters."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/api/tasks/stats", response_model=TaskStatsResponse)
def get_task_stats(db: Session = Depends(get_db)):
    rows = (
        db.query(Task.status, func.count(Task.id))
        .group_by(Task.status)
        .all()
    )
    counts = {status: cnt for status, cnt in rows}
    completed = counts.get("completed", 0)
    in_progress = counts.get("in_progress", 0)
    pending = counts.get("pending", 0)
    total = completed + in_progress + pending
    completion_rate = round((completed / total) * 100) if total > 0 else 0

    return TaskStatsResponse(
        total=total,
        completed=completed,
        in_progress=in_progress,
        pending=pending,
        completion_rate=completion_rate,
    )


@app.get("/api/tasks", response_model=TaskListResponse)
def list_tasks(
    status: Optional[VALID_STATUSES] = None,
    priority: Optional[VALID_PRIORITIES] = None,
    search: Optional[str] = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(Task)

    filters = []
    if status:
        filters.append(Task.status == status)
    if priority:
        filters.append(Task.priority == priority)
    if search:
        escaped = _escape_like(search)
        filters.append(
            or_(
                Task.title.ilike(f"%{escaped}%", escape="\\"),
                Task.description.ilike(f"%{escaped}%", escape="\\"),
            )
        )

    if filters:
        query = query.filter(and_(*filters))

    total = query.with_entities(func.count(Task.id)).scalar()

    tasks = (
        query.order_by(Task.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    return TaskListResponse(tasks=tasks, total=total, page=page, limit=limit)


@app.post("/api/tasks", response_model=TaskResponse, status_code=201)
def create_task(task: TaskCreate, db: Session = Depends(get_db)):
    db_task = Task(
        title=task.title,
        description=task.description,
        priority=task.priority,
        status="pending",
        created_at=datetime.now(timezone.utc),
    )
    db.add(db_task)
    try:
        db.commit()
        db.refresh(db_task)
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create task")
    return db_task


@app.get("/api/tasks/{task_id}", response_model=TaskResponse)
def get_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@app.patch("/api/tasks/{task_id}", response_model=TaskResponse)
def update_task(task_id: int, update: TaskUpdate, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if update.title is not None:
        task.title = update.title
    if update.description is not None:
        task.description = update.description
    if update.status is not None:
        task.status = update.status
        if update.status == "completed":
            task.completed_at = datetime.now(timezone.utc)
        else:
            task.completed_at = None
    if update.priority is not None:
        task.priority = update.priority

    try:
        db.commit()
        db.refresh(task)
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update task")
    return task


@app.delete("/api/tasks/{task_id}", status_code=204)
def delete_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(task)
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete task")
