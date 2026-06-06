"""add delivery_memo and received_by_security to orders

Revision ID: u6v7w8x9y012
Revises: t5u6v7w8x901
Create Date: 2026-06-06

배송완료 화면 개편 — 기사 메모(delivery_memo)와 경비실 수령(received_by_security) 저장용.
"""
from alembic import op
import sqlalchemy as sa


revision = 'u6v7w8x9y012'
down_revision = 't5u6v7w8x901'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('orders', sa.Column('delivery_memo', sa.Text(), nullable=True))
    op.add_column(
        'orders',
        sa.Column('received_by_security', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade() -> None:
    op.drop_column('orders', 'received_by_security')
    op.drop_column('orders', 'delivery_memo')
