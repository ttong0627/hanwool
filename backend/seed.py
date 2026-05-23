"""
테스트용 초기 데이터 생성 스크립트
실행: python seed.py
"""
import asyncio
import os
from app.core.database import AsyncSessionLocal
from app.core.security import hash_password, encrypt_field, hash_phone
from app.models.user import User, UserRole
from app.models.order import Order, OrderStatus
from datetime import date
from sqlalchemy import select


def _required_seed_password(name: str) -> str:
    value = os.getenv(name)
    if not value or len(value) < 8:
        raise RuntimeError(f"{name} must be set to a strong password before running seed.py")
    return value


async def seed():
    if os.getenv("ALLOW_DEMO_SEED", "").lower() != "true":
        print("Demo seed is disabled. Set ALLOW_DEMO_SEED=true only in a safe demo environment.")
        return

    super_admin_password = _required_seed_password("SEED_SUPER_ADMIN_PASSWORD")
    admin_password = _required_seed_password("SEED_ADMIN_PASSWORD")
    receiver_password = _required_seed_password("SEED_RECEIVER_PASSWORD")
    driver_password = _required_seed_password("SEED_DRIVER_PASSWORD")
    customer_password = _required_seed_password("SEED_CUSTOMER_PASSWORD")

    async with AsyncSessionLocal() as db:
        # 이미 데이터 있으면 스킵
        result = await db.execute(select(User).limit(1))
        if result.scalar_one_or_none():
            print("이미 시드 데이터가 있습니다.")
            return

        print("시드 데이터 생성 중...")

        # 최고관리자
        super_admin = User(
            name_enc=encrypt_field("최고관리자"),
            phone_enc=encrypt_field("010-9999-9999"),
            phone_hash=hash_phone("010-9999-9999"),
            role=UserRole.super_admin,
            dong="경안동",
            password_hash=hash_password(super_admin_password),
            is_active=True,
        )

        # 관리자
        admin = User(
            name_enc=encrypt_field("관리자"),
            phone_enc=encrypt_field("010-0000-0000"),
            phone_hash=hash_phone("010-0000-0000"),
            role=UserRole.admin,
            dong="경안동",
            address_enc=encrypt_field("경기도 광주시 경안동 1"),
            password_hash=hash_password(admin_password),
            is_active=True,
        )

        # 접수자
        receiver = User(
            name_enc=encrypt_field("김접수"),
            phone_enc=encrypt_field("010-1111-1111"),
            phone_hash=hash_phone("010-1111-1111"),
            role=UserRole.receiver,
            dong="경안동",
            address_enc=encrypt_field("경기도 광주시 경안동 경안시장"),
            password_hash=hash_password(receiver_password),
            is_active=True,
        )

        # 배송기사
        driver = User(
            name_enc=encrypt_field("이기사"),
            phone_enc=encrypt_field("010-2222-2222"),
            phone_hash=hash_phone("010-2222-2222"),
            role=UserRole.driver,
            dong="경안동",
            address_enc=encrypt_field("경기도 광주시 경안동 2"),
            password_hash=hash_password(driver_password),
            is_active=True,
        )

        # 고객들
        customers = [
            ("박할머니", "010-3333-3333", "경안동", "경기도 광주시 경안동 주민아파트 101동 302호"),
            ("최할아버지", "010-4444-4444", "송정동", "경기도 광주시 송정동 행복마을 5동 201호"),
            ("정순자", "010-5555-5555", "쌍령동", "경기도 광주시 쌍령동 우성아파트 3동 105호"),
            ("한복순", "010-6666-6666", "탄벌동", "경기도 광주시 탄벌동 탄벌마을 12번지"),
            ("오영자", "010-7777-7777", "경안동", "경기도 광주시 경안동 경안빌라 2호"),
        ]

        customer_objects = []
        for name, phone, dong, address in customers:
            c = User(
                name_enc=encrypt_field(name),
                phone_enc=encrypt_field(phone),
                phone_hash=hash_phone(phone),
                role=UserRole.customer,
                dong=dong,
                address_enc=encrypt_field(address),
                password_hash=hash_password(customer_password),
                is_active=True,
            )
            customer_objects.append(c)

        db.add_all([super_admin, admin, receiver, driver] + customer_objects)
        await db.flush()

        print("  Demo users created with passwords from SEED_* environment variables.")
        print(f"  고객 5명 생성 완료")

        # 테스트 주문 3건
        today = date.today().strftime("%Y%m%d")
        orders_data = [
            (customer_objects[0], "채소류, 과일", 3, "경안동", "조심히 배달해 주세요"),
            (customer_objects[1], "쌀 20kg, 된장", 2, "송정동", "1층 경비실에 맡겨주세요"),
            (customer_objects[2], "고등어, 두부, 계란", 4, "쌍령동", ""),
        ]

        for i, (customer, items, qty, dong, notes) in enumerate(orders_data, 1):
            order = Order(
                order_no=f"{today}-{i:04d}",
                customer_id=customer.id,
                customer_name_enc=customer.name_enc,
                customer_phone_enc=customer.phone_enc,
                receiver_id=receiver.id,
                delivery_address_enc=customer.address_enc,
                dong=dong,
                items_desc=items,
                quantity=qty,
                notes=notes,
                request="",
                weight_estimate=f"{qty * 3}kg",
                pickup_location="경안시장 입구",
                sequence=i,
                status=OrderStatus.pending,
            )
            db.add(order)

        await db.commit()
        print(f"  테스트 주문 3건 생성 완료 ({today}-0001 ~ {today}-0003)")
        print("\n시드 완료!")


if __name__ == "__main__":
    asyncio.run(seed())
