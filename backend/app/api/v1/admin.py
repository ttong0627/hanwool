from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Integer, cast, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import require_admin, require_admin_or_above, require_receiver_or_above, require_super_admin
from app.core.database import get_db
from app.models.complaint import Complaint
from app.models.dispatch_request import DispatchRequest, DispatchRequestStatus
from app.models.dispatch_run import DispatchRun, DispatchRunItem
from app.models.order import Order, OrderStatus
from app.models.order_history import OrderHistory
from app.models.address_resolution_log import AddressResolutionLog
from app.models.user import User
from app.api.v1.orders import _dispatch_today_orders
from app.services.customer_service import customer_stats, get_customer_detail, list_customers
from app.services.privacy_service import destroy_personal_data
from app.utils.market_day import market_day_status, today_kst

router = APIRouter(prefix="/admin", tags=["관리자"])


@router.get("/market-status")
async def get_market_status(_: User = Depends(require_admin)):
    """장날·접수 시간 현황 (프론트 Dashboard 용)"""
    return market_day_status()


@router.get("/dashboard")
async def get_dashboard(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    from zoneinfo import ZoneInfo
    from sqlalchemy import and_, or_
    _KST = ZoneInfo("Asia/Seoul")
    today = today_kst()
    today_start_utc = datetime.combine(today, datetime.min.time()).replace(tzinfo=_KST).astimezone(timezone.utc)
    today_end_utc = today_start_utc + timedelta(hours=24)

    # market_date 기준 우선, 없으면 KST created_at 범위
    today_filter = or_(
        Order.market_date == today,
        and_(
            Order.market_date.is_(None),
            Order.created_at >= today_start_utc,
            Order.created_at < today_end_utc,
        ),
    )

    total_today = (await db.execute(
        select(func.count()).select_from(Order).where(today_filter)
    )).scalar()

    delivered_today = (await db.execute(
        select(func.count()).select_from(Order).where(
            today_filter, Order.status == OrderStatus.delivered
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
        "today": today_kst().isoformat(),
        "total_orders_today": total_today,
        "delivered_today": delivered_today,
        "in_progress": in_progress,
        "pending": pending,
        "open_complaints": open_complaints,
    }


@router.get("/dispatch-requests")
async def list_dispatch_requests(
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin_or_above),
):
    from app.core.security import decrypt_field

    q = select(DispatchRequest, User).join(
        User, DispatchRequest.requested_by_driver_id == User.id
    )
    if status_filter:
        q = q.where(DispatchRequest.status == status_filter)
    q = q.order_by(DispatchRequest.created_at.desc()).limit(50)
    result = await db.execute(q)
    items = []
    for request, driver in result.all():
        items.append({
            "id": request.id,
            "request_date": request.request_date.isoformat(),
            "requested_by_driver_id": request.requested_by_driver_id,
            "requested_by_driver_name": decrypt_field(driver.name_enc),
            "requested_by_driver_phone": decrypt_field(driver.phone_enc),
            "total_orders": request.total_orders,
            "pending_orders": request.pending_orders,
            "recommended_driver_count": request.recommended_driver_count,
            "status": request.status,
            "message": request.message,
            "resolved_by_admin_id": request.resolved_by_admin_id,
            "resolved_driver_ids": request.resolved_driver_ids,
            "resolved_at": request.resolved_at.isoformat() if request.resolved_at else None,
            "created_at": request.created_at.isoformat() if request.created_at else None,
        })
    return items


@router.post("/dispatch-requests/{request_id}/resolve")
async def resolve_dispatch_request(
    request_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin_or_above),
):
    driver_ids = body.get("driver_ids", [])
    if not isinstance(driver_ids, list) or not driver_ids:
        raise HTTPException(status_code=400, detail="driver_ids가 필요합니다.")

    result = await db.execute(select(DispatchRequest).where(DispatchRequest.id == request_id))
    request = result.scalar_one_or_none()
    if not request:
        raise HTTPException(status_code=404, detail="배정 요청을 찾을 수 없습니다.")
    if request.status != DispatchRequestStatus.pending:
        raise HTTPException(status_code=400, detail="이미 처리된 배정 요청입니다.")

    dispatch_result = await _dispatch_today_orders(
        db,
        [int(driver_id) for driver_id in driver_ids],
        executed_by_id=current_user.id,
        is_auto=False,
    )
    request.status = DispatchRequestStatus.approved
    request.resolved_by_admin_id = current_user.id
    request.resolved_driver_ids = ",".join(str(driver_id) for driver_id in driver_ids)
    request.resolved_at = datetime.now(timezone.utc)
    await db.flush()
    return {"request_id": request.id, "dispatch": dispatch_result}


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
    today_start = datetime.combine(today_kst(), datetime.min.time())
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


@router.get("/customers/stats")
async def get_customer_stats(db: AsyncSession = Depends(get_db), _=Depends(require_admin)):
    return await customer_stats(db)


@router.get("/customers")
async def list_customers_endpoint(
    search: str = "",
    dong: str = "",
    elderly_only: bool = False,
    page: int = 1,
    page_size: int = 30,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_admin),
):
    return await list_customers(db, search, dong, elderly_only, page, page_size)


@router.get("/customers/{customer_id}")
async def get_customer_detail_endpoint(
    customer_id: int,
    order_page: int = 1,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_admin),
):
    result = await get_customer_detail(db, customer_id, order_page)
    if not result:
        raise HTTPException(status_code=404, detail="고객을 찾을 수 없습니다.")
    return result


@router.delete("/clear-test-data")
async def clear_test_data(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """
    is_test=True 로 표시된 테스트 데이터 전체 삭제 — super_admin 전용.
    삭제 순서: dispatch_run_items → dispatch_runs → order_histories
               → address_resolution_logs → orders → users(is_test)
    운영 데이터(is_test=False)는 절대 건드리지 않음.
    """
    # 테스트 주문 ID 먼저 수집
    test_order_ids_result = await db.execute(
        select(Order.id).where(Order.is_test == True)
    )
    test_order_ids = [row[0] for row in test_order_ids_result.all()]

    # 테스트 유저 ID 수집
    test_user_ids_result = await db.execute(
        select(User.id).where(User.is_test == True)
    )
    test_user_ids = [row[0] for row in test_user_ids_result.all()]

    counts: dict[str, int] = {}

    if test_order_ids:
        r = await db.execute(delete(DispatchRunItem).where(
            DispatchRunItem.order_id.in_(test_order_ids)
        ))
        counts["dispatch_run_items"] = r.rowcount

        r = await db.execute(delete(OrderHistory).where(
            OrderHistory.order_id.in_(test_order_ids)
        ))
        counts["order_histories"] = r.rowcount

        r = await db.execute(delete(AddressResolutionLog).where(
            AddressResolutionLog.order_id.in_(test_order_ids)
        ))
        counts["address_resolution_logs"] = r.rowcount

    # dispatch_runs 중 run_items가 모두 삭제된 것(= 테스트용) 정리
    r = await db.execute(delete(DispatchRun).where(
        ~DispatchRun.id.in_(
            select(DispatchRunItem.dispatch_run_id).distinct()
        )
    ))
    counts["dispatch_runs"] = r.rowcount

    if test_order_ids:
        r = await db.execute(delete(Order).where(Order.is_test == True))
        counts["orders"] = r.rowcount

    if test_user_ids:
        r = await db.execute(delete(User).where(User.is_test == True))
        counts["users"] = r.rowcount

    await db.commit()
    return {
        "message": "테스트 데이터 삭제 완료",
        "deleted": counts,
    }
