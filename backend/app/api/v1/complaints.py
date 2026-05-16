from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import require_receiver_or_above
from app.core.database import get_db
from app.core.security import decrypt_field, encrypt_field
from app.models.complaint import Complaint
from app.schemas.complaint import ComplaintCreate, ComplaintOut, ComplaintUpdate
from app.services.sms_service import SMS_TEMPLATES

router = APIRouter(prefix="/complaints", tags=["민원"])


def _decrypt_complaint(c: Complaint) -> dict:
    return {
        "id": c.id,
        "order_id": c.order_id,
        "customer_name": decrypt_field(c.customer_name_enc),
        "customer_phone": decrypt_field(c.customer_phone_enc),
        "channel": c.channel,
        "content": c.content,
        "status": c.status,
        "handler_id": c.handler_id,
        "result": c.result,
        "result_channel": c.result_channel,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "resolved_at": c.resolved_at.isoformat() if c.resolved_at else None,
    }


@router.post("/", status_code=201)
async def create_complaint(
    data: ComplaintCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_receiver_or_above),
):
    complaint = Complaint(
        order_id=data.order_id,
        customer_name_enc=encrypt_field(data.customer_name),
        customer_phone_enc=encrypt_field(data.customer_phone),
        channel=data.channel,
        content=data.content,
    )
    db.add(complaint)
    await db.flush()
    result = _decrypt_complaint(complaint)
    # 문자는 기기에서 직접 발송 — 내용과 수신번호를 응답에 포함
    result["sms_to"] = data.customer_phone
    result["sms_message"] = SMS_TEMPLATES["complaint_received"].format(name=data.customer_name)
    return result


@router.get("/")
async def list_complaints(status: Optional[str] = None, db: AsyncSession = Depends(get_db), _=Depends(require_receiver_or_above)):
    q = select(Complaint).order_by(Complaint.created_at.desc())
    if status:
        q = q.where(Complaint.status == status)
    result = await db.execute(q)
    return [_decrypt_complaint(c) for c in result.scalars().all()]


@router.put("/{complaint_id}")
async def update_complaint(
    complaint_id: int,
    data: ComplaintUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_receiver_or_above),
):
    result = await db.execute(select(Complaint).where(Complaint.id == complaint_id))
    complaint = result.scalar_one_or_none()
    if not complaint:
        raise HTTPException(status_code=404, detail="민원을 찾을 수 없습니다.")
    if data.status:
        complaint.status = data.status
    if data.handler_id:
        complaint.handler_id = data.handler_id
    if data.result:
        complaint.result = data.result
    if data.result_channel:
        complaint.result_channel = data.result_channel
    out = _decrypt_complaint(complaint)
    if data.status == "resolved":
        complaint.resolved_at = datetime.utcnow()
        name = decrypt_field(complaint.customer_name_enc)
        phone = decrypt_field(complaint.customer_phone_enc)
        out["sms_to"] = phone
        out["sms_message"] = SMS_TEMPLATES["complaint_resolved"].format(
            name=name, result=data.result or "처리 완료"
        )
    return out
