"""add address review fields to orders (담당자 주소 확인 워크플로우)

Revision ID: x9y0z1a2b345
Revises: w8x9y0z1a234
Create Date: 2026-06-13
"""
from alembic import op
import sqlalchemy as sa

revision = "x9y0z1a2b345"
down_revision = "w8x9y0z1a234"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 담당자가 미매칭/저신뢰 주소를 확정한 시각·주체 (NULL = 확인 대기)
    op.add_column(
        "orders",
        sa.Column("address_reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "orders",
        sa.Column("address_reviewed_by_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_orders_address_reviewed_by",
        "orders",
        "users",
        ["address_reviewed_by_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_orders_address_reviewed_by", "orders", type_="foreignkey")
    op.drop_column("orders", "address_reviewed_by_id")
    op.drop_column("orders", "address_reviewed_at")
