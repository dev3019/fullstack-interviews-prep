import logging
from datetime import datetime, timedelta, timezone

from .models import Task

logger = logging.getLogger(__name__)


def seed_tasks(db):
    """Populate the database with sample tasks if empty."""
    if db.query(Task).count() > 0:
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
        ),
        Task(
            title="Fix login page styling",
            description="Resolve CSS alignment issues on the login form",
            status="completed",
            priority="low",
            created_at=now - timedelta(days=6),
            completed_at=now - timedelta(days=4),
        ),
        Task(
            title="Search indexing optimization",
            description="Improve database search query performance with proper indexing",
            status="completed",
            priority="medium",
            created_at=now - timedelta(days=5),
            completed_at=now - timedelta(days=3),
        ),
        Task(
            title="Implement user search feature",
            description="Add ability to search users by name and email",
            status="in_progress",
            priority="high",
            created_at=now - timedelta(days=4),
        ),
        Task(
            title="Deploy to staging environment",
            description="Push latest changes to staging for QA testing",
            status="pending",
            priority="high",
            created_at=now - timedelta(days=3),
        ),
        Task(
            title="Write API documentation",
            description="Document all REST endpoints with request and response examples",
            status="pending",
            priority="medium",
            created_at=now - timedelta(days=3),
        ),
        Task(
            title="Fix search performance issue",
            description="Optimize slow search queries on the tasks endpoint",
            status="in_progress",
            priority="medium",
            created_at=now - timedelta(days=2),
        ),
        Task(
            title="Update npm dependencies",
            description="Upgrade outdated packages and resolve security vulnerabilities",
            status="pending",
            priority="low",
            created_at=now - timedelta(days=1),
        ),
        Task(
            title="Add email notifications",
            description="Send email alerts when task status changes",
            status="pending",
            priority="medium",
            created_at=now - timedelta(days=1),
        ),
        Task(
            title="Design new landing page",
            description="Create mockups for the redesigned landing page",
            status="in_progress",
            priority="low",
            created_at=now,
        ),
    ]

    try:
        db.add_all(tasks)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to seed tasks")
