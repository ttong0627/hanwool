"""
고객 서비스 — 전화번호 기반 upsert + 배송 이력 집계

설계 원칙:
  - 고객 식별자: phone_hash (SHA-256, 역방향 조회 불가)
  - 주문 접수 시마다 고객 정보 자동 upsert
  - 통계는 ORDER JOIN 서브쿼리 (N+1 없음)
"""
from __future__ import annotations

import hashlib
import re
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decrypt_field, encrypt_field
from app.models.order import Order, OrderStatus
from app.models.user import User, UserRole


def normalize_phone(phone: str) -> str:
    return re.sub(r"\D", "", phone)


def compute_phone_hash(phone: str) -> str:
    return hashlib.sha256(normalize_phone(phone).encode()).hexdigest()


def _calc_age(birth_year: int | None) -> int | None:
    if not birth_year:
        return None
    return date.today().year - birth_year


async def upsert_customer(
    db: AsyncSession,
    name: str,
    phone: str,
    dong: str = "경안동",
    address: str = "",
    birth_year: int | None = None,
) -> Optional[User]:
    """전화번호 기준으로 고객을 생성하거나 정보를 업데이트합니다."""
    if not phone or not normalize_phone(phone):
        return None

    ph = compute_phone_hash(phone)
    result = await db.execute(
        select(User).where(User.phone_hash == ph, User.role == UserRole.customer)
    )
    customer = result.scalar_one_or_none()

    if customer:
        if name:
            customer.name_enc = encrypt_field(name)
        if dong:
            customer.dong = dong
        if address:
            customer.address_enc = encrypt_field(address)
        if birth_year:
            customer.birth_year_enc = encrypt_field(str(birth_year))
    else:
        customer = User(
            name_enc=encrypt_field(name or ""),
            phone_enc=encrypt_field(phone),
            phone_hash=ph,
            role=UserRole.customer,
            dong=dong or "경안동",
            address_enc=encrypt_field(address) if address else None,
            birth_year_enc=encrypt_field(str(birth_year)) if birth_year else None,
            is_active=True,
        )
        db.add(customer)

    await db.flush()
    return customer


def _decrypt_customer(c: User, order_count: int = 0, last_order_at: datetime | None = None) -> dict:
    birth_year: int | None = None
    if c.birth_year_enc:
        try:
            birth_year = int(decrypt_field(c.birth_year_enc))
        except Exception:
            pass

    age = _calc_age(birth_year)
    return {
        "id": c.id,
        "name": decrypt_field(c.name_enc) if c.name_enc else "",
        "phone": decrypt_field(c.phone_enc) if c.phone_enc else "",
        "dong": c.dong,
        "address": decrypt_field(c.address_enc) if c.address_enc else "",
        "birth_year": birth_year,
        "age": age,
        "is_elderly": age >= 65 if age is not None else None,
        "is_active": c.is_active,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "order_count": order_count,
        "last_order_at": last_order_at.isoformat() if last_order_at else None,
    }


