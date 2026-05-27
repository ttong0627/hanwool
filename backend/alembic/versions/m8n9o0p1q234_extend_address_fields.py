"""extend address fields: orders full standard keys + address_cache full keys

Revision ID: m8n9o0p1q234
Revises: l7m8n9o0p123
Create Date: 2026-05-27
"""
from alembic import op
import sqlalchemy as sa

revision = 'm8n9o0p1q234'
down_revision = 'l7m8n9o0p123'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── orders: 행안부 표준키 전체 필드 확장 ─────────────────────────────────
    op.add_column('orders', sa.Column('raw_address',            sa.Text(),        nullable=True))
    op.add_column('orders', sa.Column('standard_road_address',  sa.Text(),        nullable=True))
    op.add_column('orders', sa.Column('jibun_address',          sa.Text(),        nullable=True))
    op.add_column('orders', sa.Column('detail_address',         sa.Text(),        nullable=True))
    op.add_column('orders', sa.Column('admin_emd',              sa.String(50),    nullable=True))
    op.add_column('orders', sa.Column('adm_cd',                 sa.String(10),    nullable=True))
    op.add_column('orders', sa.Column('rn_mgt_sn',              sa.String(20),    nullable=True))
    op.add_column('orders', sa.Column('udrt_yn',                sa.String(1),     nullable=True))
    op.add_column('orders', sa.Column('buld_mnnm',              sa.Integer(),     nullable=True))
    op.add_column('orders', sa.Column('buld_slno',              sa.Integer(),     nullable=True))
    op.add_column('orders', sa.Column('address_verified_at',    sa.DateTime(timezone=True), nullable=True))

    # ── address_cache: 행안부 표준키 + 매칭 품질 필드 ────────────────────────
    op.add_column('address_cache', sa.Column('normalized_query', sa.String(500), nullable=True))
    op.add_column('address_cache', sa.Column('adm_cd',           sa.String(10),  nullable=True))
    op.add_column('address_cache', sa.Column('rn_mgt_sn',        sa.String(20),  nullable=True))
    op.add_column('address_cache', sa.Column('bd_mgt_sn',        sa.String(25),  nullable=True))
    op.add_column('address_cache', sa.Column('udrt_yn',          sa.String(1),   nullable=True))
    op.add_column('address_cache', sa.Column('buld_mnnm',        sa.Integer(),   nullable=True))
    op.add_column('address_cache', sa.Column('buld_slno',        sa.Integer(),   nullable=True))
    op.add_column('address_cache', sa.Column('match_status',     sa.String(20),  nullable=True))
    op.add_column('address_cache', sa.Column('match_score',      sa.Float(),     nullable=True))
    op.add_column('address_cache', sa.Column('match_message',    sa.Text(),      nullable=True))
    op.create_index('ix_address_cache_normalized_query', 'address_cache', ['normalized_query'])


def downgrade() -> None:
    op.drop_index('ix_address_cache_normalized_query', table_name='address_cache')
    op.drop_column('address_cache', 'match_message')
    op.drop_column('address_cache', 'match_score')
    op.drop_column('address_cache', 'match_status')
    op.drop_column('address_cache', 'buld_slno')
    op.drop_column('address_cache', 'buld_mnnm')
    op.drop_column('address_cache', 'udrt_yn')
    op.drop_column('address_cache', 'bd_mgt_sn')
    op.drop_column('address_cache', 'rn_mgt_sn')
    op.drop_column('address_cache', 'adm_cd')
    op.drop_column('address_cache', 'normalized_query')
    op.drop_column('orders', 'address_verified_at')
    op.drop_column('orders', 'buld_slno')
    op.drop_column('orders', 'buld_mnnm')
    op.drop_column('orders', 'udrt_yn')
    op.drop_column('orders', 'rn_mgt_sn')
    op.drop_column('orders', 'adm_cd')
    op.drop_column('orders', 'admin_emd')
    op.drop_column('orders', 'detail_address')
    op.drop_column('orders', 'jibun_address')
    op.drop_column('orders', 'standard_road_address')
    op.drop_column('orders', 'raw_address')
