"""
경기도 광주시 도로명주소 SQL 생성 스크립트
로컬 nexus-pipeline 데이터 → nexus_address 스키마 SQL 파일 출력

사용법:
  python generate_gwangju_sql.py [--data-dir <경로>] [--out <output.sql>]

기본 data-dir: I:/Projects/nexus-pipeline
"""
import argparse
import re
import sys
import os
import gzip
from collections import Counter
from pathlib import Path
from typing import Iterator, Optional


TARGET_SIDO = "경기도"
TARGET_SIGUNGU = "광주시"

BATCH = 500  # INSERT 배치 크기


def clean_text(value: str) -> str:
    s = str(value or "")
    s = re.sub(r"[\x00-\x1f\x7f\xa0\t\n\r\f\v]", " ", s)
    s = re.sub(r"[\"\'\`“”‘’]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def normalize_key(value: str) -> str:
    if not value:
        return ""
    s = value.strip().lower()
    s = re.sub(r"\([^)]*\)", " ", s)
    s = re.sub(r"[,\[\]{}]", " ", s)
    s = re.sub(r"\s+", "", s)
    return s


def int_or_none(value: str) -> Optional[int]:
    try:
        t = str(value).strip()
        return int(t) if t and t.isdigit() else None
    except Exception:
        return None


def road_address_text(sido, sigungu, legal_eup_myeon, road_name, underground_yn, main_no, sub_no) -> str:
    parts = [p for p in [sido, sigungu] if p]
    if re.search(r"[읍면]$", legal_eup_myeon or ""):
        parts.append(legal_eup_myeon)
    if road_name:
        parts.append(road_name)
    if underground_yn == "1":
        parts.append("지하")
    if main_no is not None:
        parts.append(f"{main_no}-{sub_no}" if sub_no else str(main_no))
    return " ".join(parts)


def is_apartment(name: str) -> bool:
    return bool(re.search(
        r"(아파트|APT|주공|휴먼시아|자이|푸르지오|래미안|e편한|이편한|더샵|힐스테이트|LH|SH|임대)",
        name or "", re.I
    ))


def read_txt(path: Path) -> Iterator[list]:
    """CP949 인코딩 pipe-구분 파일 읽기 → col 리스트 반복"""
    with open(path, "r", encoding="cp949", errors="replace") as f:
        for line in f:
            line = line.rstrip("\n\r")
            if not line.strip():
                continue
            yield line.split("|")


def find_data_file(data_dir: Path, dir_suffix: str, filename: str) -> Path:
    """월 접두어(202604_, 202605_ 등)에 무관하게 데이터 파일을 찾는다.
    행안부 다운로드는 월마다 폴더 접두어가 바뀌므로 접미어로 매칭한다."""
    for sub in sorted(data_dir.glob(f"*{dir_suffix}*")):
        if sub.is_dir():
            cand = sub / filename
            if cand.exists():
                return cand
    # 폴백: 평탄 구조(폴더 없이 파일만 둔 경우)
    flat = data_dir / filename
    if flat.exists():
        return flat
    return data_dir / dir_suffix / filename  # 없으면 기본 경로(호출부가 경고)


def esc(value) -> str:
    """SQL 문자열 이스케이프"""
    if value is None:
        return "NULL"
    s = str(value).replace("'", "''")
    return f"'{s}'"


# ──────────────────────────────────────────────
# 파싱 함수들
# ──────────────────────────────────────────────

def parse_road_codes(data_dir: Path) -> dict:
    """
    개선_도로명코드_전체분.txt 에서 광주시 road_codes 파싱
    col[0]=road_code, col[1]=road_name, col[4]=sido, col[6]=sigungu, col[8]=emd(행정동)
    """
    fpath = find_data_file(data_dir, "주소DB_전체분", "개선_도로명코드_전체분.txt")
    if not fpath.exists():
        print(f"[WARN] road_codes file not found: {fpath}", file=sys.stderr)
        return {}

    codes: dict = {}
    for cols in read_txt(fpath):
        if len(cols) < 9:
            continue
        road_code = clean_text(cols[0])
        road_name = clean_text(cols[1])
        sido = clean_text(cols[4])
        sigungu = clean_text(cols[6])
        emd = clean_text(cols[8])  # 행정 읍면동
        if not road_code or not road_name:
            continue
        if sido == TARGET_SIDO and sigungu == TARGET_SIGUNGU:
            codes[road_code] = {"road_name": road_name, "sigungu": sigungu, "emd": emd}

    print(f"[road_codes] 광주시 {len(codes)}개", file=sys.stderr)
    return codes


def parse_addresses(data_dir: Path, road_codes: dict) -> list:
    """
    jibun_rnaddrkor_gyunggi.txt 에서 광주시 addresses 파싱
    col[0]=addr_mgt_no, col[2]=sido, col[3]=sigungu, col[4]=legal_emd(법정동),
    col[6]=jibun_san_yn, col[7]=jibun_main_no, col[8]=jibun_sub_no,
    col[9]=road_code, col[10]=underground_yn, col[11]=bldg_main_no, col[12]=bldg_sub_no,
    col[13]=building_name
    """
    fpath = find_data_file(data_dir, "도로명주소 한글_전체분", "jibun_rnaddrkor_gyunggi.txt")
    if not fpath.exists():
        print(f"[WARN] addresses file not found: {fpath}", file=sys.stderr)
        return []

    rows = []
    seen = set()
    for cols in read_txt(fpath):
        if len(cols) < 14:
            continue
        sido = clean_text(cols[2])
        sigungu = clean_text(cols[3])
        if sido != TARGET_SIDO or sigungu != TARGET_SIGUNGU:
            continue

        addr_mgt_no = clean_text(cols[0])
        if addr_mgt_no in seen:
            continue
        seen.add(addr_mgt_no)

        road_code = clean_text(cols[9])
        bldg_main_no = int_or_none(cols[11])
        if bldg_main_no is None:
            continue

        bldg_sub_no = int_or_none(cols[12]) or 0
        legal_emd = clean_text(cols[4])
        underground_yn = clean_text(cols[10]) or "0"
        building_name = clean_text(cols[13])

        # 지번 정보
        jibun_san_yn = clean_text(cols[6]) or "0"
        jibun_main_no = int_or_none(cols[7])
        jibun_sub_no = int_or_none(cols[8]) or 0

        # 도로명은 road_codes에서 가져옴
        road_name = road_codes.get(road_code, {}).get("road_name", "")
        road_addr = road_address_text(
            sido, sigungu, "", road_name, underground_yn, bldg_main_no, bldg_sub_no
        )
        road_key = normalize_key(road_addr)
        full_key = normalize_key(f"{road_addr} {building_name} {legal_emd}")

        rows.append({
            "road_code": road_code,
            "road_name": road_name,
            "road_address": road_addr,
            "road_key": road_key,
            "full_key": full_key,
            "building_name": building_name or None,
            "legal_emd": legal_emd or None,
            "building_main_no": bldg_main_no,
            "building_sub_no": bldg_sub_no,
            "underground_yn": underground_yn,
            # 지번 정보 (jibun_addresses 생성용)
            "_jibun_san_yn": jibun_san_yn,
            "_jibun_main_no": jibun_main_no,
            "_jibun_sub_no": jibun_sub_no,
        })

    print(f"[addresses] 광주시 {len(rows)}개", file=sys.stderr)
    return rows


def parse_buildings(data_dir: Path, road_codes: dict) -> list:
    """
    build_gyunggi.txt 에서 광주시 buildings 파싱
    col[1]=sido, col[2]=sigungu, col[3]=legal_emd, col[8]=road_code,
    col[9]=road_name, col[10]=underground_yn, col[11]=main_no, col[12]=sub_no,
    col[15]=building_mgt_no, col[20]=zip_no, col[25]=building_name
    """
    fpath = find_data_file(data_dir, "건물DB_전체분", "build_gyunggi.txt")
    if not fpath.exists():
        print(f"[WARN] buildings file not found: {fpath}", file=sys.stderr)
        return []

    rows = []
    seen = set()
    for cols in read_txt(fpath):
        if len(cols) < 26:
            continue
        sido = clean_text(cols[1])
        sigungu = clean_text(cols[2])
        if sido != TARGET_SIDO or sigungu != TARGET_SIGUNGU:
            continue

        building_mgt_no = clean_text(cols[15])
        if building_mgt_no in seen:
            continue
        seen.add(building_mgt_no)

        road_name = clean_text(cols[9])
        main_no = int_or_none(cols[11])
        if not road_name or main_no is None:
            continue

        sub_no = int_or_none(cols[12]) or 0
        legal_emd = clean_text(cols[3])
        underground_yn = clean_text(cols[10]) or "0"
        zip_no = clean_text(cols[20])
        building_name = clean_text(cols[25])
        road_code = clean_text(cols[8])

        # 건물DB 표준 레이아웃: col[5]=산여부, col[6]=지번본번, col[7]=지번부번
        # → 건물마다 지번이 있으므로 jibun_addresses를 건물 전체에서 완전하게 추출한다.
        jibun_san = clean_text(cols[5])
        jibun_main_no = int_or_none(cols[6])
        jibun_sub_no = int_or_none(cols[7]) or 0

        road_addr = road_address_text(
            sido, sigungu, "", road_name, underground_yn, main_no, sub_no
        )
        road_key = normalize_key(road_addr)
        building_name_key = normalize_key(building_name)
        full_key = normalize_key(f"{road_addr} {building_name} {legal_emd}")

        rows.append({
            "building_mgt_no": building_mgt_no,
            "road_code": road_code,
            "road_name": road_name,
            "road_address": road_addr,
            "road_key": road_key,
            "full_key": full_key,
            "building_name": building_name or None,
            "building_name_key": building_name_key,
            "legal_emd": legal_emd or None,
            "building_main_no": main_no,
            "building_sub_no": sub_no,
            "zip_no": zip_no or None,
            "is_apartment": is_apartment(building_name),
            # 지번 정보 (jibun_addresses 생성용 — 건물 기준 완전 추출)
            "_jibun_san_yn": jibun_san if jibun_san in ("0", "1") else "0",
            "_jibun_main_no": jibun_main_no,
            "_jibun_sub_no": jibun_sub_no,
        })

    print(f"[buildings] 광주시 {len(rows)}개", file=sys.stderr)
    return rows


def build_jibun_rows(addresses: list) -> list:
    """addresses 리스트에서 jibun_addresses 행 추출 (중복 제거)"""
    seen = set()
    rows = []
    for a in addresses:
        legal_emd = a.get("legal_emd")
        jibun_main_no = a.get("_jibun_main_no")
        jibun_sub_no = a.get("_jibun_sub_no", 0)
        jibun_san_yn = a.get("_jibun_san_yn", "0")
        if not legal_emd or jibun_main_no is None:
            continue
        key = (legal_emd, jibun_san_yn, jibun_main_no, jibun_sub_no)
        if key in seen:
            continue
        seen.add(key)
        rows.append({
            "legal_emd": legal_emd,
            "jibun_san_yn": jibun_san_yn,
            "jibun_main_no": jibun_main_no,
            "jibun_sub_no": jibun_sub_no,
            "road_address": a.get("road_address"),
        })
    print(f"[jibun_addresses] {len(rows)}개", file=sys.stderr)
    return rows


def build_admin_dong_map(road_codes: dict, addresses: list) -> dict:
    """
    행정동(road_codes.emd) → 법정동(addresses.legal_emd) 최빈값 매핑
    """
    # road_code → Counter(legal_emd)
    rc_legal: dict[str, Counter] = {}
    for a in addresses:
        rc = a.get("road_code")
        legal = a.get("legal_emd")
        if rc and legal:
            rc_legal.setdefault(rc, Counter())[legal] += 1

    # admin_emd → Counter(legal_emd) (road_code 경유)
    admin_legal: dict[str, Counter] = {}
    for road_code, rc_info in road_codes.items():
        admin_emd = rc_info.get("emd", "")
        if not admin_emd:
            continue
        if road_code in rc_legal:
            best_legal = rc_legal[road_code].most_common(1)[0][0]
            admin_legal.setdefault(admin_emd, Counter())[best_legal] += 1

    # 최종 매핑
    result = {
        admin: counter.most_common(1)[0][0]
        for admin, counter in admin_legal.items()
    }
    print(f"[admin_dong_map] 행정동→법정동 {len(result)}쌍", file=sys.stderr)
    return result


def _inspect_columns(data_dir: Path) -> None:
    """적재 전 컬럼 인덱스 검증용 — 건물/주소 파일의 광주시 첫 2행을 인덱스와 함께 출력.
    건물DB에서 col[5]=산여부, col[6]=지번본번, col[7]=지번부번 인지 눈으로 확인한 뒤 본 적재를 실행한다."""
    targets = [
        ("건물DB", find_data_file(data_dir, "건물DB_전체분", "build_gyunggi.txt")),
        ("도로명주소", find_data_file(data_dir, "도로명주소 한글_전체분", "jibun_rnaddrkor_gyunggi.txt")),
    ]
    for label, fpath in targets:
        print(f"\n===== {label}: {fpath} =====", file=sys.stderr)
        if not fpath.exists():
            print("  [파일 없음 — 경로/파일명 확인]", file=sys.stderr)
            continue
        shown = 0
        for cols in read_txt(fpath):
            if "광주시" not in "|".join(cols):
                continue
            for i, c in enumerate(cols):
                print(f"  [{i:>2}] {c}", file=sys.stderr)
            print("  " + "-" * 40, file=sys.stderr)
            shown += 1
            if shown >= 2:
                break


# ──────────────────────────────────────────────
# SQL 출력 함수들
# ──────────────────────────────────────────────

def write_road_codes(out, road_codes: dict):
    items = list(road_codes.items())
    for i in range(0, len(items), BATCH):
        batch = items[i : i + BATCH]
        vals = ", ".join(
            f"({esc(code)}, {esc(info['road_name'])}, {esc(info['sigungu'])}, {esc(info['emd'])})"
            for code, info in batch
        )
        out.write(
            f"INSERT INTO nexus_address.road_codes (road_code, road_name, sigungu, emd) "
            f"VALUES {vals} "
            f"ON CONFLICT (road_code) DO UPDATE SET road_name = EXCLUDED.road_name;\n"
        )


def write_addresses(out, rows: list):
    for i in range(0, len(rows), BATCH):
        batch = rows[i : i + BATCH]
        vals = ", ".join(
            f"({esc(r['road_code'])}, {esc(r['road_name'])}, {esc(r['road_address'])}, "
            f"{esc(r['road_key'])}, {esc(r['full_key'])}, {esc(r['building_name'])}, "
            f"{esc(r['legal_emd'])}, "
            f"{'NULL' if r['building_main_no'] is None else r['building_main_no']}, "
            f"{r['building_sub_no']}, {esc(r['underground_yn'])})"
            for r in batch
        )
        out.write(
            f"INSERT INTO nexus_address.addresses "
            f"(road_code, road_name, road_address, road_key, full_key, building_name, "
            f"legal_emd, building_main_no, building_sub_no, underground_yn) "
            f"VALUES {vals};\n"
        )


def write_buildings(out, rows: list):
    for i in range(0, len(rows), BATCH):
        batch = rows[i : i + BATCH]
        vals = ", ".join(
            f"({esc(r['building_mgt_no'])}, {esc(r['road_code'])}, {esc(r['road_name'])}, "
            f"{esc(r['road_address'])}, {esc(r['road_key'])}, {esc(r['full_key'])}, "
            f"{esc(r['building_name'])}, {esc(r['building_name_key'])}, {esc(r['legal_emd'])}, "
            f"{'NULL' if r['building_main_no'] is None else r['building_main_no']}, "
            f"{r['building_sub_no']}, {esc(r['zip_no'])}, "
            f"{'true' if r['is_apartment'] else 'false'})"
            for r in batch
        )
        out.write(
            f"INSERT INTO nexus_address.buildings "
            f"(building_mgt_no, road_code, road_name, road_address, road_key, full_key, "
            f"building_name, building_name_key, legal_emd, building_main_no, building_sub_no, "
            f"zip_no, is_apartment) "
            f"VALUES {vals} "
            f"ON CONFLICT (building_mgt_no) DO UPDATE SET "
            f"road_address = EXCLUDED.road_address, road_key = EXCLUDED.road_key, "
            f"full_key = EXCLUDED.full_key, building_name_key = EXCLUDED.building_name_key;\n"
        )


def write_jibun_addresses(out, rows: list):
    for i in range(0, len(rows), BATCH):
        batch = rows[i : i + BATCH]
        vals = ", ".join(
            f"({esc(r['legal_emd'])}, {esc(r['jibun_san_yn'])}, "
            f"{r['jibun_main_no']}, {r['jibun_sub_no']}, {esc(r['road_address'])})"
            for r in batch
        )
        out.write(
            f"INSERT INTO nexus_address.jibun_addresses "
            f"(legal_emd, jibun_san_yn, jibun_main_no, jibun_sub_no, road_address) "
            f"VALUES {vals} "
            f"ON CONFLICT (legal_emd, jibun_san_yn, jibun_main_no, jibun_sub_no) DO NOTHING;\n"
        )


def write_admin_dong_map(out, mapping: dict):
    items = list(mapping.items())
    for i in range(0, len(items), BATCH):
        batch = items[i : i + BATCH]
        vals = ", ".join(
            f"({esc(admin)}, {esc(legal)})"
            for admin, legal in batch
        )
        out.write(
            f"INSERT INTO nexus_address.admin_dong_map (admin_emd, legal_emd) "
            f"VALUES {vals} "
            f"ON CONFLICT (admin_emd) DO UPDATE SET legal_emd = EXCLUDED.legal_emd;\n"
        )


# ──────────────────────────────────────────────
# 진입점
# ──────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="광주시 주소 DB SQL 생성")
    parser.add_argument("--data-dir", default="I:/Projects/nexus-pipeline",
                        help="nexus-pipeline 루트 경로")
    parser.add_argument("--out", default="gwangju_address.sql",
                        help="출력 SQL 파일명 (.gz 확장자 시 gzip 압축)")
    parser.add_argument("--inspect", action="store_true",
                        help="건물/주소 파일의 광주시 첫 행을 컬럼 인덱스와 함께 출력하고 종료 (적재 전 검증용)")
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    if not data_dir.exists():
        print(f"[ERROR] data-dir not found: {data_dir}", file=sys.stderr)
        sys.exit(1)

    if args.inspect:
        _inspect_columns(data_dir)
        return

    print("[1/5] 도로명코드 파싱...", file=sys.stderr)
    road_codes = parse_road_codes(data_dir)

    print("[2/5] 주소 파싱...", file=sys.stderr)
    addresses = parse_addresses(data_dir, road_codes)

    print("[3/5] 건물 파싱...", file=sys.stderr)
    buildings = parse_buildings(data_dir, road_codes)

    print("[4/5] 지번 주소 추출 (주소 + 건물DB 전체)...", file=sys.stderr)
    # 주소 파일(건물 매칭)뿐 아니라 건물DB 전체에서도 지번을 추출해 커버리지를 극대화한다.
    jibun_rows = build_jibun_rows(addresses + buildings)

    print("[5/5] 행정동→법정동 매핑 계산...", file=sys.stderr)
    admin_dong_map = build_admin_dong_map(road_codes, addresses)

    print(f"[SQL 생성] 출력: {args.out}", file=sys.stderr)

    use_gzip = args.out.endswith(".gz")
    open_fn = gzip.open if use_gzip else open
    mode = "wt" if use_gzip else "w"

    with open_fn(args.out, mode, encoding="utf-8") as out:
        out.write("-- 경기도 광주시 도로명주소 DB (nexus-pipeline 202604)\n")
        out.write("-- 생성: generate_gwangju_sql.py\n\n")
        out.write("SET client_encoding = 'UTF8';\n\n")

        out.write("-- 기존 데이터 초기화\n")
        out.write("TRUNCATE nexus_address.buildings;\n")
        out.write("TRUNCATE nexus_address.jibun_addresses;\n")
        out.write("TRUNCATE nexus_address.addresses;\n")
        out.write("DELETE FROM nexus_address.road_codes;\n")
        out.write("DELETE FROM nexus_address.admin_dong_map;\n\n")

        out.write(f"-- road_codes ({len(road_codes)}개)\n")
        write_road_codes(out, road_codes)
        out.write("\n")

        out.write(f"-- addresses ({len(addresses)}개)\n")
        write_addresses(out, addresses)
        out.write("\n")

        out.write(f"-- buildings ({len(buildings)}개)\n")
        write_buildings(out, buildings)
        out.write("\n")

        out.write(f"-- jibun_addresses ({len(jibun_rows)}개)\n")
        write_jibun_addresses(out, jibun_rows)
        out.write("\n")

        out.write(f"-- admin_dong_map ({len(admin_dong_map)}쌍)\n")
        write_admin_dong_map(out, admin_dong_map)
        out.write("\n")

        out.write("-- 통계\n")
        out.write(
            "SELECT tbl, cnt FROM (\n"
            "  SELECT 'road_codes' tbl, count(*) cnt FROM nexus_address.road_codes UNION ALL\n"
            "  SELECT 'addresses', count(*) FROM nexus_address.addresses UNION ALL\n"
            "  SELECT 'buildings', count(*) FROM nexus_address.buildings UNION ALL\n"
            "  SELECT 'jibun_addresses', count(*) FROM nexus_address.jibun_addresses UNION ALL\n"
            "  SELECT 'admin_dong_map', count(*) FROM nexus_address.admin_dong_map\n"
            ") t ORDER BY tbl;\n"
        )

    size_mb = os.path.getsize(args.out) / 1024 / 1024
    print(f"[완료] {args.out} ({size_mb:.1f}MB)", file=sys.stderr)
    print(
        f"\n서버 임포트 명령:\n"
        f"  gcloud compute scp {args.out} hanwool-server:/tmp/ "
        f"--project=hanwool-delivery-2026 --zone=asia-northeast3-a\n"
        f"  gcloud compute ssh hanwool-server --project=hanwool-delivery-2026 "
        f"--zone=asia-northeast3-a "
        f"--command=\"sudo docker exec -i hanwool-db-1 psql -U hanwool hanwool_db "
        f"< /tmp/{os.path.basename(args.out)}\"",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
