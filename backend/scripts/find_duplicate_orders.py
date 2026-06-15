"""과거 중복 주문 점검 리포트 (읽기 전용)

같은 날(KST) 등록된 주문(취소 제외) 중 다음 기준으로 중복 의심을 묶어 출력한다:
  - 전화번호 동일
  - 이름 + 정규화주소 동일 (전화가 오타/영문으로 다르게 들어간 중복까지 포착)
직접입력 자동저장의 오타/영문 수정으로 생긴 중복을 사람이 검토·정리하기 위함.

백엔드 컨테이너에서 실행 (AES 키·DB 접근 필요):
  python scripts/find_duplicate_orders.py
"""
import argparse
import asyncio
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text

from app.core.database import AsyncSessionLocal
from app.core.security import decrypt_field


def mask_phone(p: str) -> str:
    d = "".join(c for c in (p or "") if c.isdigit())
    return f"{d[:3]}-****-{d[-4:]}" if len(d) >= 7 else (p or "")


def norm(s: str) -> str:
    return "".join((s or "").split()).lower()


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--include-cancelled", action="store_true",
                        help="취소된 주문도 포함해 과거 중복까지 스캔")
    args = parser.parse_args()

    where = "" if args.include_cancelled else "WHERE status <> 'cancelled' "
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(text(
            "SELECT order_no, status, dong, match_status, "
            "       (created_at AT TIME ZONE 'Asia/Seoul')::date AS d, "
            "       to_char(created_at AT TIME ZONE 'Asia/Seoul', 'HH24:MI') AS t, "
            "       customer_name_enc, customer_phone_enc, delivery_address_enc, is_test "
            "FROM orders " + where +
            "ORDER BY order_no"
        ))).all()

    scope = "전체(취소 포함)" if args.include_cancelled else "활성(취소 제외)"
    print(f"전체 {scope} 주문: {len(rows)}건")
    if not rows:
        return 0

    recs = []
    for r in rows:
        name = decrypt_field(r[6])
        phone = decrypt_field(r[7])
        addr = decrypt_field(r[8])
        recs.append({
            "order_no": r[0], "status": r[1], "dong": r[2], "match": r[3],
            "date": str(r[4]), "time": r[5], "name": name, "phone": phone,
            "addr": addr, "is_test": r[9],
        })

    by_phone = defaultdict(list)   # (전화digits, 날짜)
    by_name_addr = defaultdict(list)  # (이름, 정규화주소, 날짜)
    for x in recs:
        pd = "".join(c for c in x["phone"] if c.isdigit())
        if pd:
            by_phone[(pd, x["date"])].append(x)
        by_name_addr[(norm(x["name"]), norm(x["addr"]), x["date"])].append(x)

    def dump(title, groups, keyfmt):
        shown = extra = 0
        out = []
        for k, items in groups.items():
            if len(items) < 2:
                continue
            shown += 1
            extra += len(items) - 1
            out.append(f"■ {keyfmt(k, items)} — {len(items)}건")
            for x in sorted(items, key=lambda i: i["order_no"]):
                tflag = " (테스트)" if x["is_test"] else ""
                out.append(f"   {x['order_no']} [{x['status']}/{x['match'] or '-'}] {x['dong'] or '-'} "
                           f"{x['time']} | {x['name']} {mask_phone(x['phone'])} | {x['addr']}{tflag}")
            out.append("")
        print(f"\n=== {title}: 그룹 {shown}개 / 정리후보 약 {extra}건 ===")
        print("\n".join(out) if out else "  (없음)")
        return extra

    e1 = dump("같은 전화·같은 날", by_phone, lambda k, _i: f"{k[1]} | {mask_phone(k[0])}")
    e2 = dump("같은 이름·같은 주소·같은 날 (전화 다른 중복 포함)", by_name_addr,
              lambda k, items: f"{k[2]} | {items[0]['name']} | {items[0]['addr']}")

    print("\n" + "─" * 50)
    print(f"중복 정리 후보: 전화기준 약 {e1}건, 이름+주소기준 약 {e2}건")
    print("※ 읽기 전용 리포트입니다. 실제 취소/삭제는 형 확인 후 진행하세요.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
