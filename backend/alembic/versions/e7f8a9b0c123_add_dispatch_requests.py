"""add dispatch requests

Revision ID: e7f8a9b0c123
Revises: d4e5f6a7b891
Create Date: 2026-05-27 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e7f8a9b0c123"
down_revision: Union[str, None] = "d4e5f6a7b891"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dispatch_requests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("request_date", sa.Date(), nullable=False),
        sa.Column("requested_by_driver_id", sa.Integer(), nullable=False),
        sa.Column("total_orders", sa.Integer(), nullable=False),
        sa.Column("pending_orders", sa.Integer(), nullable=False),
        sa.Column("recommended_driver_count", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("resolved_by_admin_id", sa.Integer(), nullable=True),
        sa.Column("resolved_driver_ids", sa.String(length=100), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["requested_by_driver_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["resolved_by_admin_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_dispatch_requests_id"), "dispatch_requests", ["id"], unique=False)
    op.create_index(op.f("ix_dispatch_requests_request_date"), "dispatch_requests", ["request_date"], unique=False)
    op.create_index(op.f("ix_dispatch_requests_requested_by_driver_id"), "dispatch_requests", ["requested_by_driver_id"], unique=False)
    op.create_index(op.f("ix_dispatch_requests_status"), "dispatch_requests", ["status"], unique=False)
    op.create_index(op.f("ix_dispatch_requests_created_at"), "dispatch_requests", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_dispatch_requests_created_at"), table_name="dispatch_requests")
    op.drop_index(op.f("ix_dispatch_requests_status"), table_name="dispatch_requests")
    op.drop_index(op.f("ix_dispatch_requests_requested_by_driver_id"), table_name="dispatch_requests")
    op.drop_index(op.f("ix_dispatch_requests_request_date"), table_name="dispatch_requests")
    op.drop_index(op.f("ix_dispatch_requests_id"), table_name="dispatch_requests")
    op.drop_table("dispatch_requests")
