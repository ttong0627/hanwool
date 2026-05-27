# 경안시장 집배송 — 주소 처리 전략 문서

> 작성: 2026-05-27 | 팀: 안토니(설계), 빌(DB), 타미(성능), 미아(무결성), 코코(보안)
> 이 문서는 주소 검색·매칭·배송동 판단·좌표 획득·배차 연결 전체 흐름을 정의합니다.
> **Claude Code가 주소 관련 작업 시 반드시 이 문서를 참조합니다.**

---

## 1. 로컬 DB 구조 (nexus_address 스키마)

### 핵심 테이블
| 테이블 | 행 수 | 역할 |
|--------|-------|------|
| `buildings` | 60,529 | **PRIMARY** — 건물 단위 도로명주소. 인덱스 완비 |
| `road_codes` | 619 | 도로명 → road_code, emd(법정동) 매핑 |
| `addresses` | 9,318 | SECONDARY — 일부 주소만 포함 (보완용) |
| `jibun_addresses` | 8,927 | 지번주소 → 도로명주소 변환 |
| `admin_dong_map` | 26 | 행정동 → 법정동 매핑 |

### buildings 테이블 핵심 컬럼
```
road_code        TEXT    — 12자리 행정구역 코드 (road_codes FK)
road_name        TEXT    — 도로명 (예: 중앙로145번길)
road_address     TEXT    — 전체 도로명주소 (경기도 광주시 중앙로145번길 22)
building_name    TEXT    — 건물명 (신원플러스타운)
legal_emd        TEXT    — 법정동 (경안동) — NEVER NULL
building_main_no INTEGER — 건물 본번
building_sub_no  INTEGER — 건물 부번 (default 0)
road_key         TEXT    — 공백제거 전체주소 소문자 (GIN trigram 인덱스)
full_key         TEXT    — road_key + 건물명 + 법정동 (GIN trigram 인덱스)
building_name_key TEXT   — 건물명 정규화 (GIN trigram 인덱스)
```

### 인덱스 전략
```
buildings_road_code_main : btree(road_code, building_main_no, building_sub_no) → 정확 매칭 최고속
buildings_full_key_trgm  : GIN trigram(full_key)                               → 부분 매칭
buildings_name_key_trgm  : GIN trigram(building_name_key)                      → 건물명 검색
road_codes.road_code (PK): btree                                               → 도로명 코드 조회
```

---

## 2. 행안부 도로명주소 규격

### 도로명주소 구성
```
경기도 광주시 중앙로145번길 22 (신원플러스타운)
├── 시도   : 경기도
├── 시군구 : 광주시
├── 도로명 : 중앙로145번길  (road_name, road_codes.road_name)
├── 건물번호: 22            (building_main_no)
└── 건물명  : 신원플러스타운 (building_name, 선택)
```

### 중요 원칙
- `중앙로145번길` 은 **도로명 전체** — "145번길"을 건물번호로 착각 금지
- `22` 는 **건물번호** — 이것이 최소 단위. 제거하면 주소 불완전
- `road_key` = 공백·하이픈 제거 소문자: `경기도광주시중앙로145번길22`
- `full_key` = road_key + 건물명 + 동: `경기도광주시중앙로145번길22신원플러스타운경안동`

---

## 3. 주소 검색 알고리즘 (addresses.py)

### 검색 순서 (속도 우선)
```
Step 1a: road_codes JOIN buildings btree  ← 도로명+건물번호 파싱 성공 시 (최고속, 인덱스 100%)
Step 1b: road_codes JOIN addresses btree  ← Step 1a 보완
Step 2:  buildings full_key GIN ILIKE     ← 공백 제거 정규화 후 트라이그램 (빠름)
Step 3:  buildings building_name_key GIN  ← 건물명 검색
Step 4:  jibun_addresses 패턴 매칭         ← 지번 입력 시
Step 5:  address_cache (이전 Kakao 결과)  ← L2 캐시
Kakao API → address_cache upsert          ← 최후 수단, 결과 저장
```

### 쿼리 최적화 핵심
```sql
-- 정확 매칭 (Step 1a) — 인덱스만 사용
SELECT b.road_address, b.legal_emd, b.building_name
FROM nexus_address.buildings b
JOIN nexus_address.road_codes r ON b.road_code = r.road_code
WHERE r.road_name = '중앙로145번길'     -- road_codes PK 인덱스
  AND b.building_main_no = 22           -- buildings btree 인덱스
  
-- 부분 매칭 (Step 2) — GIN trigram
SELECT road_address, legal_emd, building_name
FROM nexus_address.buildings
WHERE full_key ILIKE '%중앙로145번길22%'  -- GIN trigram 활용
```

---

## 4. 배송동 판단 로직

