"""add delivery signature path

Revision ID: p1q2r3s4t567
Revises: o0p1q2r3s456
Create Date: 2026-05-27
"""
from alembic import op


revision = "p1q2r3s4t567"
down_revision = "o0p1q2r3s456"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_signature_path varchar(500)")


def downgrade() -> None:
    op.execute("ALTER TABLE orders DROP COLUMN IF EXISTS delivery_signature_path")
