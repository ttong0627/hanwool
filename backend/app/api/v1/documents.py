from datetime import date as _date, datetime, time as _time, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import require_privacy_owner, require_receiver_or_above
from app.core.database import get_db
from app.core.security import decrypt_field
from app.models.order import Order, OrderStatus
from app.models.user import User
from app.services.order_service import attach_driver_info, decrypt_order, get_orders_today
from app.utils.market_day import today_kst
from app.services.pdf_service import (generate_complaint_report_pdf,
                                       generate_delivery_list_pdf,
                                       generate_delivery_receipts_pdf,
                                       generate_privacy_destruction_pdf,
                                       generate_receipt_pdf)
from app.services.qr_service import generate_labels_pdf

router = APIRouter(prefix="/documents", tags=["문서"])
_KST = ZoneInfo("Asia/Seoul")


@router.get("/delivery-list.pdf")
async def download_delivery_list(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_receiver_or_above),
):
    orders = await get_orders_today(db)
    today = today_kst().strftime("%Y년 %m월 %d일")
    pdf_bytes = generate_delivery_list_pdf(orders, today)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=delivery_list_{today_kst().strftime('%Y%m%d')}.pdf"},
    )


@router.get("/receipt/{order_id}.pdf")
async def download_receipt(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_receiver_or_above),
):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")
    order_dict = decrypt_order(order)
    pdf_bytes = generate_receipt_pdf(order_dict)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=receipt_{order.order_no}.pdf"},
    )


@router.get("/delivery-receipts")
async def list_delivery_receipts(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_receiver_or_above),
):
    q = select(Order).where(Order.status == OrderStatus.delivered)
    # 날짜는 KST 기준 입력 → delivered_at(UTC 저장)과 비교 위해 UTC 경계로 변환
    if date_from:
        d_from = _date.fromisoformat(date_from[:10])
        from_utc = datetime.combine(d_from, _time.min).replace(tzinfo=_KST).astimezone(timezone.utc)
        q = q.where(Order.delivered_at >= from_utc)
    if date_to:
        d_to = _date.fromisoformat(date_to[:10])
        to_utc = datetime.combine(d_to + timedelta(days=1), _time.min).replace(tzinfo=_KST).astimezone(timezone.utc)
        q = q.where(Order.delivered_at < to_utc)
    q = q.order_by(Order.delivered_at.desc().nullslast(), Order.order_no.asc())
    orders = [decrypt_order(order) for order in (await db.execute(q)).scalars().all()]
    orders = await attach_driver_info(db, orders)
    return orders


@router.get("/delivery-receipts.pdf")
async def download_delivery_receipts_pdf(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_receiver_or_above),
):
    orders = await list_delivery_receipts(date_from, date_to, db, _)
    if date_from and date_to and date_from[:10] != date_to[:10]:
        date_label = f"{date_from[:10]} ~ {date_to[:10]}"
    else:
        date_label = (date_from or today_kst().isoformat())[:10]
    pdf_bytes = generate_delivery_receipts_pdf(orders, date_label)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=delivery_receipts_{today_kst().strftime('%Y%m%d')}.pdf"},
    )


@router.get("/complaint/{complaint_id}.pdf")
async def download_complaint_report(
    complaint_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_receiver_or_above),
):
    from app.models.complaint import Complaint
    from app.core.security import decrypt_field
    result = await db.execute(select(Complaint).where(Complaint.id == complaint_id))
    c = result.scalar_one_or_none()
    if not c:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="민원을 찾을 수 없습니다.")
    complaint_dict = {
        "id": c.id,
        "customer_name": decrypt_field(c.customer_name_enc) if c.customer_name_enc else "",
        "customer_phone": decrypt_field(c.customer_phone_enc) if c.customer_phone_enc else "",
        "channel": c.channel,
        "content": c.content,
        "result": c.result or "",
        "created_at": c.created_at.strftime("%Y-%m-%d %H:%M") if c.created_at else "",
        "resolved_at": c.resolved_at.strftime("%Y-%m-%d %H:%M") if c.resolved_at else "",
    }
    pdf_bytes = generate_complaint_report_pdf(complaint_dict)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=complaint_{complaint_id}.pdf"},
    )


@router.get("/labels.pdf")
async def download_labels(
    order_ids: Optional[str] = Query(None, description="쉼표 구분 주문 ID (없으면 오늘 전체)"),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_receiver_or_above),
):
    """QR 라벨 PDF — order_ids 지정 시 선택 출력, 없으면 오늘 전체"""
    if order_ids:
        ids = [int(i.strip()) for i in order_ids.split(",") if i.strip().isdigit()]
        result = await db.execute(select(Order).where(Order.id.in_(ids)).order_by(Order.sequence, Order.created_at))
        orders = [decrypt_order(o) for o in result.scalars().all()]
    else:
        orders = await get_orders_today(db)

    pdf_bytes = generate_labels_pdf(orders)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=labels_{today_kst().strftime('%Y%m%d')}.pdf"},
    )


@router.get("/privacy-destruction.pdf")
async def download_privacy_destruction_pdf(
    destroyed_at: str,
    reason: Optional[str] = Query(None),
    current_user: User = Depends(require_privacy_owner),
):
    """개인정보 폐기 확인서 PDF — 개인정보 전담 최고관리자 전용"""
    name = decrypt_field(current_user.name_enc)
    info = {
        "destroyed_at": destroyed_at,
        "reason": reason or "계약 종료에 따른 개인정보 보호법 제21조 이행",
        "confirmed_by_name": name,
    }
    pdf_bytes = generate_privacy_destruction_pdf(info)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=privacy_destruction_{today_kst().strftime('%Y%m%d')}.pdf"},
    )
