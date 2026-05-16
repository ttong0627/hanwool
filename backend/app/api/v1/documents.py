from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import require_receiver_or_above
from app.core.database import get_db
from app.models.order import Order
from app.services.order_service import decrypt_order, get_orders_today
from app.services.pdf_service import (generate_complaint_report_pdf,
                                       generate_delivery_list_pdf,
                                       generate_receipt_pdf)
from app.services.qr_service import generate_labels_pdf

router = APIRouter(prefix="/documents", tags=["문서"])


@router.get("/delivery-list.pdf")
async def download_delivery_list(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_receiver_or_above),
):
    orders = await get_orders_today(db)
    today = date.today().strftime("%Y년 %m월 %d일")
    pdf_bytes = generate_delivery_list_pdf(orders, today)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=delivery_list_{date.today().strftime('%Y%m%d')}.pdf"},
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
        headers={"Content-Disposition": f"attachment; filename=labels_{date.today().strftime('%Y%m%d')}.pdf"},
    )
