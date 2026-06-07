"""add extra_photos to orders (멀티 POD 추가 사진)

Revision ID: w8x9y0z1a234
Revises: v7w8x9y0z123
Create Date: 2026-06-07
"""
from alembic import op
import sqlalchemy as sa

revision = "w8x9y0z1a234"
down_revision = "v7w8x9y0z123"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("extra_photos", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("orders", "extra_photos")
