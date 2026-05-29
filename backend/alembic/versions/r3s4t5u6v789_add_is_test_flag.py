"""add is_test flag to orders and users

Revision ID: r3s4t5u6v789
Revises: q2r3s4t5u678
Create Date: 2026-05-28

테스트 데이터를 운영 데이터와 구분하기 위한 is_test 플래그.
seed.py, 테스트 코드, 개발 시 생성한 데이터에 is_test=True 표시.
super_admin 전용 /api/v1/admin/clear-test-data 로 한 번에 삭제 가능.
"""
from alembic import op
import sqlalchemy as sa

revision = 'r3s4t5u6v789'
down_revision = 'q2r3s4t5u678'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('is_test', sa.Boolean(), nullable=False,
                                      server_default='false'))
    op.add_column('users',  sa.Column('is_test', sa.Boolean(), nullable=False,
                                      server_default='false'))
    op.create_index('ix_orders_is_test', 'orders', ['is_test'])
    op.create_index('ix_users_is_test',  'users',  ['is_test'])


def downgrade() -> None:
    op.drop_index('ix_orders_is_test', table_name='orders')
    op.drop_index('ix_users_is_test',  table_name='users')
    op.drop_column('orders', 'is_test')
    op.drop_column('users',  'is_test')
