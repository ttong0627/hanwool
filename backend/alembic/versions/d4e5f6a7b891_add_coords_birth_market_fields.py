"""add lat/lng/market_date to orders, birth_year_enc to users

Revision ID: d4e5f6a7b891
Revises: c9f2e3a1b456
Create Date: 2026-05-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4e5f6a7b891"
down_revision: Union[str, None] = "c9f2e3a1b456"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("market_date", sa.Date(), nullable=True))
    op.add_column("orders", sa.Column("lat", sa.Float(), nullable=True))
    op.add_column("orders", sa.Column("lng", sa.Float(), nullable=True))
    op.create_index("ix_orders_market_date", "orders", ["market_date"])

    op.add_column("users", sa.Column("birth_year_enc", sa.String(512), nullable=True))


def downgrade() -> None:
    op.drop_index("ix_orders_market_date", table_name="orders")
    op.drop_column("orders", "market_date")
    op.drop_column("orders", "lat")
    op.drop_column("orders", "lng")
    op.drop_column("users", "birth_year_enc")
