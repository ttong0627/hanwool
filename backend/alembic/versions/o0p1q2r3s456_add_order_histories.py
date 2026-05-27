"""add order histories

Revision ID: o0p1q2r3s456
Revises: n9o0p1q2r345
Create Date: 2026-05-27
"""
from alembic import op
import sqlalchemy as sa


revision = "o0p1q2r3s456"
down_revision = "n9o0p1q2r345"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "order_histories",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("order_no", sa.String(length=20), nullable=False),
        sa.Column("event_type", sa.String(length=40), nullable=False),
        sa.Column("from_status", sa.String(length=20), nullable=True),
        sa.Column("to_status", sa.String(length=20), nullable=True),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("actor_role", sa.String(length=20), nullable=True),
        sa.Column("driver_id", sa.Integer(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_order_histories_order_id", "order_histories", ["order_id"])
    op.create_index("ix_order_histories_order_no", "order_histories", ["order_no"])
    op.create_index("ix_order_histories_event_type", "order_histories", ["event_type"])
    op.create_index("ix_order_histories_actor_user_id", "order_histories", ["actor_user_id"])
    op.create_index("ix_order_histories_driver_id", "order_histories", ["driver_id"])
    op.create_index("ix_order_histories_created_at", "order_histories", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_order_histories_created_at", table_name="order_histories")
    op.drop_index("ix_order_histories_driver_id", table_name="order_histories")
    op.drop_index("ix_order_histories_actor_user_id", table_name="order_histories")
    op.drop_index("ix_order_histories_event_type", table_name="order_histories")
    op.drop_index("ix_order_histories_order_no", table_name="order_histories")
    op.drop_index("ix_order_histories_order_id", table_name="order_histories")
    op.drop_table("order_histories")
