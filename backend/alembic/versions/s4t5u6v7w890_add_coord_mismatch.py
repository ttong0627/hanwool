"""add coord_mismatch and coord_distance_m to orders

Revision ID: s4t5u6v7w890
Revises: r3s4t5u6v789
Create Date: 2026-05-30

완료 처리 시 기사 GPS와 배송지 좌표의 거리(coord_distance_m)를 저장하고,
30m 초과 시 coord_mismatch=true로 표시. 강제완료 이력은 order_histories에 기록.
"""
from alembic import op
import sqlalchemy as sa

revision = 's4t5u6v7w890'
down_revision = 'r3s4t5u6v789'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('coord_mismatch', sa.Boolean(), nullable=False,
                                      server_default='false'))
    op.add_column('orders', sa.Column('coord_distance_m', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('orders', 'coord_distance_m')
    op.drop_column('orders', 'coord_mismatch')
