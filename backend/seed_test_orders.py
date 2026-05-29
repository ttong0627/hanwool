"""
테스트 주문 명단 N건 생성 스크립트 (기본 15건)
실행(서버 컨테이너 안):
    python seed_test_orders.py

- 정상 접수 흐름(create_order)으로 생성하여 주소 검증·좌표·배송동이 채워짐
- 생성된 주문과 고객은 모두 is_test=True 로 표시됨
- 삭제: 웹 super_admin → 개인정보 관리 → 테스트 데이터 초기화
        또는 DELETE /api/v1/admin/clear-test-data
- 전화번호는 가짜이며, TEST_SMS_REDIRECT_PHONE 설정 시 문자는 테스트 번호로만 발송됨
"""
import asyncio

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.order import Order
from app.models.user import User, UserRole
from app.schemas.order import OrderCreate
from app.services.order_service import create_order

# 경기도 광주시 4개 배송 가능 동의 테스트 주소 15건
TEST_ORDERS = [
    ("김순자", "010-1000-0001", "경안동", "경기도 광주시 경안로 11", "채소, 두부", 2, "문 앞에 놓아주세요"),
    ("박영수", "010-1000-0002", "경안동", "경기도 광주시 경안로 25", "쌀 10kg", 1, "경비실 맡김"),
    ("이말순", "010-1000-0003", "경안동", "경기도 광주시 광주대로 60", "생선, 계란", 3, ""),
    ("최복동", "010-1000-0004", "송정동", "경기도 광주시 회안대로 120", "과일 한 상자", 1, "오후 배송 희망"),
    ("정금자", "010-1000-0005", "송정동", "경기도 광주시 회안대로 88", "고추장, 된장", 2, ""),
    ("한갑수", "010-1000-0006", "송정동", "경기도 광주시 광주대로 200", "채소류", 2, "천천히 와도 됩니다"),
    ("오정희", "010-1000-0007", "쌍령동", "경기도 광주시 경충대로 1450", "쌀 20kg, 김치", 2, "무거우니 조심"),
    ("강병철", "010-1000-0008", "쌍령동", "경기도 광주시 경충대로 1500", "생필품", 3, ""),
    ("윤춘자", "010-1000-0009", "쌍령동", "경기도 광주시 회안대로 350", "과일, 채소", 2, "벨 눌러주세요"),
    ("임덕수", "010-1000-0010", "탄벌동", "경기도 광주시 탄벌로 30", "쌀, 라면", 2, ""),
    ("서옥분", "010-1000-0011", "탄벌동", "경기도 광주시 탄벌로 75", "두부, 콩나물", 1, "문 앞"),
    ("배성호", "010-1000-0012", "탄벌동", "경기도 광주시 광주대로 410", "생선, 채소", 3, ""),
    ("노미경", "010-1000-0013", "경안동", "경기도 광주시 경안로 45", "과일 두 상자", 2, "낮에만 가능"),
    ("황만수", "010-1000-0014", "송정동", "경기도 광주시 회안대로 60", "쌀 10kg, 김", 2, ""),
    ("문순례", "010-1000-0015", "쌍령동", "경기도 광주시 경충대로 1380", "채소, 두부, 계란", 3, "조용히 놓고 가세요"),
]


async def seed_test_orders():
    async with AsyncSessionLocal() as db:
        # 접수자(receiver) 계정 확보 — 없으면 admin/super_admin 사용
        receiver = (await db.execute(
            select(User).where(User.role == UserRole.receiver).limit(1)
        )).scalar_one_or_none()
        if not receiver:
            receiver = (await db.execute(
                select(User).where(User.role.in_([UserRole.admin, UserRole.super_admin])).limit(1)
            )).scalar_one_or_none()
        if not receiver:
            print("접수자/관리자 계정이 없습니다. 먼저 운영 계정을 만드세요.")
            return

        created_ids: list[int] = []
        customer_ids: set[int] = set()

        for name, phone, dong, address, items, qty, notes in TEST_ORDERS:
            data = OrderCreate(
                customer_name=name,
                customer_phone=phone,
                delivery_address=address,
                dong=dong,
                items_desc=items,
                quantity=qty,
                notes=notes,
                pickup_location="경안시장",
            )
            order = await create_order(db, data, receiver_id=receiver.id)
            order.is_test = True
            created_ids.append(order.id)
            if order.customer_id:
                customer_ids.add(order.customer_id)

        # 생성 과정에서 만들어진 고객 계정도 테스트로 표시
        if customer_ids:
            customers = (await db.execute(
                select(User).where(User.id.in_(customer_ids))
            )).scalars().all()
            for c in customers:
                c.is_test = True

        await db.commit()
        print(f"테스트 주문 {len(created_ids)}건 생성 완료 (is_test=True)")
        print(f"테스트 고객 {len(customer_ids)}명 표시 완료")
        print("문자 발송 시 TEST_SMS_REDIRECT_PHONE 번호로만 전송됩니다.")


if __name__ == "__main__":
    asyncio.run(seed_test_orders())
