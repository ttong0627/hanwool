from __future__ import annotations

import re
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decrypt_field, encrypt_field, hash_phone, hash_phone_legacy
from app.models.order import Order, OrderStatus
from app.models.user import User, UserRole


def normalize_phone(phone: str) -> str:
    return re.sub(r"\D", "", phone or "")


def compute_phone_hash(phone: str) -> str:
    return hash_phone(phone)


def _calc_age(birth_year: int | None) -> int | None:
    if not birth_year:
        return None
    return date.today().year - birth_year


def _order_identity_expr():
    return func.coalesce(Order.customer_phone_hash, cast(Order.customer_id, String))


def _customer_scope(order_agg):
    return or_(
        User.role == UserRole.customer,
        order_agg.c.customer_phone_hash.isnot(None),
    )


def _order_identity_filter(customer: User, customer_id: int):
    return or_(
        Order.customer_phone_hash == customer.phone_hash,
        Order.customer_id == customer_id,
    )


async def upsert_customer(
    db: AsyncSession,
    name: str,
    phone: str,
    dong: str = "경안동",
    address: str = "",
    birth_year: int | None = None,
) -> Optional[User]:
    """Create or update the person record used by order history aggregation."""
    if not phone or not normalize_phone(phone):
        return None

    phone_hash = compute_phone_hash(phone)
    possible_hashes = {phone_hash, hash_phone_legacy(phone)}
    result = await db.execute(select(User).where(User.phone_hash.in_(possible_hashes)))
    matches = list(result.scalars().all())
    existing = next((user for user in matches if user.phone_hash == phone_hash), None)
    existing = existing or next((user for user in matches if user.role == UserRole.customer), None)
    existing = existing or (matches[0] if matches else None)

    if existing:
        if existing.role == UserRole.customer:
            if name:
                existing.name_enc = encrypt_field(name)
            if dong:
                existing.dong = dong
            if address:
                existing.address_enc = encrypt_field(address)
            if birth_year:
                existing.birth_year_enc = encrypt_field(str(birth_year))
            if existing.phone_hash != phone_hash:
                existing.phone_hash = phone_hash
            await db.flush()
        return existing

    customer = User(
        name_enc=encrypt_field(name or ""),
        phone_enc=encrypt_field(phone),
        phone_hash=phone_hash,
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
        "role": c.role,
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


async def _latest_order_for_customer(db: AsyncSession, customer: User) -> Order | None:
    result = await db.execute(
        select(Order)
        .where(_order_identity_filter(customer, customer.id))
        .order_by(Order.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


def _apply_latest_order_snapshot(data: dict, order: Order | None) -> dict:
    if not order:
        return data
    data["name"] = decrypt_field(order.customer_name_enc) if order.customer_name_enc else data["name"]
    data["phone"] = decrypt_field(order.customer_phone_enc) if order.customer_phone_enc else data["phone"]
    data["dong"] = order.dong or data["dong"]
    data["address"] = decrypt_field(order.delivery_address_enc) if order.delivery_address_enc else data["address"]
    return data


def _order_aggregate_subquery():
    return (
        select(
            Order.customer_phone_hash,
            func.count().label("order_count"),
            func.max(Order.created_at).label("last_order_at"),
        )
        .where(Order.customer_phone_hash.isnot(None))
        .group_by(Order.customer_phone_hash)
        .subquery()
    )


async def list_customers(
    db: AsyncSession,
    search: str = "",
    dong: str = "",
    elderly_only: bool = False,
    page: int = 1,
    page_size: int = 30,
) -> dict:
    """List customer identities by normalized phone, not by role-only user id."""
    order_agg = _order_aggregate_subquery()
    base_filter = [User.deleted_at.is_(None), _customer_scope(order_agg)]
    if dong:
        base_filter.append(User.dong == dong)

    total_q = select(func.count()).select_from(
        select(User.id)
        .outerjoin(order_agg, User.phone_hash == order_agg.c.customer_phone_hash)
        .where(*base_filter)
        .subquery()
    )
    total = (await db.execute(total_q)).scalar() or 0

    q = (
        select(User, order_agg.c.order_count, order_agg.c.last_order_at)
        .outerjoin(order_agg, User.phone_hash == order_agg.c.customer_phone_hash)
        .where(*base_filter)
        .order_by(order_agg.c.last_order_at.desc().nullslast(), User.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(q)).all()

    customers = []
    normalized_search = normalize_phone(search)
    for row in rows:
        user = row[0]
        data = _decrypt_customer(user, row[1] or 0, row[2])
        data = _apply_latest_order_snapshot(data, await _latest_order_for_customer(db, user))
        if search:
            phone_hit = normalized_search and normalized_search in normalize_phone(data["phone"])
            name_hit = search in data["name"]
            if not phone_hit and not name_hit:
                continue
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
    result = await db.execute(select(User).where(User.id == customer_id, User.deleted_at.is_(None)))
    customer = result.scalar_one_or_none()
    if not customer:
        return None

    order_filter = _order_identity_filter(customer, customer_id)
    order_total = (await db.execute(
        select(func.count()).select_from(select(Order).where(order_filter).subquery())
    )).scalar() or 0

    order_result = await db.execute(
        select(Order)
        .where(order_filter)
        .order_by(Order.created_at.desc())
        .offset((order_page - 1) * order_page_size)
        .limit(order_page_size)
    )
    orders_raw = order_result.scalars().all()
    driver_ids = sorted({order.driver_id for order in orders_raw if order.driver_id})
    driver_map = {}
    if driver_ids:
        driver_result = await db.execute(select(User).where(User.id.in_(driver_ids)))
        driver_map = {
            driver.id: {
                "driver_name": decrypt_field(driver.name_enc) if driver.name_enc else "",
                "driver_phone": decrypt_field(driver.phone_enc) if driver.phone_enc else "",
            }
            for driver in driver_result.scalars().all()
        }

    delivered_count = (await db.execute(
        select(func.count()).select_from(Order).where(
            order_filter,
            Order.status == OrderStatus.delivered,
        )
    )).scalar() or 0

    this_year_count = (await db.execute(
        select(func.count()).select_from(Order).where(
            order_filter,
            Order.created_at >= datetime(datetime.now(timezone.utc).year, 1, 1),
        )
    )).scalar() or 0

    last_order_at = (await db.execute(select(func.max(Order.created_at)).where(order_filter))).scalar()

    base = _decrypt_customer(customer, order_total, last_order_at)
    latest_order = orders_raw[0] if orders_raw else await _latest_order_for_customer(db, customer)
    base = _apply_latest_order_snapshot(base, latest_order)
    base["delivered_count"] = delivered_count
    base["this_year_count"] = this_year_count
    base["orders"] = [
        {
            "id": order.id,
            "order_no": order.order_no,
            "status": order.status,
            "dong": order.dong,
            "delivery_address": decrypt_field(order.delivery_address_enc),
            "items_desc": order.items_desc,
            "quantity": order.quantity,
            "market_date": str(order.market_date) if order.market_date else None,
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "delivered_at": order.delivered_at.isoformat() if order.delivered_at else None,
            "driver_id": order.driver_id,
            "driver_name": driver_map.get(order.driver_id, {}).get("driver_name"),
            "driver_phone": driver_map.get(order.driver_id, {}).get("driver_phone"),
        }
        for order in orders_raw
    ]
    base["order_total"] = order_total
    base["order_page"] = order_page
    return base


async def customer_stats(db: AsyncSession) -> dict:
    from datetime import timedelta

    now = datetime.now(timezone.utc)
    this_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_30_days = now - timedelta(days=30)
    order_agg = _order_aggregate_subquery()

    scoped_users = (
        select(User.id)
        .outerjoin(order_agg, User.phone_hash == order_agg.c.customer_phone_hash)
        .where(User.deleted_at.is_(None), _customer_scope(order_agg))
        .subquery()
    )

    total = (await db.execute(select(func.count()).select_from(scoped_users))).scalar() or 0
    new_this_month = (await db.execute(
        select(func.count()).where(
            User.id.in_(select(scoped_users.c.id)),
            User.created_at >= this_month_start,
        )
    )).scalar() or 0

    returning = (await db.execute(
        select(func.count()).select_from(
            select(_order_identity_expr().label("customer_key"))
            .where(_order_identity_expr().isnot(None))
            .group_by(_order_identity_expr())
            .having(func.count() >= 2)
            .subquery()
        )
    )).scalar() or 0

    top_result = await db.execute(
        select(Order.customer_phone_hash, func.count().label("cnt"))
        .where(Order.customer_phone_hash.isnot(None))
        .group_by(Order.customer_phone_hash)
        .order_by(func.count().desc())
        .limit(5)
    )
    top_customers = []
    for row in top_result.all():
        user_result = await db.execute(
            select(User).where(User.phone_hash == row.customer_phone_hash, User.deleted_at.is_(None))
        )
        customer = user_result.scalar_one_or_none()
        if customer:
            top_customers.append({
                "id": customer.id,
                "name": decrypt_field(customer.name_enc) if customer.name_enc else "",
                "dong": customer.dong,
                "order_count": row.cnt,
            })

    dong_result = await db.execute(
        select(User.dong, func.count().label("cnt"))
        .where(User.id.in_(select(scoped_users.c.id)))
        .group_by(User.dong)
        .order_by(func.count().desc())
    )
    by_dong = [{"dong": row.dong, "count": row.cnt} for row in dong_result.all()]

    active_count = len((await db.execute(
        select(_order_identity_expr().label("customer_key"))
        .where(_order_identity_expr().isnot(None), Order.created_at >= last_30_days)
        .group_by(_order_identity_expr())
    )).scalars().all())

    current_year = datetime.now(timezone.utc).year
    all_customers = (await db.execute(
        select(User).where(User.id.in_(select(scoped_users.c.id)))
    )).scalars().all()
    elderly_count = 0
    for customer in all_customers:
        if customer.birth_year_enc:
            try:
                birth_year = int(decrypt_field(customer.birth_year_enc))
                if current_year - birth_year >= 65:
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
