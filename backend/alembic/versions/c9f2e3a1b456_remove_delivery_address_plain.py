"""remove delivery_address_plain plaintext column

Revision ID: c9f2e3a1b456
Revises: b3c1d4e5f678
Create Date: 2026-05-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c9f2e3a1b456"
down_revision: Union[str, None] = "b3c1d4e5f678"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 기존 평문 주소 데이터를 먼저 삭제 후 컬럼 제거
    op.execute("UPDATE orders SET delivery_address_plain = '' WHERE delivery_address_plain IS NOT NULL")
    op.drop_column("orders", "delivery_address_plain")


def downgrade() -> None:
    op.add_column(
        "orders",
        sa.Column("delivery_address_plain", sa.String(500), nullable=True),
    )
