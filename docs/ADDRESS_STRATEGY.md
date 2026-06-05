# 한울 배송 주소/배차 DB 활용 전략

작성일: 2026-05-27

이 문서는 주소 입력, 행안부 주소 DB 매칭, 배송동 판정, 지도 표시, 순번 배정까지 한울 배송 서비스가 반복해서 따라야 할 기준이다.

## 핵심 결론

행안부 원본 주소 DB는 충분하다. 실수는 원본 부족보다 `주소 문자열`만 믿고 주문을 저장하는 구조에서 발생한다. 주문에는 반드시 행안부 표준키와 매칭 상태를 함께 저장한다.

## 표준 저장 필드

`orders`에는 다음 필드를 주소 검증 결과로 저장한다.

| 필드 | 의미 |
| --- | --- |
| `raw_address` | 사용자가 입력한 원문 주소 |
| `standard_road_address` | 행안부 규격 도로명주소 |
| `jibun_address` | 지번주소 |
| `detail_address` | 동/호수 등 상세주소 |
| `legal_emd` | 법정동 |
| `admin_emd` | 행정동 |
| `service_dong` | 실제 배송 구역 |
| `adm_cd` | 행정구역코드 |
| `rn_mgt_sn` | 도로명관리번호 |
| `bd_mgt_sn` | 건물관리번호 |
| `udrt_yn` | 지하여부 |
| `buld_mnnm` | 건물본번 |
| `buld_slno` | 건물부번 |
| `lat`, `lng` | 지도 표시 좌표 |
| `coord_source` | 좌표 출처: `kakao`, `cache`, `manual` |
| `match_status` | `matched`, `needs_review`, `not_found` |
| `match_score` | 0~1 신뢰도 |

## 매칭 우선순위

1. `address_overrides`: 현장 수동 보정 규칙
2. `nexus_address.buildings`: 도로명 + 건물번호 정확 매칭
3. `nexus_address.jibun_addresses`: 지번주소 매칭
4. `nexus_address.buildings.full_key`: 정규화 문자열 유사도 매칭
5. `address_cache`: 이전 검색 결과 재사용
6. Kakao 좌표 검색: 좌표 보강 및 캐시 저장

## 배송동 판정

배송 가능 동은 `delivery_zones`에서 관리한다. 광주시 동(洞) 단위 18개를 접수 허용동으로 둔다(면·읍 및 능평동·신현동 제외). 우선순위 1~4는 협약 기준 핵심 4개 동이다.

- 경안동 (우선순위 1)
- 송정동 (우선순위 2)
- 쌍령동 (우선순위 3)
- 탄벌동 (우선순위 4)
- 고산동, 매산동, 목동, 목현동, 문형동, 삼동, 양벌동, 역동, 장지동, 중대동, 직동, 추자동, 태전동, 회덕동 (우선순위 5~18)

법정동과 실제 배송 구역이 다를 때는 `address_overrides.force_service_dong`으로 현장 기준을 우선한다.

> 배차 알고리즘(`dispatch_service.py`)은 동 우선순위를 `delivery_zones.priority`(DB, `zone_service.load_zone_priority`)에서 주입받는다. n≤4는 기존 4개 동 고정 그룹 동선을 보존하고 그룹에 없는 신규 동은 최소 부하 기사에 흡수하며, n≥5는 우선순위 순으로 균등 분배한다. 어떤 기사 수(1~18)에서도 주문이 있는 모든 동은 누락 없이 배정된다. `route_service`의 경로 최적화도 동일 priority를 사용한다.

## 검토 필요 기준

다음 경우 주문은 저장하되 `match_status = needs_review`로 둔다.

- 주소는 찾았지만 좌표가 없다.
- 건물 본번만 일치하고 부번은 근사값이다.
- 법정동이 배송 가능 구역에 직접 포함되지 않는다.
- 유사도 매칭 신뢰도가 낮다.

다음 경우는 `match_status = not_found`다.

- 로컬 행안부 DB와 캐시에서 주소를 찾지 못했다.
- Kakao 좌표 검색도 실패했다.

## 배차 이력

배차를 실행하면 `dispatch_runs`와 `dispatch_run_items`에 스냅샷을 남긴다.

- 누가 실행했는지
- 몇 명 기사에게 배정했는지
- 총 주문 수
- 60건 이상 분리 검토가 적용됐는지
- 주문별 기사, 순번, 배송동, 좌표

이 이력이 있어야 총관리자가 나중에 배차 판단을 검증할 수 있다.

## 운영 원칙

- 프론트와 모바일은 직접 주소 문자열을 해석하지 않는다.
- 주소 검증은 `/api/v1/addresses/resolve` 또는 주문 저장 API를 통해 백엔드에서만 수행한다.
- 한 번 매칭된 결과는 `address_cache`로 재사용한다.
- 실패/수동보정/근사매칭은 `address_resolution_logs`에 남긴다.
- 주소/상세주소는 개인정보이므로 관리자 이상 화면에서만 상세 로그를 노출한다.
