"""배송동 우선순위 단일 진실 공급원 (delivery_zones DB)

배차(dispatch_service)와 경로 최적화(route_service)는 순수 sync 함수로 유지하고,
async 호출부에서 이 헬퍼로 priority dict를 로드해 주입한다.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.delivery_zone import DeliveryZone


async def load_zone_priority(db: AsyncSession) -> dict[str, int]:
    """활성 배송동의 zone_name -> priority 매핑을 반환한다.

    priority가 낮을수록 배송 동선 앞쪽(경안시장 거점 기준).
    비활성 동은 제외되며, 매핑에 없는 동은 호출 측에서 기본값으로 폴백한다.
    """
    rows = (
        await db.execute(
            select(DeliveryZone.zone_name, DeliveryZone.priority)
            .where(DeliveryZone.is_active.is_(True))
            .order_by(DeliveryZone.priority)
        )
    ).all()
    return {name: priority for name, priority in rows}
