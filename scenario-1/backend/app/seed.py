import logging
from datetime import datetime, timedelta, timezone

from .models import Task, User

logger = logging.getLogger(__name__)

SEEDED_USER_EMAIL = "legacy-owner@example.com"
SEEDED_USER_NAME = "Legacy Owner"
SEEDED_USER_PROVIDER = "legacy"
SEEDED_USER_PROVIDER_ID = "legacy-owner"


def get_or_create_seed_user(db) -> User:
    user = db.query(User).filter(User.email == SEEDED_USER_EMAIL).first()
    if user:
        return user

    now = datetime.now(timezone.utc)
    user = User(
        email=SEEDED_USER_EMAIL,
        name=SEEDED_USER_NAME,
        picture=None,
        provider=SEEDED_USER_PROVIDER,
        provider_id=SEEDED_USER_PROVIDER_ID,
        created_at=now,
        last_login=now,
    )
    db.add(user)
    db.flush()
    return user


def seed_tasks(db):
    """Populate the database with sample tasks if empty."""
    user = get_or_create_seed_user(db)

    if db.query(Task).count() > 0:
        db.commit()
        return

    now = datetime.now(timezone.utc)

    tasks = [
        Task(
            title="Set up CI/CD pipeline",
            description="Configure GitHub Actions for automated testing and deployment",
            status="completed",
            priority="high",
            created_at=now - timedelta(days=7),
            completed_at=now - timedelta(days=5),
            user_id=user.id,
        ),
        Task(
            title="Fix login page styling",
            description="Resolve CSS alignment issues on the login form",
            status="completed",
            priority="low",
            created_at=now - timedelta(days=6),
            completed_at=now - timedelta(days=4),
            user_id=user.id,
        ),
        Task(
            title="Search indexing optimization",
            description="Improve database search query performance with proper indexing",
            status="completed",
            priority="medium",
            created_at=now - timedelta(days=5),
            completed_at=now - timedelta(days=3),
            user_id=user.id,
        ),
        Task(
            title="Implement user search feature",
            description="Add ability to search users by name and email",
            status="in_progress",
            priority="high",
            created_at=now - timedelta(days=4),
            user_id=user.id,
        ),
        Task(
            title="Deploy to staging environment",
            description="Push latest changes to staging for QA testing",
            status="pending",
            priority="high",
            created_at=now - timedelta(days=3),
            user_id=user.id,
        ),
        Task(
            title="Write API documentation",
            description="Document all REST endpoints with request and response examples",
            status="pending",
            priority="medium",
            created_at=now - timedelta(days=3),
            user_id=user.id,
        ),
        Task(
            title="Fix search performance issue",
            description="Optimize slow search queries on the tasks endpoint",
            status="in_progress",
            priority="medium",
            created_at=now - timedelta(days=2),
            user_id=user.id,
        ),
        Task(
            title="Update npm dependencies",
            description="Upgrade outdated packages and resolve security vulnerabilities",
            status="pending",
            priority="low",
            created_at=now - timedelta(days=1),
            user_id=user.id,
        ),
        Task(
            title="Add email notifications",
            description="Send email alerts when task status changes",
            status="pending",
            priority="medium",
            created_at=now - timedelta(days=1),
            user_id=user.id,
        ),
        Task(
            title="Design new landing page",
            description="Create mockups for the redesigned landing page",
            status="in_progress",
            priority="low",
            created_at=now,
            user_id=user.id,
        ),
    ]

    try:
        db.add_all(tasks)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to seed tasks")
