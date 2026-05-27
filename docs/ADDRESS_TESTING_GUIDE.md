# 주소 검증 테스트 가이드

## 테스트 주소 추출

운영 DB에 적재된 행안부 주소에서 실제 테스트 주소를 가져온다.

```sql
SELECT legal_emd, road_address, building_name
FROM nexus_address.buildings
WHERE legal_emd IN ('경안동', '송정동', '쌍령동', '탄벌동')
  AND road_address <> ''
ORDER BY legal_emd, road_address
LIMIT 40;
```

API로는 다음을 사용한다.

```http
GET /api/v1/addresses/test-samples?limit=10
GET /api/v1/addresses/test-samples?dong=경안동&limit=10
```

## 단건 검증

```http
POST /api/v1/addresses/resolve
Content-Type: application/json

{
  "address": "경기도 광주시 중앙로145번길 22"
}
```

성공 기준:

- `standard_road_address`가 채워진다.
- `legal_emd` 또는 `service_dong`이 4개 배송동 중 하나다.
- `adm_cd`, `rn_mgt_sn`, `buld_mnnm`, `buld_slno`가 가능한 범위에서 채워진다.
- 지도 표시가 필요하면 `lat`, `lng`가 채워진다.
- 좌표가 없으면 `match_status`가 `needs_review`가 된다.

## 주문 저장 검증

직접입력, 엑셀, QR 저장 API는 주문 저장 시 자동으로 주소를 정규화한다.

확인할 주문 필드:

- `raw_address`
- `standard_road_address`
- `legal_emd`
- `service_dong`
- `match_status`
- `match_score`
- `coord_source`
- `lat`, `lng`

## 실패 케이스 처리

주소가 반복해서 실패하면 `address_overrides`에 현장 보정 규칙을 추가한다.

예:

```sql
INSERT INTO address_overrides
  (raw_pattern, standard_road_address, force_service_dong, memo)
VALUES
  ('중앙로145번길 22 별관', '경기도 광주시 중앙로145번길 22', '경안동', '현장 별칭 보정');
```

보정 후 같은 주소는 `override` 기준으로 즉시 매칭된다.
