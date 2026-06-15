"""nexus_address.buildings 좌표 일괄 수집 (Kakao 지오코딩 → DB 저장)

백엔드 컨테이너에서 실행한다 (KAKAO_REST_API_KEY·DB 접근 필요):
  python scripts/geocode_buildings.py            # 배송 18개 서비스동만 (기본)
  python scripts/geocode_buildings.py --all      # 광주 26개 법정동 전체
  python scripts/geocode_buildings.py --rate 12  # 초당 호출수(기본 8)

특징:
- geocoded_at IS NULL 인 건물만 처리 → 중단되어도 재실행하면 이어서 진행(재개 가능)
- 성공: lat/lng + coord_source='kakao', 실패: coord_source='failed' (둘 다 geocoded_at 기록 → 무한 재시도 방지)
- 진행 로그를 stdout으로 출력
"""
import argparse
import asyncio
import os
import sys
import time

# 스크립트 직접 실행(python scripts/geocode_buildings.py) 시에도 app 패키지 import 가능하도록
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import bindparam, text

from app.core.database import AsyncSessionLocal
from app.services.address_resolver import SERVICE_DONGS
from app.services.route_service import get_kakao_coordinates


async def fetch_pending(db, dongs):
    stmt = text(
        "SELECT id, road_address FROM nexus_address.buildings "
        "WHERE geocoded_at IS NULL "
        "  AND normalize(legal_emd, NFC) IN :dongs "
        "  AND road_address IS NOT NULL AND road_address <> '' "
        "ORDER BY id"
    ).bindparams(bindparam("dongs", expanding=True))
    rows = (await db.execute(stmt, {"dongs": dongs})).all()
    return [(r[0], r[1]) for r in rows]


async def main() -> int:
    parser = argparse.ArgumentParser(description="건물 좌표 Kakao 일괄 수집")
    parser.add_argument("--all", action="store_true", help="광주 26개 법정동 전체 (기본: 배송 18개동)")
    parser.add_argument("--concurrency", type=int, default=4, help="동시 지오코딩 수 (기본 4, Kakao QPS 보호)")
    parser.add_argument("--limit", type=int, default=0, help="이번 실행 최대 처리건수 (0=무제한)")
    args = parser.parse_args()

    async with AsyncSessionLocal() as db:
        if args.all:
            rows = (await db.execute(
                text("SELECT DISTINCT normalize(legal_emd, NFC) FROM nexus_address.buildings")
            )).all()
            dongs = sorted({r[0] for r in rows if r[0]})
        else:
            dongs = sorted(SERVICE_DONGS)
        pending = await fetch_pending(db, dongs)

    total = len(pending)
    if args.limit:
        pending = pending[: args.limit]
    print(f"[start] 대상동={len(dongs)} 미좌표건물={total} 이번처리={len(pending)} "
          f"동시={args.concurrency}", flush=True)
    if not pending:
        print("[done] 처리할 건물이 없습니다 (이미 모두 지오코딩됨).", flush=True)
        return 0

    sem = asyncio.Semaphore(max(args.concurrency, 1))

    async def geocode_one(road):
        async with sem:
            try:
                k = await get_kakao_coordinates(road)
                if k:
                    return k.get("lat"), k.get("lng")
            except Exception:
                pass
            return None, None

    done = ok = fail = 0
    t0 = time.time()
    CHUNK = 300
    async with AsyncSessionLocal() as db:
        for i in range(0, len(pending), CHUNK):
            chunk = pending[i:i + CHUNK]
            coords = await asyncio.gather(*(geocode_one(road) for _bid, road in chunk))
            for (bid, _road), (lat, lng) in zip(chunk, coords):
                await db.execute(
                    text(
                        "UPDATE nexus_address.buildings "
                        "SET lat=:lat, lng=:lng, coord_source=:src, geocoded_at=NOW() WHERE id=:id"
                    ),
                    {"lat": lat, "lng": lng, "src": "kakao" if lat else "failed", "id": bid},
                )
                done += 1
                if lat:
                    ok += 1
                else:
                    fail += 1
            await db.commit()
            rate = done / max(time.time() - t0, 0.001)
            eta = (len(pending) - done) / max(rate, 0.001)
            print(f"[progress] {done}/{len(pending)} ok={ok} fail={fail} "
                  f"{rate:.1f}/s ETA={eta/60:.1f}분", flush=True)

    print(f"[done] 처리={done} 성공={ok} 실패={fail} 소요={ (time.time()-t0)/60:.1f}분", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
