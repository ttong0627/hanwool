"""extend address standard keys and cache metadata

Revision ID: m8n9o0p1q234
Revises: l7m8n9o0p123
Create Date: 2026-05-27
"""
from alembic import op

revision = "m8n9o0p1q234"
down_revision = "l7m8n9o0p123"
branch_labels = None
depends_on = None


def upgrade() -> None:
    order_columns = {
        "raw_address": "ALTER TABLE orders ADD COLUMN IF NOT EXISTS raw_address text",
        "standard_road_address": "ALTER TABLE orders ADD COLUMN IF NOT EXISTS standard_road_address text",
        "jibun_address": "ALTER TABLE orders ADD COLUMN IF NOT EXISTS jibun_address text",
        "detail_address": "ALTER TABLE orders ADD COLUMN IF NOT EXISTS detail_address text",
        "admin_emd": "ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_emd varchar(50)",
        "adm_cd": "ALTER TABLE orders ADD COLUMN IF NOT EXISTS adm_cd varchar(10)",
        "rn_mgt_sn": "ALTER TABLE orders ADD COLUMN IF NOT EXISTS rn_mgt_sn varchar(20)",
        "udrt_yn": "ALTER TABLE orders ADD COLUMN IF NOT EXISTS udrt_yn varchar(1)",
        "buld_mnnm": "ALTER TABLE orders ADD COLUMN IF NOT EXISTS buld_mnnm integer",
        "buld_slno": "ALTER TABLE orders ADD COLUMN IF NOT EXISTS buld_slno integer",
        "address_verified_at": "ALTER TABLE orders ADD COLUMN IF NOT EXISTS address_verified_at timestamptz",
    }
    for statement in order_columns.values():
        op.execute(statement)

    cache_columns = {
        "normalized_query": "ALTER TABLE address_cache ADD COLUMN IF NOT EXISTS normalized_query varchar(500)",
        "adm_cd": "ALTER TABLE address_cache ADD COLUMN IF NOT EXISTS adm_cd varchar(10)",
        "rn_mgt_sn": "ALTER TABLE address_cache ADD COLUMN IF NOT EXISTS rn_mgt_sn varchar(20)",
        "bd_mgt_sn": "ALTER TABLE address_cache ADD COLUMN IF NOT EXISTS bd_mgt_sn varchar(25)",
        "udrt_yn": "ALTER TABLE address_cache ADD COLUMN IF NOT EXISTS udrt_yn varchar(1)",
        "buld_mnnm": "ALTER TABLE address_cache ADD COLUMN IF NOT EXISTS buld_mnnm integer",
        "buld_slno": "ALTER TABLE address_cache ADD COLUMN IF NOT EXISTS buld_slno integer",
        "match_status": "ALTER TABLE address_cache ADD COLUMN IF NOT EXISTS match_status varchar(20)",
        "match_score": "ALTER TABLE address_cache ADD COLUMN IF NOT EXISTS match_score double precision",
        "match_message": "ALTER TABLE address_cache ADD COLUMN IF NOT EXISTS match_message text",
    }
    for statement in cache_columns.values():
        op.execute(statement)

    op.execute("CREATE INDEX IF NOT EXISTS ix_orders_adm_cd ON orders (adm_cd)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_orders_rn_mgt_sn ON orders (rn_mgt_sn)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_orders_match_status ON orders (match_status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_address_cache_normalized_query ON address_cache (normalized_query)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_address_cache_bd_mgt_sn ON address_cache (bd_mgt_sn)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_address_cache_bd_mgt_sn")
    op.execute("DROP INDEX IF EXISTS ix_address_cache_normalized_query")
    op.execute("DROP INDEX IF EXISTS ix_orders_match_status")
    op.execute("DROP INDEX IF EXISTS ix_orders_rn_mgt_sn")
    op.execute("DROP INDEX IF EXISTS ix_orders_adm_cd")

    for column in (
        "match_message",
        "match_score",
        "match_status",
        "buld_slno",
        "buld_mnnm",
        "udrt_yn",
        "bd_mgt_sn",
        "rn_mgt_sn",
        "adm_cd",
        "normalized_query",
    ):
        op.execute(f"ALTER TABLE address_cache DROP COLUMN IF EXISTS {column}")

    for column in (
        "address_verified_at",
        "buld_slno",
        "buld_mnnm",
        "udrt_yn",
        "rn_mgt_sn",
        "adm_cd",
        "admin_emd",
        "detail_address",
        "jibun_address",
        "standard_road_address",
        "raw_address",
    ):
        op.execute(f"ALTER TABLE orders DROP COLUMN IF EXISTS {column}")
