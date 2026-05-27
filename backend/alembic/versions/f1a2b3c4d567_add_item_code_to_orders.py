"""add item_code to orders

Revision ID: f1a2b3c4d567
Revises: e7f8a9b0c123
Create Date: 2026-05-27

"""
from alembic import op
import sqlalchemy as sa

revision = 'f1a2b3c4d567'
down_revision = 'e7f8a9b0c123'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('item_code', sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column('orders', 'item_code')
