"""add customer phone hash to orders

Revision ID: n9o0p1q2r345
Revises: m8n9o0p1q234
Create Date: 2026-05-27
"""
from alembic import op


revision = "n9o0p1q2r345"
down_revision = "m8n9o0p1q234"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone_hash varchar(64)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_orders_customer_phone_hash "
        "ON orders (customer_phone_hash)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_orders_customer_phone_hash")
    op.execute("ALTER TABLE orders DROP COLUMN IF EXISTS customer_phone_hash")
