"""add order_transfers table

Revision ID: b3c1d4e5f678
Revises: aeab23f881d7
Create Date: 2026-05-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b3c1d4e5f678"
down_revision: Union[str, None] = "aeab23f881d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "order_transfers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("from_driver_id", sa.Integer(), nullable=False),
        sa.Column("to_driver_id", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column(
            "transferred_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["from_driver_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"]),
        sa.ForeignKeyConstraint(["to_driver_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_order_transfers_id", "order_transfers", ["id"])
    op.create_index("ix_order_transfers_order_id", "order_transfers", ["order_id"])
    op.create_index("ix_order_transfers_transferred_at", "order_transfers", ["transferred_at"])


def downgrade() -> None:
    op.drop_index("ix_order_transfers_transferred_at", table_name="order_transfers")
    op.drop_index("ix_order_transfers_order_id", table_name="order_transfers")
    op.drop_index("ix_order_transfers_id", table_name="order_transfers")
    op.drop_table("order_transfers")
