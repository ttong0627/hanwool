# 경기도 광주시 지번 전체 적재 가이드

> 목적: `nexus_address.jibun_addresses`를 **건물DB 전체 기준**으로 채워 지번 검색 누락(예: 송정동 113-23)을 없앤다.
> 현재 8,927건(부분) → 건물 60,529건 기준 수만 건으로 확대.

원본 데이터는 다른 PC에 있으므로, 행안부에서 새로 받는다.

---

## 1단계 — 행안부 주소 데이터 다운로드

1. **도로명주소 개발자센터/자료제공** 접속: <https://business.juso.go.kr> → `주소정보 제공 > 주소DB`
2. 회원가입/로그인 후, **경기도분**(또는 전체분)으로 아래 3종을 받는다(무료):
   | 자료 | 압축 해제 후 안에 있어야 할 파일 |
   |------|------|
   | 도로명주소 한글 (전체분) | `jibun_rnaddrkor_gyunggi.txt` |
   | 건물DB (전체분) | `build_gyunggi.txt` ← **지번 추출 핵심** |
   | 주소DB / 도로명코드 (전체분) | `개선_도로명코드_전체분.txt` |
3. 파일 인코딩은 **CP949(EUC-KR)**, 구분자는 `|` (스크립트가 그대로 처리).

> 월마다 폴더 접두어가 바뀐다(예: `202606_건물DB_전체분`). 스크립트는 접두어 무관하게 `*건물DB_전체분*` 식으로 찾으므로 폴더명을 바꿀 필요 없다.

## 2단계 — 작업 폴더 구성

압축을 풀어 한 폴더(`<DATA_DIR>`) 아래 둔다. 예:

```
D:\juso\
 ├─ 202606_건물DB_전체분\build_gyunggi.txt
 ├─ 202606_도로명주소 한글_전체분\jibun_rnaddrkor_gyunggi.txt
 └─ 202606_주소DB_전체분\개선_도로명코드_전체분.txt
```

## 3단계 — 컬럼 검증 (적재 전 안전 확인)

건물DB의 `col[5]=산여부, col[6]=지번본번, col[7]=지번부번`이 맞는지 눈으로 확인한다.

```bash
cd backend
python scripts/generate_gwangju_sql.py --data-dir "D:/juso" --inspect
```

출력에서 `[ 5] 0`(산여부), `[ 6] 113`(본번), `[ 7] 23`(부번) 형태가 보이면 정상. 어긋나면 멈추고 알려줄 것.

## 4단계 — SQL 생성

```bash
python scripts/generate_gwangju_sql.py --data-dir "D:/juso" --out gwangju_address.sql.gz
```

마지막 로그의 `[jibun_addresses] NN개`가 수만 단위면 성공.

## 5단계 — 서버 적재 (무중단, 단일 트랜잭션)

스크립트 SQL 상단에 `TRUNCATE`가 있으므로 **`--single-transaction`** 으로 적재해 빈 구간 없이 원자적으로 교체한다.

```bash
# 1) 업로드
gcloud compute scp gwangju_address.sql.gz hanwool-server:/tmp/ \
  --project=hanwool-delivery-2026 --zone=asia-northeast3-a

# 2) 원격 적재 (gunzip → psql, 실패 시 전체 롤백)
gcloud compute ssh hanwool-server --project=hanwool-delivery-2026 --zone=asia-northeast3-a \
  --strict-host-key-checking=no \
  --command="cd /opt/hanwool && gunzip -c /tmp/gwangju_address.sql.gz | sudo docker compose exec -T db psql -U hanwool -d hanwool_db --single-transaction --set ON_ERROR_STOP=1 && rm /tmp/gwangju_address.sql.gz"
```

## 6단계 — 검증

```bash
gcloud compute ssh hanwool-server --project=hanwool-delivery-2026 --zone=asia-northeast3-a \
  --strict-host-key-checking=no \
  --command="cd /opt/hanwool && sudo docker compose exec -T db psql -U hanwool -d hanwool_db \
  -c \"SELECT count(*) FROM nexus_address.jibun_addresses;\" \
  -c \"SELECT jibun_main_no, jibun_sub_no, road_address FROM nexus_address.jibun_addresses WHERE normalize(legal_emd,NFC)=U&'\\C1A1\\C815\\B3D9' AND jibun_main_no=113 AND jibun_sub_no=23;\""
```

- 1번째: 지번 총건수가 수만 단위로 늘었는지
- 2번째: **송정동 113-23**이 이제 조회되는지 (U&'\C1A1\C815\B3D9' = 송정동, [[hanwool-db-query-korean-escape]] 참고)

113-23이 그래도 안 나오면 그 지번은 건물이 없는 필지(도로명주소 미부여)이며, 이 경우는 주문 입력 시 **Kakao 폴백 + 담당자 주소 확인** 워크플로우가 처리한다.

---

## 참고 — 적재 후

- 백엔드 재시작 불필요(데이터만 변경).
- 기존에 `not_found`로 저장된 주문은 그대로 남으니, 필요하면 주문 수정에서 주소 재검증하거나 "주소 확인 대기"에서 확정한다.
