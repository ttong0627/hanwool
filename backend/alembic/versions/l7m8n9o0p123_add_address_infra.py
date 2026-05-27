"""add address infrastructure: resolution_logs, overrides, delivery_zones, dispatch_runs, orders fields

Revision ID: l7m8n9o0p123
Revises: k6l7m8n9o012
Create Date: 2026-05-27
"""
from alembic import op
import sqlalchemy as sa

revision = 'l7m8n9o0p123'
down_revision = 'k6l7m8n9o012'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── orders: 행안부 표준 주소 키 + 매칭 상태 필드 ─────────────────────────
    op.add_column('orders', sa.Column('legal_emd',    sa.String(50),  nullable=True))
    op.add_column('orders', sa.Column('service_dong', sa.String(50),  nullable=True))
    op.add_column('orders', sa.Column('bd_mgt_sn',    sa.String(25),  nullable=True))
    op.add_column('orders', sa.Column('match_status', sa.String(20),  nullable=True))
    op.add_column('orders', sa.Column('match_score',  sa.Float(),     nullable=True))
    op.add_column('orders', sa.Column('coord_source', sa.String(20),  nullable=True))
    op.create_index('ix_orders_legal_emd', 'orders', ['legal_emd'])

    # ── address_cache: 재활용 통계 필드 ──────────────────────────────────────
    op.add_column('address_cache', sa.Column('hit_count',    sa.Integer(), nullable=False, server_default='0'))
    op.add_column('address_cache', sa.Column('last_used_at', sa.DateTime(), nullable=True))

    # ── address_resolution_logs ───────────────────────────────────────────────
    op.create_table(
        'address_resolution_logs',
        sa.Column('id',                   sa.Integer(),     primary_key=True, autoincrement=True),
        sa.Column('order_id',             sa.Integer(),     sa.ForeignKey('orders.id'), nullable=True),
        sa.Column('raw_input',            sa.Text(),        nullable=False),
        sa.Column('matched_road_address', sa.Text(),        nullable=True),
        sa.Column('matched_legal_emd',    sa.String(50),    nullable=True),
        sa.Column('matched_service_dong', sa.String(50),    nullable=True),
        sa.Column('match_source',         sa.String(30),    nullable=True),
        sa.Column('match_status',         sa.String(20),    nullable=False, server_default='not_found'),
        sa.Column('match_score',          sa.Float(),       nullable=True),
        sa.Column('failure_reason',       sa.Text(),        nullable=True),
        sa.Column('is_manual_corrected',  sa.Boolean(),     nullable=False, server_default='false'),
        sa.Column('corrected_by_id',      sa.Integer(),     sa.ForeignKey('users.id'), nullable=True),
        sa.Column('resolved_at',          sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
    )
    op.create_index('ix_resolution_logs_order_id',    'address_resolution_logs', ['order_id'])
    op.create_index('ix_resolution_logs_resolved_at', 'address_resolution_logs', ['resolved_at'])

    # ── address_overrides ─────────────────────────────────────────────────────
    op.create_table(
        'address_overrides',
        sa.Column('id',                   sa.Integer(),    primary_key=True, autoincrement=True),
        sa.Column('raw_pattern',          sa.String(500),  nullable=False, unique=True),
        sa.Column('standard_road_address',sa.Text(),       nullable=True),
        sa.Column('force_service_dong',   sa.String(50),   nullable=True),
        sa.Column('force_lat',            sa.Float(),      nullable=True),
        sa.Column('force_lng',            sa.Float(),      nullable=True),
        sa.Column('memo',                 sa.Text(),       nullable=True),
        sa.Column('created_by_id',        sa.Integer(),    sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at',           sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
    )
    op.create_index('ix_address_overrides_raw_pattern', 'address_overrides', ['raw_pattern'])

    # ── delivery_zones (배송 구역/동 정책) ────────────────────────────────────
    op.create_table(
        'delivery_zones',
        sa.Column('id',                        sa.Integer(),   primary_key=True, autoincrement=True),
        sa.Column('zone_name',                 sa.String(50),  nullable=False, unique=True),
        sa.Column('legal_emd',                 sa.String(50),  nullable=False),
        sa.Column('admin_emd',                 sa.String(50),  nullable=True),
        sa.Column('priority',                  sa.Integer(),   nullable=False, server_default='99'),
        sa.Column('is_active',                 sa.Boolean(),   nullable=False, server_default='true'),
        sa.Column('default_driver_count',      sa.Integer(),   nullable=False, server_default='1'),
        sa.Column('threshold_request_driver',  sa.Integer(),   nullable=False, server_default='40'),
        sa.Column('threshold_split_review',    sa.Integer(),   nullable=False, server_default='60'),
        sa.Column('created_at',                sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
    )
    op.create_index('ix_delivery_zones_zone_name', 'delivery_zones', ['zone_name'])

    # 초기 4개 배송 동 데이터 삽입
    op.execute("""
        INSERT INTO delivery_zones (zone_name, legal_emd, priority, is_active, default_driver_count, threshold_request_driver, threshold_split_review)
        VALUES
            ('경안동', '경안동', 1, true, 1, 40, 60),
            ('송정동', '송정동', 2, true, 1, 40, 60),
            ('쌍령동', '쌍령동', 3, true, 1, 40, 60),
            ('탄벌동', '탄벌동', 4, true, 1, 40, 60)
    """)

    # ── dispatch_runs ─────────────────────────────────────────────────────────
    op.create_table(
        'dispatch_runs',
        sa.Column('id',              sa.Integer(),   primary_key=True, autoincrement=True),
        sa.Column('market_date',     sa.Date(),      nullable=False),
        sa.Column('executed_by_id',  sa.Integer(),   sa.ForeignKey('users.id'), nullable=True),
        sa.Column('driver_count',    sa.Integer(),   nullable=False, server_default='0'),
        sa.Column('order_count',     sa.Integer(),   nullable=False, server_default='0'),
        sa.Column('is_auto',         sa.Boolean(),   nullable=False, server_default='true'),
        sa.Column('split_applied',   sa.Boolean(),   nullable=False, server_default='false'),
        sa.Column('notes',           sa.Text(),      nullable=True),
        sa.Column('status',          sa.String(20),  nullable=False, server_default='draft'),
        sa.Column('executed_at',     sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
    )
    op.create_index('ix_dispatch_runs_market_date', 'dispatch_runs', ['market_date'])

    # ── dispatch_run_items ────────────────────────────────────────────────────
    op.create_table(
        'dispatch_run_items',
        sa.Column('id',               sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('dispatch_run_id',  sa.Integer(), sa.ForeignKey('dispatch_runs.id'), nullable=False),
        sa.Column('order_id',         sa.Integer(), sa.ForeignKey('orders.id'), nullable=False),
        sa.Column('driver_id',        sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('sequence',         sa.Integer(), nullable=True),
        sa.Column('service_dong',     sa.String(50), nullable=True),
        sa.Column('lat',              sa.Float(),   nullable=True),
        sa.Column('lng',              sa.Float(),   nullable=True),
        sa.Column('sequence_source',  sa.String(20), nullable=True),
    )
    op.create_index('ix_dispatch_run_items_run_id',   'dispatch_run_items', ['dispatch_run_id'])
    op.create_index('ix_dispatch_run_items_order_id', 'dispatch_run_items', ['order_id'])


def downgrade() -> None:
    op.drop_table('dispatch_run_items')
    op.drop_table('dispatch_runs')
    op.drop_table('delivery_zones')
    op.drop_table('address_overrides')
    op.drop_table('address_resolution_logs')
    op.drop_column('address_cache', 'last_used_at')
    op.drop_column('address_cache', 'hit_count')
    op.drop_index('ix_orders_legal_emd', table_name='orders')
    op.drop_column('orders', 'coord_source')
    op.drop_column('orders', 'match_score')
    op.drop_column('orders', 'match_status')
    op.drop_column('orders', 'bd_mgt_sn')
    op.drop_column('orders', 'service_dong')
    op.drop_column('orders', 'legal_emd')
