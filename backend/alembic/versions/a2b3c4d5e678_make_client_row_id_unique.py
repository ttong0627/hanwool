"""make receiver/client_row_id idempotency key unique

Revision ID: a2b3c4d5e678
Revises: z1a2b3c4d567
Create Date: 2026-09-18
"""
from alembic import op

revision = "a2b3c4d5e678"
down_revision = "z1a2b3c4d567"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_orders_client_row_id", table_name="orders")
    # 과거 경쟁 요청으로 같은 키가 생겼더라도 주문은 보존하고, 후속 행의
    # 멱등키만 비워 유일 인덱스 생성과 향후 중복 방지를 안전하게 진행한다.
    op.execute(
        """
        WITH ranked AS (
            SELECT id, ROW_NUMBER() OVER (
                PARTITION BY receiver_id, client_row_id ORDER BY id
            ) AS row_num
            FROM orders
            WHERE client_row_id IS NOT NULL
        )
        UPDATE orders
        SET client_row_id = NULL
        WHERE id IN (SELECT id FROM ranked WHERE row_num > 1)
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_orders_receiver_client_row_id "
        "ON orders (receiver_id, client_row_id) "
        "WHERE client_row_id IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_index("uq_orders_receiver_client_row_id", table_name="orders")
    op.create_index("ix_orders_client_row_id", "orders", ["client_row_id"])
