"""add nexus_address.jibun_addresses and admin_dong_map tables

Revision ID: j5k6l7m8n901
Revises: i4j5k6l7m890
Create Date: 2026-05-27
"""
from alembic import op

revision = 'j5k6l7m8n901'
down_revision = 'i4j5k6l7m890'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 지번 주소 → 법정동 테이블
    op.execute("""
        CREATE TABLE IF NOT EXISTS nexus_address.jibun_addresses (
            id             SERIAL PRIMARY KEY,
            legal_emd      TEXT NOT NULL,
            jibun_san_yn   TEXT NOT NULL DEFAULT '0',
            jibun_main_no  INTEGER NOT NULL,
            jibun_sub_no   INTEGER NOT NULL DEFAULT 0,
            road_address   TEXT,
            UNIQUE (legal_emd, jibun_san_yn, jibun_main_no, jibun_sub_no)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS jibun_addresses_main_lookup
        ON nexus_address.jibun_addresses (legal_emd, jibun_main_no)
    """)

    # 행정동 → 법정동 매핑 테이블
    op.execute("""
        CREATE TABLE IF NOT EXISTS nexus_address.admin_dong_map (
            admin_emd  TEXT PRIMARY KEY,
            legal_emd  TEXT NOT NULL
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS nexus_address.admin_dong_map")
    op.execute("DROP TABLE IF EXISTS nexus_address.jibun_addresses")
