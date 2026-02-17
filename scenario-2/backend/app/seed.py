from datetime import date, datetime, timedelta

from .models import Expense


def seed_expenses(db):
    """Populate the database with sample expenses if empty."""
    if db.query(Expense).count() > 0:
        return

    today = date.today()
    now = datetime.utcnow()

    expenses = [
        Expense(
            title="Flight to NYC",
            description="Round-trip flight for client meeting",
            amount=450.00,
            category="travel",
            status="approved",
            expense_date=today - timedelta(days=13),
            created_at=now - timedelta(days=13),
        ),
        Expense(
            title="Hotel - 3 nights",
            description="Hotel stay during NYC client visit",
            amount=780.00,
            category="travel",
            status="approved",
            expense_date=today - timedelta(days=12),
            created_at=now - timedelta(days=12),
        ),
        Expense(
            title="Team lunch",
            description="Lunch with engineering team",
            amount=85.50,
            category="meals",
            status="approved",
            expense_date=today - timedelta(days=10),
            created_at=now - timedelta(days=10),
        ),
        Expense(
            title="Office supplies",
            description="Notebooks, pens, and sticky notes",
            amount=42.99,
            category="office",
            status="approved",
            expense_date=today - timedelta(days=10),
            created_at=now - timedelta(days=10),
        ),
        Expense(
            title="IDE license renewal",
            description="Annual JetBrains subscription",
            amount=199.00,
            category="software",
            status="approved",
            expense_date=today - timedelta(days=8),
            created_at=now - timedelta(days=8),
        ),
        Expense(
            title="Taxi to airport",
            description="Taxi from office to JFK",
            amount=35.00,
            category="travel",
            status="approved",
            expense_date=today - timedelta(days=7),
            created_at=now - timedelta(days=7),
        ),
        Expense(
            title="Client dinner",
            description="Dinner with prospective client",
            amount=156.00,
            category="meals",
            status="pending",
            expense_date=today - timedelta(days=6),
            created_at=now - timedelta(days=6),
        ),
        Expense(
            title="Ergonomic keyboard",
            description="Mechanical keyboard for workstation",
            amount=89.99,
            category="office",
            status="pending",
            expense_date=today - timedelta(days=5),
            created_at=now - timedelta(days=5),
        ),
        Expense(
            title="Conference registration",
            description="Tech conference - budget exceeded",
            amount=350.00,
            category="travel",
            status="rejected",
            expense_date=today - timedelta(days=5),
            created_at=now - timedelta(days=5),
        ),
        Expense(
            title="Team coffee run",
            description="Coffee for afternoon standup",
            amount=24.50,
            category="meals",
            status="approved",
            expense_date=today - timedelta(days=3),
            created_at=now - timedelta(days=3),
        ),
        Expense(
            title="AWS monthly bill",
            description="Cloud infrastructure costs",
            amount=120.00,
            category="software",
            status="approved",
            expense_date=today - timedelta(days=2),
            created_at=now - timedelta(days=2),
        ),
        Expense(
            title="Printer cartridge",
            description="Replacement toner - wrong model ordered",
            amount=65.00,
            category="office",
            status="rejected",
            expense_date=today - timedelta(days=1),
            created_at=now - timedelta(days=1),
        ),
        Expense(
            title="Flight to SF",
            description="Upcoming west coast team sync",
            amount=520.00,
            category="travel",
            status="pending",
            expense_date=today,
            created_at=now,
        ),
        Expense(
            title="Uber rides",
            description="Various ride-shares for meetings",
            amount=48.75,
            category="travel",
            status="approved",
            expense_date=today,
            created_at=now,
        ),
        Expense(
            title="Team building event",
            description="Escape room team activity",
            amount=275.00,
            category="other",
            status="approved",
            expense_date=today - timedelta(days=7),
            created_at=now - timedelta(days=7),
        ),
    ]

    db.add_all(expenses)
    db.commit()
