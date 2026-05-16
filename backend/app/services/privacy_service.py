"""개인정보 폐기 서비스 (계약 종료 시 실행)"""
from datetime import datetime, timezone

from sqlalchemy import text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order
from app.models.complaint import Complaint
from app.models.sms_log import SmsLog


DELETED_PLACEHOLDER = "[DELETED]"


async def destroy_personal_data(db: AsyncSession, confirmed_by: int) -> dict:
    """모든 고객 개인정보 완전 폐기"""
    now = datetime.now(timezone.utc)

    # phone_hash unique 제약 충돌 방지: 행별 고유값 생성 (DELETED_<id>)
    await db.execute(
        text("""
            UPDATE users
            SET
                name_enc     = :placeholder,
                phone_enc    = :placeholder,
                phone_hash   = 'DELETED_' || id::text,
                address_enc  = :placeholder,
                deleted_at   = :now,
                is_active    = false
            WHERE role = 'customer'
        """),
        {"placeholder": DELETED_PLACEHOLDER, "now": now},
    )

    await db.execute(
        update(Order).values(
            customer_name_enc=DELETED_PLACEHOLDER,
            customer_phone_enc=DELETED_PLACEHOLDER,
            delivery_address_enc=DELETED_PLACEHOLDER,
        )
    )

    await db.execute(
        update(Complaint).values(
            customer_name_enc=DELETED_PLACEHOLDER,
            customer_phone_enc=DELETED_PLACEHOLDER,
        )
    )

    await db.execute(
        update(SmsLog).values(phone_enc=DELETED_PLACEHOLDER)
    )

    return {
        "destroyed_at": now.isoformat(),
        "confirmed_by": confirmed_by,
        "message": "모든 고객 개인정보가 폐기되었습니다.",
    }
