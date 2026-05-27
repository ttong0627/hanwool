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
from pathlib import Path
from typing import Iterator, Optional


TARGET_SIDO = "경기도"
TARGET_SIGUNGU = "광주시"
VERSION_ID = "202604"

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
        t = value.strip()
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


def esc(value) -> str:
    """SQL 문자열 이스케이프 (작은따옴표 처리)"""
    if value is None:
        return "NULL"
    s = str(value).replace("'", "''")
    return f"'{s}'"


def parse_road_codes(data_dir: Path) -> dict:
    """
    개선_도로명코드_전체분.txt 에서 광주시 road_codes 파싱
    col[0]=road_code, col[1]=road_name, col[4]=sido, col[6]=sigungu, col[8]=emd
    """
    fpath = data_dir / "202604_주소DB_전체분" / "개선_도로명코드_전체분.txt"
    if not fpath.exists():
        print(f"[WARN] road_codes file not found: {fpath}", file=sys.stderr)
        return {}

    codes: dict = {}
    count = 0
    for cols in read_txt(fpath):
        if len(cols) < 9:
            continue
        road_code = clean_text(cols[0])
        road_name = clean_text(cols[1])
        sido = clean_text(cols[4])
        sigungu = clean_text(cols[6])
        emd = clean_text(cols[8])
        if not road_code or not road_name:
            continue
        if sido == TARGET_SIDO and sigungu == TARGET_SIGUNGU:
            codes[road_code] = {"road_name": road_name, "sigungu": sigungu, "emd": emd}
            count += 1

    print(f"[road_codes] 광주시 {count}개", file=sys.stderr)
    return codes


def parse_addresses(data_dir: Path, road_codes: dict) -> list:
    """
    jibun_rnaddrkor_gyunggi.txt 에서 광주시 addresses 파싱
    col[0]=addr_mgt_no, col[2]=sido, col[3]=sigungu, col[4]=legal_emd,
    col[9]=road_code, col[10]=underground_yn, col[11]=main_no, col[12]=sub_no, col[13]=building_name
    """
    fpath = data_dir / "202604_도로명주소 한글_전체분" / "jibun_rnaddrkor_gyunggi.txt"
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
        main_no = int_or_none(cols[11])
        if main_no is None:
            continue

        sub_no = int_or_none(cols[12]) or 0
        legal_emd = clean_text(cols[4])
        underground_yn = clean_text(cols[10]) or "0"
        building_name = clean_text(cols[13])

        # 도로명은 road_codes에서 가져옴
        road_name = road_codes.get(road_code, {}).get("road_name", "")
        road_addr = road_address_text(
            sido, sigungu, "", road_name, underground_yn, main_no, sub_no
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
            "building_main_no": main_no,
            "building_sub_no": sub_no,
            "underground_yn": underground_yn,
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
    fpath = data_dir / "202604_건물DB_전체분" / "build_gyunggi.txt"
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
        })

    print(f"[buildings] 광주시 {len(rows)}개", file=sys.stderr)
    return rows


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


def main():
    parser = argparse.ArgumentParser(description="광주시 주소 DB SQL 생성")
    parser.add_argument("--data-dir", default="I:/Projects/nexus-pipeline",
                        help="nexus-pipeline 루트 경로")
    parser.add_argument("--out", default="gwangju_address.sql",
                        help="출력 SQL 파일명 (.gz 확장자 시 gzip 압축)")
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    if not data_dir.exists():
        print(f"[ERROR] data-dir not found: {data_dir}", file=sys.stderr)
        sys.exit(1)

    print("[1/3] 도로명코드 파싱...", file=sys.stderr)
    road_codes = parse_road_codes(data_dir)

    print("[2/3] 주소 파싱...", file=sys.stderr)
    addresses = parse_addresses(data_dir, road_codes)

    print("[3/3] 건물 파싱...", file=sys.stderr)
    buildings = parse_buildings(data_dir, road_codes)

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
        out.write("TRUNCATE nexus_address.addresses;\n")
        out.write("DELETE FROM nexus_address.road_codes;\n\n")

        out.write(f"-- road_codes ({len(road_codes)}개)\n")
        write_road_codes(out, road_codes)
        out.write("\n")

        out.write(f"-- addresses ({len(addresses)}개)\n")
        write_addresses(out, addresses)
        out.write("\n")

        out.write(f"-- buildings ({len(buildings)}개)\n")
        write_buildings(out, buildings)
        out.write("\n")

        out.write("-- 통계\n")
        out.write(f"SELECT 'road_codes' AS tbl, count(*) FROM nexus_address.road_codes\n")
        out.write("UNION ALL\n")
        out.write(f"SELECT 'addresses', count(*) FROM nexus_address.addresses\n")
        out.write("UNION ALL\n")
        out.write(f"SELECT 'buildings', count(*) FROM nexus_address.buildings;\n")

    size_mb = os.path.getsize(args.out) / 1024 / 1024
    print(f"[완료] {args.out} ({size_mb:.1f}MB)", file=sys.stderr)
    print(
        f"\n서버 임포트 명령:\n"
        f"  gcloud compute scp {args.out} hanwool-server:/tmp/ --project=hanwool-delivery-2026 --zone=asia-northeast3-a\n"
        f"  gcloud compute ssh hanwool-server --project=hanwool-delivery-2026 --zone=asia-northeast3-a "
        f"--command=\"sudo docker exec -i hanwool-db-1 psql -U hanwool hanwool_db < /tmp/{os.path.basename(args.out)}\"",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
