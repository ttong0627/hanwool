"""과거 중복 주문 점검 리포트 (읽기 전용)

같은 전화번호 + 같은 날(KST) 에 2건 이상 등록된 주문(취소 제외)을 묶어서 출력한다.
직접입력 자동저장의 오타/영문 수정으로 생긴 중복을 사람이 검토·정리하기 위한 리포트.

백엔드 컨테이너에서 실행 (AES 키·DB 접근 필요):
  python scripts/find_duplicate_orders.py
  python scripts/find_duplicate_orders.py --same-address-only   # 동일주소 중복만
"""
import argparse
import asyncio
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text

from app.core.database import AsyncSessionLocal
from app.core.security import decrypt_field


def mask_phone(p: str) -> str:
    d = "".join(c for c in (p or "") if c.isdigit())
    if len(d) >= 7:
        return f"{d[:3]}-****-{d[-4:]}"
    return p or ""


def norm_addr(a: str) -> str:
    return "".join((a or "").split())


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--same-address-only", action="store_true",
                        help="그룹 내 동일 주소 중복만 출력")
    args = parser.parse_args()

    async with AsyncSessionLocal() as db:
        pairs = (await db.execute(text(
            "SELECT customer_phone_hash, (created_at AT TIME ZONE 'Asia/Seoul')::date AS d, count(*) c "
            "FROM orders "
            "WHERE status <> 'cancelled' AND customer_phone_hash IS NOT NULL "
            "GROUP BY 1, 2 HAVING count(*) > 1 "
            "ORDER BY c DESC, d DESC"
        ))).all()

        if not pairs:
            print("중복 의심 주문이 없습니다 (같은 전화·같은 날 2건 이상, 취소 제외).")
            return 0

        groups_shown = 0
        total_extra = 0
        same_addr_extra = 0

        for ph, d, _c in pairs:
            rows = (await db.execute(text(
                "SELECT order_no, status, dong, match_status, "
                "       to_char(created_at AT TIME ZONE 'Asia/Seoul', 'HH24:MI') AS t, "
                "       customer_name_enc, customer_phone_enc, delivery_address_enc "
                "FROM orders "
                "WHERE customer_phone_hash = :ph "
                "  AND (created_at AT TIME ZONE 'Asia/Seoul')::date = :d "
                "  AND status <> 'cancelled' "
                "ORDER BY order_no"
            ), {"ph": ph, "d": d})).all()

            addrs = [decrypt_field(r[7]) for r in rows]
            norms = [norm_addr(a) for a in addrs]
            cnt = Counter(norms)
            has_same_addr = any(v > 1 for v in cnt.values())

            if args.same_address_only and not has_same_addr:
                continue

            name = decrypt_field(rows[0][5]) if rows else ""
            phone = mask_phone(decrypt_field(rows[0][6])) if rows else ""
            total_extra += len(rows) - 1
            same_addr_extra += sum(v - 1 for v in cnt.values() if v > 1)
            groups_shown += 1

            flag = "  ⚠동일주소중복" if has_same_addr else ""
            print(f"■ {d} | {name} {phone} — {len(rows)}건{flag}")
            for r, a, n in zip(rows, addrs, norms):
                dup = "  ←동일주소" if cnt[n] > 1 else ""
                print(f"   {r[0]} [{r[1]}/{r[3] or '-'}] {r[2] or '-'} | {a}{dup}")
            print()

        print("─" * 50)
        print(f"중복 의심 그룹: {groups_shown}개")
        print(f"정리 후보(그룹당 1건만 남길 때): 약 {total_extra}건")
        print(f"그 중 '동일주소' 명백 중복 후보: 약 {same_addr_extra}건")
        print("\n※ 이 리포트는 읽기 전용입니다. 실제 취소/삭제는 형 확인 후 별도로 진행하세요.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
