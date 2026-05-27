"""add is_driver to users

Revision ID: h3i4j5k6l789
Revises: g2h3i4j5k678
Create Date: 2026-05-27

"""
from alembic import op
import sqlalchemy as sa

revision = 'h3i4j5k6l789'
down_revision = 'g2h3i4j5k678'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('is_driver', sa.Boolean(), nullable=False, server_default='false'))


def downgrade():
    op.drop_column('users', 'is_driver')
