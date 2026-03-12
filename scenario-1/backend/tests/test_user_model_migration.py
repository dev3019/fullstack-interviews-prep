import importlib
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
from alembic import command
from alembic.config import Config
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

BACKEND_ROOT = Path(__file__).resolve().parents[1]
MODULES_TO_RESET = [
    "app.main",
    "app.seed",
    "app.models",
    "app.database",
]


def _reset_app_modules() -> None:
    for module_name in MODULES_TO_RESET:
        sys.modules.pop(module_name, None)


def _load_backend(monkeypatch: pytest.MonkeyPatch, db_path: Path) -> SimpleNamespace:
    db_url = f"sqlite:///{db_path}"
    monkeypatch.setenv("DATABASE_URL", db_url)
    monkeypatch.syspath_prepend(str(BACKEND_ROOT))
    _reset_app_modules()

    database = importlib.import_module("app.database")
    models = importlib.import_module("app.models")
    seed = importlib.import_module("app.seed")
    main = importlib.import_module("app.main")

    return SimpleNamespace(
        db_path=db_path,
        db_url=db_url,
        database=database,
        models=models,
        seed=seed,
        main=main,
    )


def _upgrade_to_head() -> None:
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "migrations"))
    command.upgrade(config, "head")


def _create_legacy_tasks_database(db_path: Path, with_rows: bool) -> None:
    connection = sqlite3.connect(db_path)
    try:
        connection.execute(
            """
            CREATE TABLE tasks (
                id INTEGER PRIMARY KEY,
                title VARCHAR(200) NOT NULL,
                description TEXT DEFAULT '',
                status VARCHAR(20) DEFAULT 'pending',
                priority VARCHAR(10) DEFAULT 'medium',
                created_at DATETIME,
                completed_at DATETIME
            )
            """
        )

        if with_rows:
            timestamp = datetime.now(timezone.utc).isoformat()
            connection.executemany(
                """
                INSERT INTO tasks (
                    title, description, status, priority, created_at, completed_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        "Legacy pending task",
                        "Created before auth migration",
                        "pending",
                        "medium",
                        timestamp,
                        None,
                    ),
                    (
                        "Legacy completed task",
                        "Another pre-auth task",
                        "completed",
                        "high",
                        timestamp,
                        timestamp,
                    ),
                ],
            )

        connection.commit()
    finally:
        connection.close()


@pytest.fixture
def migrated_backend(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    backend = _load_backend(monkeypatch, tmp_path / "tasks.db")
    _upgrade_to_head()
    try:
        yield backend
    finally:
        backend.database.engine.dispose()
        _reset_app_modules()


def test_migration_backfills_existing_tasks_with_legacy_owner(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db_path = tmp_path / "legacy-tasks.db"
    _create_legacy_tasks_database(db_path, with_rows=True)
    backend = _load_backend(monkeypatch, db_path)

    try:
        _upgrade_to_head()

        connection = sqlite3.connect(db_path)
        try:
            users = connection.execute(
                "SELECT id, email, provider, provider_id FROM users"
            ).fetchall()
            tasks = connection.execute(
                "SELECT id, title, user_id FROM tasks ORDER BY id"
            ).fetchall()
            task_columns = connection.execute("PRAGMA table_info(tasks)").fetchall()
        finally:
            connection.close()

        assert users == [(1, "legacy-owner@example.com", "legacy", "legacy-owner")]
        assert tasks == [
            (1, "Legacy pending task", 1),
            (2, "Legacy completed task", 1),
        ]

        user_id_column = next(column for column in task_columns if column[1] == "user_id")
        assert user_id_column[3] == 1
    finally:
        backend.database.engine.dispose()
        _reset_app_modules()


def test_migration_handles_empty_legacy_tasks_table(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db_path = tmp_path / "empty-legacy.db"
    _create_legacy_tasks_database(db_path, with_rows=False)
    backend = _load_backend(monkeypatch, db_path)

    try:
        _upgrade_to_head()

        connection = sqlite3.connect(db_path)
        try:
            user_count = connection.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            task_count = connection.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
        finally:
            connection.close()

        assert user_count == 1
        assert task_count == 0
    finally:
        backend.database.engine.dispose()
        _reset_app_modules()


def test_seed_tasks_is_idempotent(migrated_backend: SimpleNamespace) -> None:
    session = migrated_backend.database.SessionLocal()
    try:
        migrated_backend.seed.seed_tasks(session)
        migrated_backend.seed.seed_tasks(session)

        users = session.query(migrated_backend.models.User).all()
        tasks = session.query(migrated_backend.models.Task).all()

        assert len(users) == 1
        assert len(tasks) == 10
        assert {task.user_id for task in tasks} == {users[0].id}
    finally:
        session.close()


def test_user_email_must_be_unique(migrated_backend: SimpleNamespace) -> None:
    session = migrated_backend.database.SessionLocal()
    try:
        duplicate_user = migrated_backend.models.User(
            email=migrated_backend.seed.SEEDED_USER_EMAIL,
            name="Duplicate User",
            provider="legacy",
            provider_id="duplicate-user",
        )
        session.add(duplicate_user)

        with pytest.raises(IntegrityError):
            session.commit()
    finally:
        session.rollback()
        session.close()


def test_task_user_id_is_required_after_migration(
    migrated_backend: SimpleNamespace,
) -> None:
    session = migrated_backend.database.SessionLocal()
    try:
        invalid_task = migrated_backend.models.Task(
            title="Missing owner",
            description="Should fail validation at the database layer",
            status="pending",
            priority="low",
        )
        session.add(invalid_task)

        with pytest.raises(IntegrityError):
            session.commit()
    finally:
        session.rollback()
        session.close()


def test_task_routes_fail_without_seed_user_and_scope_to_seed_owner(
    migrated_backend: SimpleNamespace,
) -> None:
    session = migrated_backend.database.SessionLocal()
    try:
        seed_user = (
            session.query(migrated_backend.models.User)
            .filter(
                migrated_backend.models.User.email
                == migrated_backend.seed.SEEDED_USER_EMAIL
            )
            .one()
        )
        session.delete(seed_user)
        session.commit()

        with pytest.raises(HTTPException) as exc_info:
            migrated_backend.main.list_tasks(db=session)
        assert exc_info.value.status_code == 500
        assert exc_info.value.detail == "Seed user not found"

        migrated_backend.seed.seed_tasks(session)
        seed_user = (
            session.query(migrated_backend.models.User)
            .filter(
                migrated_backend.models.User.email
                == migrated_backend.seed.SEEDED_USER_EMAIL
            )
            .one()
        )

        other_user = migrated_backend.models.User(
            email="someone-else@example.com",
            name="Someone Else",
            provider="google",
            provider_id="someone-else",
        )
        session.add(other_user)
        session.commit()
        session.refresh(other_user)

        foreign_task = migrated_backend.models.Task(
            title="Other user's task",
            description="Should not be visible via default-owner routes",
            status="completed",
            priority="high",
            user_id=other_user.id,
        )
        session.add(foreign_task)
        session.commit()
        session.refresh(foreign_task)

        stats = migrated_backend.main.get_task_stats(db=session)
        listed_tasks = migrated_backend.main.list_tasks(page=1, limit=20, db=session)
        created_task = migrated_backend.main.create_task(
            migrated_backend.main.TaskCreate(
                title="Seed owner task",
                description="Created through the existing task route",
                priority="low",
            ),
            db=session,
        )

        assert stats.total == 10
        assert stats.completed == 3
        assert stats.in_progress == 3
        assert stats.pending == 4
        assert listed_tasks.total == 10
        assert created_task.user_id == seed_user.id

        with pytest.raises(HTTPException) as exc_info:
            migrated_backend.main.get_task(foreign_task.id, db=session)
        assert exc_info.value.status_code == 404
    finally:
        session.close()