async def list_customers(
    db: AsyncSession,
    search: str = "",
    dong: str = "",
    elderly_only: bool = False,
    page: int = 1,
    page_size: int = 30,
) -> dict:
    """고객 목록 + 주문 수·마지막 주문일 집계 (서브쿼리 JOIN)"""
    # 주문 수 / 마지막 주문일 서브쿼리
    order_agg = (
        select(
            Order.customer_id,
            func.count().label("order_count"),
            func.max(Order.created_at).label("last_order_at"),
        )
        .where(Order.customer_id.isnot(None))
        .group_by(Order.customer_id)
        .subquery()
    )

    q = (
        select(User, order_agg.c.order_count, order_agg.c.last_order_at)
        .outerjoin(order_agg, User.id == order_agg.c.customer_id)
        .where(User.role == UserRole.customer, User.deleted_at.is_(None))
    )

    if dong:
        q = q.where(User.dong == dong)

    total_q = select(func.count()).select_from(
        select(User).where(User.role == UserRole.customer, User.deleted_at.is_(None)).subquery()
    )
    total = (await db.execute(total_q)).scalar() or 0

    q = q.order_by(order_agg.c.last_order_at.desc().nullslast(), User.created_at.desc())
    q = q.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(q)).all()

    customers = []
    for row in rows:
        c: User = row[0]
        count: int = row[1] or 0
        last_at: datetime | None = row[2]

        # 클라이언트 사이드 검색 (이름/전화번호 — 복호화 필요)
        data = _decrypt_customer(c, count, last_at)
        if search:
            if search not in data["name"] and search.replace("-", "") not in data["phone"].replace("-", ""):
                continue

        # 65세 필터
        if elderly_only and not data.get("is_elderly"):
            continue

        customers.append(data)

    return {
        "items": customers,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


async def get_customer_detail(
    db: AsyncSession,
    customer_id: int,
    order_page: int = 1,
    order_page_size: int = 20,
) -> dict | None:
    """고객 상세 + 배송 이력 (페이지네이션)"""
    result = await db.execute(
        select(User).where(User.id == customer_id, User.role == UserRole.customer)
    )
    c = result.scalar_one_or_none()
    if not c:
        return None

    # 배송 이력
    order_q = (
        select(Order)
        .where(Order.customer_id == customer_id)
        .order_by(Order.created_at.desc())
    )
    order_total_q = select(func.count()).select_from(
        select(Order).where(Order.customer_id == customer_id).subquery()
    )
    order_total = (await db.execute(order_total_q)).scalar() or 0
    order_result = await db.execute(
        order_q.offset((order_page - 1) * order_page_size).limit(order_page_size)
    )
    orders_raw = order_result.scalars().all()

    delivered_count = (await db.execute(
        select(func.count()).select_from(Order).where(
            Order.customer_id == customer_id,
            Order.status == OrderStatus.delivered,
        )
    )).scalar() or 0

    this_year_count = (await db.execute(
        select(func.count()).select_from(Order).where(
            Order.customer_id == customer_id,
            Order.created_at >= datetime(datetime.now(timezone.utc).year, 1, 1),
        )
    )).scalar() or 0

    last_order_at = (await db.execute(
        select(func.max(Order.created_at)).where(Order.customer_id == customer_id)
    )).scalar()

    base = _decrypt_customer(c, order_total, last_order_at)
    base["delivered_count"] = delivered_count
    base["this_year_count"] = this_year_count
    base["orders"] = [
        {
            "id": o.id,
            "order_no": o.order_no,
            "status": o.status,
            "dong": o.dong,
            "delivery_address": decrypt_field(o.delivery_address_enc),
            "items_desc": o.items_desc,
            "quantity": o.quantity,
            "market_date": str(o.market_date) if o.market_date else None,
            "created_at": o.created_at.isoformat() if o.created_at else None,
            "delivered_at": o.delivered_at.isoformat() if o.delivered_at else None,
        }
        for o in orders_raw
    ]
    base["order_total"] = order_total
    base["order_page"] = order_page

    return base


async def customer_stats(db: AsyncSession) -> dict:
    """Reports 페이지용 고객 통계 집계"""
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    this_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_30_days = now - timedelta(days=30)

    total = (await db.execute(
        select(func.count()).where(User.role == UserRole.customer, User.deleted_at.is_(None))
    )).scalar() or 0

    new_this_month = (await db.execute(
        select(func.count()).where(
            User.role == UserRole.customer,
            User.deleted_at.is_(None),
            User.created_at >= this_month_start,
        )
    )).scalar() or 0

    # 재방문 고객: 2건 이상 주문한 고객 수
    returning = (await db.execute(
        select(func.count()).select_from(
            select(Order.customer_id)
            .where(Order.customer_id.isnot(None))
            .group_by(Order.customer_id)
            .having(func.count() >= 2)
            .subquery()
        )
    )).scalar() or 0

    # 최다 이용 고객 top 5
    top_result = await db.execute(
        select(Order.customer_id, func.count().label("cnt"))
        .where(Order.customer_id.isnot(None))
        .group_by(Order.customer_id)
        .order_by(func.count().desc())
        .limit(5)
    )
    top_customers = []
    for row in top_result.all():
        c_result = await db.execute(select(User).where(User.id == row.customer_id))
        c = c_result.scalar_one_or_none()
        if c:
            top_customers.append({
                "id": c.id,
                "name": decrypt_field(c.name_enc) if c.name_enc else "",
                "dong": c.dong,
                "order_count": row.cnt,
            })

    # 동별 고객 분포
    dong_result = await db.execute(
        select(User.dong, func.count().label("cnt"))
        .where(User.role == UserRole.customer, User.deleted_at.is_(None))
        .group_by(User.dong)
        .order_by(func.count().desc())
    )
    by_dong = [{"dong": r.dong, "count": r.cnt} for r in dong_result.all()]

    # 활성 고객 (최근 30일 이내 주문)
    active_ids = (await db.execute(
        select(Order.customer_id)
        .where(Order.customer_id.isnot(None), Order.created_at >= last_30_days)
        .group_by(Order.customer_id)
    )).scalars().all()
    active_count = len(active_ids)

    # 65세 이상 수혜 대상 (birth_year_enc 기반 — 복호화 없이 birth_year 필드로 계산)
    current_year = datetime.now(timezone.utc).year
    all_customers = (await db.execute(
        select(User).where(User.role == UserRole.customer, User.deleted_at.is_(None))
    )).scalars().all()
    elderly_count = 0
    for c in all_customers:
        if c.birth_year_enc:
            try:
                by = int(decrypt_field(c.birth_year_enc))
                if current_year - by >= 65:
                    elderly_count += 1
            except Exception:
                pass

    return {
        "total": total,
        "new_this_month": new_this_month,
        "returning": returning,
        "returning_rate": round(returning / total * 100) if total else 0,
        "active_30d": active_count,
        "elderly_count": elderly_count,
        "elderly_rate": round(elderly_count / total * 100) if total else 0,
        "top_customers": top_customers,
        "by_dong": by_dong,
    }
