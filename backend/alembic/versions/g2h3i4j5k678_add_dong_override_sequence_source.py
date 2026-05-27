"""add dong_override sequence_source

Revision ID: g2h3i4j5k678
Revises: f1a2b3c4d567
Create Date: 2026-05-27

"""
from alembic import op
import sqlalchemy as sa

revision = 'g2h3i4j5k678'
down_revision = 'f1a2b3c4d567'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('orders', sa.Column('dong_override', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('orders', sa.Column('sequence_source', sa.String(20), nullable=True))
    op.create_index('idx_orders_driver_date_seq', 'orders', ['driver_id', 'market_date', 'sequence'])


def downgrade():
    op.drop_index('idx_orders_driver_date_seq', table_name='orders')
    op.drop_column('orders', 'sequence_source')
    op.drop_column('orders', 'dong_override')
