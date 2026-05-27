"""create nexus_address schema for Gwangju address DB

Revision ID: i4j5k6l7m890
Revises: h3i4j5k6l789
Create Date: 2026-05-27
"""
from alembic import op

revision = 'i4j5k6l7m890'
down_revision = 'h3i4j5k6l789'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("CREATE SCHEMA IF NOT EXISTS nexus_address")

    op.execute("""
        CREATE TABLE IF NOT EXISTS nexus_address.road_codes (
            road_code  text PRIMARY KEY,
            road_name  text NOT NULL,
            sigungu    text,
            emd        text
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS nexus_address.addresses (
            id               SERIAL PRIMARY KEY,
            road_code        text,
            road_name        text,
            road_address     text NOT NULL DEFAULT '',
            road_key         text NOT NULL DEFAULT '',
            full_key         text NOT NULL DEFAULT '',
            building_name    text,
            legal_emd        text,
            building_main_no integer,
            building_sub_no  integer NOT NULL DEFAULT 0,
            underground_yn   text NOT NULL DEFAULT '0'
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS nexus_address.buildings (
            id               SERIAL PRIMARY KEY,
            building_mgt_no  text UNIQUE,
            road_code        text,
            road_name        text,
            road_address     text NOT NULL DEFAULT '',
            road_key         text NOT NULL DEFAULT '',
            full_key         text NOT NULL DEFAULT '',
            building_name    text,
            building_name_key text NOT NULL DEFAULT '',
            legal_emd        text,
            building_main_no integer,
            building_sub_no  integer NOT NULL DEFAULT 0,
            zip_no           text,
            is_apartment     boolean NOT NULL DEFAULT false
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS addresses_road_key_trgm
        ON nexus_address.addresses USING GIN (road_key gin_trgm_ops)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS addresses_full_key_trgm
        ON nexus_address.addresses USING GIN (full_key gin_trgm_ops)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS addresses_road_code_main
        ON nexus_address.addresses (road_code, building_main_no, building_sub_no)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS buildings_road_key_trgm
        ON nexus_address.buildings USING GIN (road_key gin_trgm_ops)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS buildings_name_key_trgm
        ON nexus_address.buildings USING GIN (building_name_key gin_trgm_ops)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS buildings_full_key_trgm
        ON nexus_address.buildings USING GIN (full_key gin_trgm_ops)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS buildings_road_code_main
        ON nexus_address.buildings (road_code, building_main_no, building_sub_no)
    """)


def downgrade() -> None:
    op.execute("DROP SCHEMA IF EXISTS nexus_address CASCADE")
