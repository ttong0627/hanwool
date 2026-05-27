"""add pod coords and delay tracking fields

Revision ID: q2r3s4t5u678
Revises: p1q2r3s4t567
Create Date: 2026-05-27
"""
from alembic import op


revision = "q2r3s4t5u678"
down_revision = "p1q2r3s4t567"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS pod_lat double precision")
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS pod_lng double precision")


def downgrade() -> None:
    op.execute("ALTER TABLE orders DROP COLUMN IF EXISTS pod_lat")
    op.execute("ALTER TABLE orders DROP COLUMN IF EXISTS pod_lng")
