# 📋 PROJECT STATUS — hanwool (경안시장 집배송)
> 자동 갱신: 2026-09-17 12:36 KST

## 식별
- GitHub: `ttong0627/hanwool` · 브랜치 `master`
- GCP: `hanwool-delivery-2026`
- 운영: https://ga.wssc.kr · GCE `hanwool-server` / `asia-northeast3-a`
- 로컬: `I:\ttong_project\hanwool`

## 현재 작업
- 배송 운영일을 장날 제한에서 365일 매일로 변경
- 주문 접수 시간 제한을 제거하여 24시간 접수 허용
- 기존 `market_date`, `is_market_day`, `market-status` 구조는 호환성을 위해 유지
- 로그인한 기사 계정이 관리자 배정 없이 미배정 주문을 최대 40건까지 직접 가져와 배송 시작 가능
- 기사 직접 배정도 `dispatch_runs`, `dispatch_run_items`, 주문 이력에 기록
- 기존 관리자 추천·수동 배정 기능 유지
- 동시 기사 요청은 PostgreSQL advisory lock과 row lock으로 중복 배정 방지

## 앱 구성
| 앱 | 경로 | 역할 |
|---|---|---|
| backend | `backend/` | FastAPI · 주소검증 · 배차 · 배송 |
| frontend | `frontend/` | 관리자·접수 웹 |
| mobile | `mobile/` | 기사·접수·고객 앱 |
| desktop | `desktop/` | Electron PC 앱 |

## 검증
- 24시간 정책 테스트 4건 통과
- Python compileall 및 변경 모듈 문법 검사 통과
- frontend `npm run build` 통과
- mobile `npx tsc --noEmit` 통과
- `git diff --check` 통과
- 커밋 `55d22b0` GitHub `master` 푸시 완료
- backend·frontend 순차 빌드 및 재기동 완료
- 컨테이너 backend healthy · Alembic `z1a2b3c4d567 (head)` 확인
- https://ga.wssc.kr/health → HTTP 200 확인
- 모바일 APK 1.0.50 (versionCode 31) ARM release 빌드 완료 · SHA-256 E087DFC237722A279E880CA58894E75D958A2107D776DB8AB0D9BF9D1F3B9E80

## 규칙 문서
- `AGENTS.md`
- `CLAUDE.md`
- `docs/ADDRESS_STRATEGY.md`
- `docs/ADDRESS_TESTING_GUIDE.md`
- `docs/DISPATCH_SEQUENCE_RULES.md`

## 백업
- 동기화 전 로컬 파일 백업: `C:\tmp\hanwool-pre-daily-delivery-20260917-1148`

## 주의
- 기사 직접 가져오기는 활성 기사 계정 또는 기사 업무가 부여된 관리자만 가능하다.
- 고객 계정에는 다른 고객의 배송정보 접근 권한을 부여하지 않는다.
- 기사 1명당 직접 가져오기 상한은 40건이다. 남은 주문은 다른 기사가 가져가거나 관리자가 배정한다.
