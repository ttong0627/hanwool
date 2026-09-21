-- ============================================================================
-- 이용자 집계 — 전체 / 1회 이상 이용 / 기간 내 신규 / 재이용 + 일자별 추이
--
-- 사용법 (로컬 Windows에서 한 줄):
--   gcloud compute ssh hanwool-server --project=hanwool-delivery-2026 ^
--     --zone=asia-northeast3-a --account=ttong0627@gmail.com ^
--     --command="cd /opt/hanwool && sudo git pull -q && cat scripts/user_stats.sql | sudo docker compose exec -T db psql -U hanwool -d hanwool_db -P pager=off"
--
--   시작일을 바꾸려면 psql 에 -v start=YYYY-MM-DD 를 붙인다.
--     ... psql -U hanwool -d hanwool_db -P pager=off -v start=2026-09-16
--   생략하면 오늘 포함 최근 7일.
--
-- 원칙: 개인정보 컬럼(name_enc·phone_enc·address_enc)은 조회하지 않는다. 건수만 센다.
--       테스트 계정(is_test)과 삭제된 계정(deleted_at)은 제외한다.
-- ============================================================================

\if :{?start}
\else
\set start ''
\endif

-- 기본 시작일 = 오늘 포함 최근 7일. DB 안에서 계산하므로 컨테이너 셸에 의존하지 않는다
-- (postgres 이미지의 busybox date 는 -d '6 days ago' 를 모른다).
SELECT COALESCE(NULLIF(:'start', '')::date,
                (now() AT TIME ZONE 'Asia/Seoul')::date - 6)::text AS start \gset

\echo ''
\echo '=== 요약 (기준일부터) ==='

SELECT 'period_start'        AS metric, (:'start')::date::text AS value
UNION ALL
SELECT 'total_customers', count(*)::text
  FROM users
 WHERE role = 'customer' AND NOT is_test AND deleted_at IS NULL
UNION ALL
SELECT 'used_at_least_once', count(DISTINCT customer_id)::text
  FROM orders
 WHERE NOT is_test AND customer_id IS NOT NULL
UNION ALL
SELECT 'never_used', (
        (SELECT count(*) FROM users WHERE role='customer' AND NOT is_test AND deleted_at IS NULL)
      - (SELECT count(DISTINCT customer_id) FROM orders WHERE NOT is_test AND customer_id IS NOT NULL)
      )::text
UNION ALL
SELECT 'new_since_start', count(*)::text
  FROM (SELECT customer_id, min(created_at AT TIME ZONE 'Asia/Seoul')::date AS first_day
          FROM orders WHERE NOT is_test AND customer_id IS NOT NULL
         GROUP BY 1) f
 WHERE f.first_day >= (:'start')::date
UNION ALL
SELECT 'repeat_users_2plus', count(*)::text
  FROM (SELECT customer_id FROM orders
         WHERE NOT is_test AND customer_id IS NOT NULL
         GROUP BY 1 HAVING count(*) >= 2) r
UNION ALL
SELECT 'orders_total_alltime', count(*)::text
  FROM orders WHERE NOT is_test;

\echo ''
\echo '=== 일자별 (신규 = 그날 처음 주문한 고객) ==='

WITH fo AS (
  SELECT customer_id, min(created_at AT TIME ZONE 'Asia/Seoul')::date AS first_day
    FROM orders
   WHERE NOT is_test AND customer_id IS NOT NULL
   GROUP BY 1
)
SELECT d::date AS day,
       to_char(d, 'Dy')                                          AS dow,
       (SELECT count(*) FROM fo WHERE fo.first_day = d::date)     AS new_users,
       sum((SELECT count(*) FROM fo WHERE fo.first_day = d::date))
         OVER (ORDER BY d)                                        AS cumulative,
       (SELECT count(DISTINCT o.customer_id) FROM orders o
         WHERE NOT o.is_test
           AND (o.created_at AT TIME ZONE 'Asia/Seoul')::date = d::date) AS active_users,
       (SELECT count(*) FROM orders o
         WHERE NOT o.is_test
           AND (o.created_at AT TIME ZONE 'Asia/Seoul')::date = d::date) AS orders
  FROM generate_series((:'start')::date, (now() AT TIME ZONE 'Asia/Seoul')::date, INTERVAL '1 day') d
 ORDER BY 1;
