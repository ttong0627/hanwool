"""add lat/lng coords to nexus_address.buildings (Kakao 일괄 지오코딩 저장)

Revision ID: y0z1a2b3c456
Revises: x9y0z1a2b345
Create Date: 2026-06-15
"""
from alembic import op

revision = "y0z1a2b3c456"
down_revision = "x9y0z1a2b345"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE nexus_address.buildings ADD COLUMN IF NOT EXISTS lat double precision")
    op.execute("ALTER TABLE nexus_address.buildings ADD COLUMN IF NOT EXISTS lng double precision")
    op.execute("ALTER TABLE nexus_address.buildings ADD COLUMN IF NOT EXISTS coord_source text")
    op.execute("ALTER TABLE nexus_address.buildings ADD COLUMN IF NOT EXISTS geocoded_at timestamptz")
    # 지오코딩 배치/조회용: 법정동 + 미좌표 필터
    op.execute(
        "CREATE INDEX IF NOT EXISTS buildings_legal_emd_idx "
        "ON nexus_address.buildings (legal_emd)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS buildings_pending_geocode_idx "
        "ON nexus_address.buildings (legal_emd) WHERE lat IS NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS nexus_address.buildings_pending_geocode_idx")
    op.execute("DROP INDEX IF EXISTS nexus_address.buildings_legal_emd_idx")
    op.execute("ALTER TABLE nexus_address.buildings DROP COLUMN IF EXISTS geocoded_at")
    op.execute("ALTER TABLE nexus_address.buildings DROP COLUMN IF EXISTS coord_source")
    op.execute("ALTER TABLE nexus_address.buildings DROP COLUMN IF EXISTS lng")
    op.execute("ALTER TABLE nexus_address.buildings DROP COLUMN IF EXISTS lat")
