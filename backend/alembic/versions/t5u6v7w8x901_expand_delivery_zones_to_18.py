"""expand delivery_zones from 4 to 18 dongs

Revision ID: t5u6v7w8x901
Revises: s4t5u6v7w890
Create Date: 2026-06-05

접수 허용동을 기존 4개(경안·송정·쌍령·탄벌)에서 광주시 동(洞) 단위 18개로 확장.
신규 14개 동은 priority 5~18로 추가하며, 면/읍 및 능평동·신현동은 제외.
배차 알고리즘(dispatch_service)은 이번 변경 범위에 포함하지 않음.
"""
from alembic import op

revision = 't5u6v7w8x901'
down_revision = 's4t5u6v7w890'
branch_labels = None
depends_on = None


# 신규 추가 14개 동 (zone_name, legal_emd, priority)
NEW_ZONES = [
    ("고산동", "고산동", 5),
    ("매산동", "매산동", 6),
    ("목동", "목동", 7),
    ("목현동", "목현동", 8),
    ("문형동", "문형동", 9),
    ("삼동", "삼동", 10),
    ("양벌동", "양벌동", 11),
    ("역동", "역동", 12),
    ("장지동", "장지동", 13),
    ("중대동", "중대동", 14),
    ("직동", "직동", 15),
    ("추자동", "추자동", 16),
    ("태전동", "태전동", 17),
    ("회덕동", "회덕동", 18),
]


def upgrade() -> None:
    values = ",\n            ".join(
        f"('{z}', '{e}', {p}, true, 1, 40, 60)" for z, e, p in NEW_ZONES
    )
    op.execute(
        f"""
        INSERT INTO delivery_zones
            (zone_name, legal_emd, priority, is_active, default_driver_count,
             threshold_request_driver, threshold_split_review)
        VALUES
            {values}
        ON CONFLICT (zone_name) DO NOTHING
        """
    )
    # 기존 4개 동 priority를 배차 코드 동선(경안→탄벌→송정→쌍령)에 맞춰 보정.
    # (초기 시드는 경안1·송정2·쌍령3·탄벌4였으나 dispatch/route 동선과 불일치)
    op.execute(
        """
        UPDATE delivery_zones SET priority = CASE zone_name
            WHEN '탄벌동' THEN 2
            WHEN '송정동' THEN 3
            WHEN '쌍령동' THEN 4
        END
        WHERE zone_name IN ('탄벌동', '송정동', '쌍령동')
        """
    )


def downgrade() -> None:
    # 동선 보정 원복 (초기 시드 순서: 송정2·쌍령3·탄벌4)
    op.execute(
        """
        UPDATE delivery_zones SET priority = CASE zone_name
            WHEN '송정동' THEN 2
            WHEN '쌍령동' THEN 3
            WHEN '탄벌동' THEN 4
        END
        WHERE zone_name IN ('송정동', '쌍령동', '탄벌동')
        """
    )
    names = ", ".join(f"'{z}'" for z, _, _ in NEW_ZONES)
    op.execute(f"DELETE FROM delivery_zones WHERE zone_name IN ({names})")