### 결정 순서
```
1. buildings.legal_emd  (가장 신뢰성 높음 — 행안부 기준)
2. road_codes.emd       (road_code JOIN으로 가져옴)
3. address_cache.dong_name (이전 Kakao 캐시)
4. Kakao API 응답의 region_3depth_name
5. 수동 입력 (dong_override=true)
```

### 4개 배송동 → legal_emd 매핑
```
경안동 → legal_emd: 경안동
송정동 → legal_emd: 송정동
쌍령동 → legal_emd: 쌍령동
탄벌동 → legal_emd: 탄벌동
```
> delivery_zones 테이블에서 동적으로 관리 (코드 상수 사용 금지)

---

## 5. 주소 표준화 파이프라인 (address_resolver.py — 향후 구현)

```
사용자 입력
    ↓
1. _strip_prefix()    : "경기도 광주시" 제거
2. _parse_road_address(): 도로명 + 건물번호 분리
3. _normalize()        : 공백/특수문자 제거
    ↓
로컬 DB 매칭 시도 (Step 1~4)
    ↓ 실패 시
address_cache 조회
    ↓ 실패 시
Kakao API → 결과 캐시 저장
    ↓
결과 저장:
  - orders.legal_emd          ← 법정동
  - orders.service_dong       ← 배송동 (dong_override 반영 후)
  - orders.bd_mgt_sn          ← 건물관리번호 (있을 경우)
  - orders.match_status       ← matched/ambiguous/not_found
  - orders.match_score        ← 신뢰도 0~1
  - orders.coord_source       ← nexus/kakao/cache/manual
  - address_resolution_logs   ← 이력 기록
```

---

## 6. DB 테이블 설계 (공개 스키마)

### orders 확장 필드
| 컬럼 | 타입 | 설명 |
|------|------|------|
| `legal_emd` | VARCHAR(50) | 법정동 |
| `service_dong` | VARCHAR(50) | 실제 배송동 (dong_override 반영) |
| `bd_mgt_sn` | VARCHAR(25) | 건물관리번호 (행안부 PK) |
| `match_status` | VARCHAR(20) | matched/ambiguous/not_found/needs_review |
| `match_score` | FLOAT | 매칭 신뢰도 0~1 |
| `coord_source` | VARCHAR(20) | nexus/kakao/cache/manual |

### address_cache (Kakao 결과 누적)
- `hit_count`: 재활용 횟수 (자주 검색되는 주소 우선 정렬 가능)
- `last_used_at`: 최근 사용일 (오래된 캐시 정리 기준)

### address_resolution_logs (주소 매칭 이력)
- 모든 주소 매칭 시도 기록
- 실패 원인, 수동 수정 여부 포함
- 보안: 관리자 이상만 접근 (raw_input = 암호화 대상 고려)

### address_overrides (수동 보정)
- 법정동 ≠ 실제 배송 기준인 경우 등록
- `raw_pattern`: 입력 패턴 (ILIKE 매칭)
- `force_service_dong`: 강제 배송동 지정

### delivery_zones (배송 구역 정책)
- 4개 동 기본값 삽입됨
- `threshold_request_driver`: 40건 이상 → 기사 추가 요청
- `threshold_split_review`: 60건 이상 → 분리 검토
- 코드 수정 없이 DB에서 관리

### dispatch_runs / dispatch_run_items (배차 이력)
- 배차 실행 단위 기록
- 40건/60건 판단 결과 보존
- 기사별 순번·좌표 스냅샷

---

## 7. 좌표(lat/lng) 획득 전략

```
우선순위:
1. buildings 테이블 — 없음 (행안부 데이터에 좌표 미포함)
2. address_cache.lat/lng — Kakao 검색으로 누적된 좌표
3. Kakao geocode API — 실시간 조회 + 캐시 저장
4. 수동 입력 (coord_source='manual')

→ 배송지 첫 검색 시 Kakao에서 가져와 address_cache에 저장
→ 이후 동일 주소 검색 시 캐시에서 즉시 반환
→ orders.lat/lng = address_cache.lat/lng (coord_source='cache')
```

---

## 8. 보안 고려사항 (코코)

- `address_resolution_logs.raw_input`: 개인정보(주소) → 향후 AES-256 암호화 적용 예정
- 로그 접근: 관리자(admin) 이상으로 API 레벨에서 제한
- 로그 보관 기간: 6개월 후 자동 삭제 정책 권고 (현재 미구현)
- `address_overrides`: 어드민만 등록/수정 가능

---

## 9. 미구현 항목 (향후 작업)

- [ ] `address_resolver.py` 서비스 레이어 — 주문 생성 시 자동 표준화
- [ ] orders 생성/수정 API에서 address_resolver 호출
- [ ] address_overrides 관리 API (admin)
- [ ] delivery_zones 관리 API (admin)
- [ ] dispatch_runs 배차 이력 기록 연동
- [ ] address_resolution_logs raw_input 암호화
- [ ] 캐시 만료 정책 (last_used_at 기준 180일 미사용 시 삭제)
