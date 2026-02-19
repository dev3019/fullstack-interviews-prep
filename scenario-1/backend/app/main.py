import logging
from enum import Enum
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, Query, Path
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import or_, and_, func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from datetime import datetime

from .database import engine, get_db, Base
from .models import Task
from .seed import seed_tasks

Base.metadata.create_all(bind=engine)
logger = logging.getLogger(__name__)

app = FastAPI(title="Task Tracker API")

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
        seed_tasks(db)
    except Exception:
        logger.exception("Failed to seed tasks during startup")
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class TaskStatus(str, Enum):
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"


class TaskPriority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    priority: TaskPriority = TaskPriority.medium

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Title cannot be empty")
        return normalized

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str) -> str:
        return value.strip()


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=5000)
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None

    @field_validator("title")
    @classmethod
    def normalize_optional_title(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        normalized = value.strip()
        if not normalized:
            raise ValueError("Title cannot be empty")
        return normalized

    @field_validator("description")
    @classmethod
    def normalize_optional_description(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        return value.strip()

    @model_validator(mode="after")
    def ensure_payload_has_update(self):
        if all(
            value is None
            for value in (self.title, self.description, self.status, self.priority)
        ):
            raise ValueError("At least one field must be provided for update")
        return self


class TaskResponse(BaseModel):
    id: int
    title: str
    description: str
    status: TaskStatus
    priority: TaskPriority
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
    status: Optional[TaskStatus] = Query(default=None),
    priority: Optional[TaskPriority] = Query(default=None),
    search: Optional[str] = Query(default=None, min_length=1, max_length=200),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(Task)

    filters = []
    if status:
        filters.append(Task.status == status.value)
    if priority:
        filters.append(Task.priority == priority.value)
    if search:
        filters.append(
            or_(
                Task.title.ilike(f"%{search}%"),
                Task.description.ilike(f"%{search}%"),
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
        priority=task.priority.value,
        status=TaskStatus.pending.value,
        created_at=datetime.utcnow(),
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
def get_task(task_id: int = Path(..., gt=0), db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@app.patch("/api/tasks/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: int = Path(..., gt=0),
    update: TaskUpdate = ...,
    db: Session = Depends(get_db),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if update.title is not None:
        task.title = update.title
    if update.description is not None:
        task.description = update.description
    if update.status is not None:
        task.status = update.status.value
        if update.status == TaskStatus.completed:
            task.completed_at = datetime.utcnow()
        else:
            task.completed_at = None
    if update.priority is not None:
        task.priority = update.priority.value

    try:
        db.commit()
        db.refresh(task)
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update task")
    return task


@app.delete("/api/tasks/{task_id}", status_code=204)
def delete_task(task_id: int = Path(..., gt=0), db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(task)
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete task")
