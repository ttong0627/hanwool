from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import Integer, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import require_admin, require_super_admin
from app.core.database import get_db
from app.models.complaint import Complaint
from app.models.order import Order, OrderStatus
from app.models.user import User
from app.services.privacy_service import destroy_personal_data
from app.utils.market_day import market_day_status

router = APIRouter(prefix="/admin", tags=["관리자"])


@router.get("/market-status")
async def get_market_status(_: User = Depends(require_admin)):
    """장날·접수 시간 현황 (프론트 Dashboard 용)"""
    return market_day_status()


@router.get("/dashboard")
async def get_dashboard(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    today_start = datetime.combine(date.today(), datetime.min.time())

    total_today = (await db.execute(
        select(func.count()).select_from(Order).where(Order.created_at >= today_start)
    )).scalar()

    delivered_today = (await db.execute(
        select(func.count()).select_from(Order).where(
            Order.created_at >= today_start, Order.status == OrderStatus.delivered
        )
    )).scalar()

    in_progress = (await db.execute(
        select(func.count()).select_from(Order).where(
            Order.status.in_([OrderStatus.assigned, OrderStatus.picked_up, OrderStatus.in_transit])
        )
    )).scalar()

    pending = (await db.execute(
        select(func.count()).select_from(Order).where(Order.status == OrderStatus.pending)
    )).scalar()

    open_complaints = (await db.execute(
        select(func.count()).select_from(Complaint).where(Complaint.status.in_(["received", "processing"]))
    )).scalar()

    return {
        "today": date.today().isoformat(),
        "total_orders_today": total_today,
        "delivered_today": delivered_today,
        "in_progress": in_progress,
        "pending": pending,
        "open_complaints": open_complaints,
    }


@router.get("/stats/daily")
async def daily_stats(days: int = 30, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(
            func.date(Order.created_at).label("day"),
            func.count().label("total"),
            func.sum(cast(Order.status == OrderStatus.delivered, Integer)).label("delivered"),
        )
        .where(Order.created_at >= since)
        .group_by(func.date(Order.created_at))
        .order_by(func.date(Order.created_at))
    )
    return [{"day": str(row.day), "total": row.total, "delivered": row.delivered or 0} for row in result]


@router.get("/stats/by-dong")
async def stats_by_dong(db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    result = await db.execute(
        select(Order.dong, func.count().label("total"))
        .group_by(Order.dong)
        .order_by(func.count().desc())
    )
    return [{"dong": row.dong, "total": row.total} for row in result]


@router.get("/stats/drivers")
async def driver_stats(db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    today_start = datetime.combine(date.today(), datetime.min.time())
    result = await db.execute(
        select(
            Order.driver_id,
            func.count().label("total"),
            func.sum(cast(Order.status == OrderStatus.delivered, Integer)).label("delivered"),
        )
        .where(Order.created_at >= today_start, Order.driver_id != None)
        .group_by(Order.driver_id)
    )
    return [{"driver_id": row.driver_id, "total": row.total, "delivered": row.delivered or 0} for row in result]


@router.get("/stats/drivers/period")
async def driver_stats_period(days: int = 30, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    """기간별 기사 누적 배송 통계"""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(
            Order.driver_id,
            func.count().label("total"),
            func.sum(cast(Order.status == OrderStatus.delivered, Integer)).label("delivered"),
        )
        .where(Order.created_at >= since, Order.driver_id != None)
        .group_by(Order.driver_id)
        .order_by(func.count().desc())
    )
    return [{"driver_id": row.driver_id, "total": row.total, "delivered": row.delivered or 0} for row in result]


@router.get("/stats/by-dong/period")
async def stats_by_dong_period(days: int = 30, db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    """기간별 동 통계"""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(Order.dong, func.count().label("total"))
        .where(Order.created_at >= since)
        .group_by(Order.dong)
        .order_by(func.count().desc())
    )
    return [{"dong": row.dong, "total": row.total} for row in result]


@router.get("/stats/by-market-date")
async def stats_by_market_date(
    limit: int = 12,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_admin),
):
    """장날별 통계 (최근 limit 회 장날)"""
    result = await db.execute(
        select(
            Order.market_date,
            func.count().label("total"),
            func.sum(cast(Order.status == OrderStatus.delivered, Integer)).label("delivered"),
            func.count(Order.driver_id.distinct()).label("driver_count"),
        )
        .where(Order.market_date.isnot(None))
        .group_by(Order.market_date)
        .order_by(Order.market_date.desc())
        .limit(limit)
    )
    rows = result.all()
    return [
        {
            "market_date": str(row.market_date),
            "total": row.total,
            "delivered": row.delivered or 0,
            "delivery_rate": round((row.delivered or 0) / row.total * 100) if row.total else 0,
            "driver_count": row.driver_count,
        }
        for row in rows
    ]


@router.post("/privacy/destroy")
async def destroy_privacy(db: AsyncSession = Depends(get_db), current_user: User = Depends(require_super_admin)):
    result = await destroy_personal_data(db, current_user.id)
    return result
