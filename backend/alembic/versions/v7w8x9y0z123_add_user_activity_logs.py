"""add user_activity_logs table

Revision ID: v7w8x9y0z123
Revises: u6v7w8x9y012
Create Date: 2026-06-07

사용자 이용현황(로그인 등) 추적용 활동 로그 테이블.
"""
from alembic import op
import sqlalchemy as sa


revision = 'v7w8x9y0z123'
down_revision = 'u6v7w8x9y012'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'user_activity_logs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('action', sa.String(length=40), nullable=False),
        sa.Column('detail', sa.String(length=200), nullable=True),
        sa.Column('ip', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_user_activity_logs_id', 'user_activity_logs', ['id'])
    op.create_index('ix_user_activity_logs_user_id', 'user_activity_logs', ['user_id'])
    op.create_index('ix_user_activity_logs_action', 'user_activity_logs', ['action'])
    op.create_index('ix_user_activity_logs_created_at', 'user_activity_logs', ['created_at'])


def downgrade() -> None:
    op.drop_index('ix_user_activity_logs_created_at', table_name='user_activity_logs')
    op.drop_index('ix_user_activity_logs_action', table_name='user_activity_logs')
    op.drop_index('ix_user_activity_logs_user_id', table_name='user_activity_logs')
    op.drop_index('ix_user_activity_logs_id', table_name='user_activity_logs')
    op.drop_table('user_activity_logs')
