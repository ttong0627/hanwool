"""add client_row_id to orders (직접입력 행 멱등키 — 중복 주문 방지)

Revision ID: z1a2b3c4d567
Revises: y0z1a2b3c456
Create Date: 2026-06-15
"""
from alembic import op
import sqlalchemy as sa

revision = "z1a2b3c4d567"
down_revision = "y0z1a2b3c456"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("client_row_id", sa.String(length=64), nullable=True))
    op.create_index("ix_orders_client_row_id", "orders", ["client_row_id"])


def downgrade() -> None:
    op.drop_index("ix_orders_client_row_id", table_name="orders")
    op.drop_column("orders", "client_row_id")
