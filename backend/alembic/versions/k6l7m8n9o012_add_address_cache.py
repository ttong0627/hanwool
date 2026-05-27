"""add address_cache table for Kakao search result caching

Revision ID: k6l7m8n9o012
Revises: j5k6l7m8n901
Create Date: 2026-05-27
"""
from alembic import op
import sqlalchemy as sa

revision = 'k6l7m8n9o012'
down_revision = 'j5k6l7m8n901'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'address_cache',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('road_address', sa.String(), nullable=False, unique=True),
        sa.Column('jibun_address', sa.String(), nullable=True),
        sa.Column('building_name', sa.String(), nullable=True),
        sa.Column('dong_name', sa.String(), nullable=True),
        sa.Column('lat', sa.Float(), nullable=True),
        sa.Column('lng', sa.Float(), nullable=True),
        sa.Column('source', sa.String(), nullable=False, server_default='kakao'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('NOW()')),
    )
    op.create_index('ix_address_cache_road_address', 'address_cache', ['road_address'])
    op.create_index('ix_address_cache_dong_name', 'address_cache', ['dong_name'])


def downgrade() -> None:
    op.drop_index('ix_address_cache_dong_name', table_name='address_cache')
    op.drop_index('ix_address_cache_road_address', table_name='address_cache')
    op.drop_table('address_cache')
