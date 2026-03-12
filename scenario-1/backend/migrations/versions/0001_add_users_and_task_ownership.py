"""add users and task ownership

Revision ID: 0001_add_users_and_task_ownership
Revises:
Create Date: 2026-03-08 00:00:00.000000
"""

from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0001_add_users_and_task_ownership"
down_revision = None
branch_labels = None
depends_on = None

legacy_user_table = sa.table(
    "users",
    sa.column("id", sa.Integer()),
    sa.column("email", sa.String(length=255)),
    sa.column("name", sa.String(length=200)),
    sa.column("picture", sa.String(length=500)),
    sa.column("provider", sa.String(length=50)),
    sa.column("provider_id", sa.String(length=255)),
    sa.column("created_at", sa.DateTime()),
    sa.column("last_login", sa.DateTime()),
)


def upgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("picture", sa.String(length=500), nullable=True),
        sa.Column("provider", sa.String(length=50), nullable=False, server_default="google"),
        sa.Column("provider_id", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_login", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    timestamp = datetime.now(timezone.utc)
    op.bulk_insert(
        legacy_user_table,
        [
            {
                "id": 1,
                "email": "legacy-owner@example.com",
                "name": "Legacy Owner",
                "picture": None,
                "provider": "legacy",
                "provider_id": "legacy-owner",
                "created_at": timestamp,
                "last_login": timestamp,
            }
        ],
    )

    if inspector.has_table("tasks"):
        with op.batch_alter_table("tasks") as batch_op:
            batch_op.add_column(sa.Column("user_id", sa.Integer(), nullable=True))

        op.execute("UPDATE tasks SET user_id = 1 WHERE user_id IS NULL")

        with op.batch_alter_table("tasks") as batch_op:
            batch_op.alter_column("user_id", existing_type=sa.Integer(), nullable=False)
            batch_op.create_index("ix_tasks_user_id", ["user_id"], unique=False)
            batch_op.create_foreign_key(
                "fk_tasks_user_id_users",
                "users",
                ["user_id"],
                ["id"],
            )
    else:
        op.create_table(
            "tasks",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("title", sa.String(length=200), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=True),
            sa.Column("priority", sa.String(length=10), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_tasks_user_id_users"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_tasks_priority", "tasks", ["priority"], unique=False)
        op.create_index("ix_tasks_status", "tasks", ["status"], unique=False)
        op.create_index("ix_tasks_user_id", "tasks", ["user_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_constraint("fk_tasks_user_id_users", type_="foreignkey")
        batch_op.drop_index("ix_tasks_user_id")
        batch_op.drop_column("user_id")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
