# 📋 PROJECT STATUS — hanwool (경안시장 집배송)
> 자동 생성: /확인 스킬 · 갱신 2026-09-20 12:38 KST

## 식별
- GitHub: **ttong0627/hanwool** (계정 세트: ttong0627) · 브랜치 `master`
- GCP 프로젝트: **hanwool-delivery-2026** (VM `hanwool-server` / `asia-northeast3-a` / 외부IP `34.64.146.168`)
- 로컬 경로: `I:\ttong_project\hanwool` (**유일한 로컬 클론** — 8/18 기록의 `d:\TTong_newproject\hanwool`는 **현재 존재하지 않음**, 2026-09-20 실측)

## ⭐ 운영 정책 변경 (2026-09-17, 커밋 `55d22b0`) — 이전 인식 전면 폐기
- **장날(3·8·13·18·23·28) 제한 폐지 → 365일 매일 배송**
- **접수 시간 제한 폐지 → 24시간 상시 접수**
- `market_date`·`is_market_day()`·`market-status`는 **이름만 호환 유지**, 실제 의미는 "배송 접수일"이며 `is_market_day()`/`is_reception_open()`은 **항상 True** (`backend/app/utils/market_day.py`)
- **기사 자율 배정 신설**: 로그인한 기사 계정이 관리자 배정 없이 미배정 주문을 **최대 40건**까지 직접 가져와 배송 시작. `dispatch_runs`/`dispatch_run_items`·주문 이력에 기록. 동시 요청은 PostgreSQL advisory lock + row lock으로 중복 방지
- 기존 관리자 수동·추천 배차 기능은 그대로 유지
- 권한: 기사 직접 가져오기는 **활성 기사 계정 또는 기사 업무 부여 관리자만**. 고객 계정에 타 고객 배송정보 접근 권한 부여 금지

## 배포 환경
- 접속 URL: https://ga.wssc.kr · API `https://ga.wssc.kr/api/v1` · Health `https://ga.wssc.kr/health`
- **헬스체크(2026-09-20 10:47): `/health` 200 (1.45s), `/` 200, `/api/v1/admin/market-status` 403(인증필요=라우트 정상) → 운영 정상**
- 호스팅: GCE VM e2-small + Docker Compose (nginx + backend + postgres + redis + 백업컨테이너)
- 빌드: `frontend` → `npm run build` / `desktop` → `npm run build:win` / `mobile` → `mobile/scripts/build-release.ps1`(로컬 Gradle APK, 서명 검증 포함)
- 배포: ⚠️ **`docker compose up -d --build`(전체 동시 빌드) 절대 금지 — 2026-08-08 이 명령으로 VM이 멈췄다.**
  e2-small은 메모리 2GB. Postgres·Redis·backend가 떠 있는 상태에서 `frontend/Dockerfile`의 `npm ci` + vite 빌드까지 동시에 돌리면 OOM으로 SSH까지 죽는다.
  **반드시 한 서비스씩 순차 빌드:**
  ```bash
  git add . && git commit -m "..." && git push origin master
  gcloud compute ssh hanwool-server --project=hanwool-delivery-2026 --zone=asia-northeast3-a \
    --account=ttong0627@gmail.com \
    --command="cd /opt/hanwool && sudo git pull && \
      sudo docker compose build backend  && sudo docker compose up -d backend && \
      sudo docker compose build frontend && sudo docker compose up -d frontend"
  ```
  긴 빌드는 SSH가 끊겨도 이어지도록 `setsid nohup ... > /tmp/deploy.log 2>&1 &`로 띄우고 로그를 폴링한다.
- 스왑: **2GB `/swapfile` 상시 활성** (2026-08-08 추가, `/etc/fstab` 등록, `vm.swappiness=20`). 빌드 OOM 방어선 — 끄지 말 것.
- ⚠️ **배포·SSH 전 gcloud 계정 지정 필수**: 현재 active `ttong627@gmail.com`은 hanwool-delivery-2026 **권한 없음**. `--account=ttong0627@gmail.com` 또는 `gcloud config set account ttong0627@gmail.com`
- DNS: `ga.wssc.kr`는 **Cloudflare(wssc.kr 존, ttong627@gmail.com 계정)** 관리. 2026-08-14 후이즈→Cloudflare 이전 때 `ga` 레코드가 누락돼 8/18 장날에 NXDOMAIN 사고 → 8/18 12:35 A 레코드(34.64.146.168) 재등록으로 복구. **도메인 접속 불가 시 Cloudflare DNS 레코드부터 확인.**
- **운영 실측(2026-09-20 12:38, SSH 조회)**: VM HEAD `6fa72c2` · Alembic `a2b3c4d5e678 (head)` · backend 47시간·frontend 18분 가동 · db·redis·backup_db 6주 healthy → **로컬 = 원격 = 운영 완전 일치**
- 커밋·푸시: gh active 계정 `ttong0627` = repo owner → **일치(전환 불필요)**

## 앱 구성
| 앱/패키지 | 경로 | 역할 | 스택 |
|---|---|---|---|
| backend | `backend/` | API 서버, 주소검증, 배차·순번, 감사로그 | Python 3.11 · FastAPI · SQLAlchemy · Alembic · PostgreSQL · Redis |
| hanwool-frontend | `frontend/` | 관리자·접수 웹 | React · Vite · TypeScript · Tailwind |
| hanwool-mobile v1.0.50 (versionCode 31) | `mobile/` | 기사·접수·고객 앱 | React Native · Expo |
| hanwool-desktop | `desktop/` | PC앱 | Electron |
| 운영 스크립트 | `scripts/` | DB 백업 루프, GCS 오프사이트 동기화, 복구 | Bash |

## 마지막 작업
- `6fa72c2` 2026-09-20 12:18 `fix(hangul): 'B동'을 'ㅠ동'으로 바꾸던 자동 변환 차단`
- 요약: **직접 입력(신규 주문 접수) 화면 입력성 전면 개선** — 담당자가 "입력 중 자꾸 끊기고 커서가 끝으로 튄다"고 보고한 문제를 원인별로 해결

| 커밋 | 내용 |
|---|---|
| `f3ff8c6` | 한글 변환·주소 정규화·주소 확인을 **타이핑 중 → 칸 이탈(blur) 시점**으로 이동(캐럿 튐 제거) · 저장 중 입력칸 `disabled` 제거 · **편집 중인 행은 자동저장 보류**(행을 벗어난 뒤 저장) · 칸 단위 영문 고정(Esc/「영문 유지」/한영키) · 역할·권한 배지 |
| `fca5008` | **새 버전 배포 알림**(`lib/useAppUpdate.ts`) — 화면을 켜 둔 채 쓰면 배포해도 옛 코드가 남는 문제. 우하단 안내만 띄우고 **자동 새로고침은 하지 않는다**. `sw.js`: 쿼리 붙은 요청 미가로채기 + 캐시 세대 v2 |
| `5006724` | **레이아웃 흔들림 제거** — 주소 칸 상태 배지 자리 54px 선확보(확인 결과 도착 시 입력창이 좁아지며 글자가 밀리던 것), 툴바 버튼 최소 폭 고정, 행 배경 전환 500ms, 경고 토스트 bounce 제거 |
| `6fa72c2` | 자동 한글 변환 가드 `shouldConvertToHangul()` — **한글이 섞여 있거나 대문자가 있으면 변환하지 않는다**(`B동 202호` → `ㅠ동 202호` 사고 차단). 검증: 실모듈 esbuild+node 9건 전부 통과 |

⚠️ 직접 입력 화면을 고칠 때 **「입력 중 자동 처리」를 다시 넣지 말 것**. 보정이 필요하면 `commitCell()`(칸 이탈)에 넣는다. 입력칸 `disabled`도 되살리지 않는다.

## 규칙 문서 (SSOT — 메뉴·기능 처리 방식의 기록, 작업 전 필독)
| 문서 | 내용 |
|---|---|
| `AGENTS.md` | 공통 작업 규칙 · **배송 운영 규칙(365일 24시간·기사 자율배정 40건)** · 배송동 18개 · 배차 판단 |
| `CLAUDE.md` | **배송 운영일/접수 정책(매일 24시간)** · 역할 5단계 · 메뉴 정의 · 드림팀 분업 |
| `docs/ADDRESS_STRATEGY.md` | **주소 최우선 기준** — 행안부 매칭, 배송동 판정, 지도, 순번 |
| `docs/DISPATCH_SEQUENCE_RULES.md` | 기사 배정 규칙 + 배송 순번 규칙 (운영 코드 기준) |
| `docs/ADDRESS_TESTING_GUIDE.md` | 주소 검증 테스트 절차(운영 DB 실주소 추출) |
| `docs/DB_BACKUP_RESTORE.md` | 2시간 주기 자동 백업 구조·복구 절차 |
| `docs/JIBUN_FULL_LOAD_GUIDE.md` | 광주 지번 전체 적재(건물 60,529 기준) |

⚠️ 자동메모리와 충돌 시 **문서(SSOT)·코드 우선**. 「장날 3·8·13·18·23·28」·「11~15시 접수」는 **폐기된 규칙**이다.

## 작업환경
- node v24.15.0 / npm 11.12.1 / Python 3.11.9
- 도구: gh ✅ · gcloud ✅ · firebase ✅ · docker CLI ✅ (**데몬 미실행**)
- 의존성: frontend/mobile/desktop **node_modules 설치됨**, `backend/.venv` 존재 → **추가 설치 불필요**
- 시크릿(존재여부만): `.env` ✅ · `backend/.env` ✅ · `backend/.env.example` ✅ · `docker-compose.override.yml` ✅(로컬전용)
- 테스트: `backend/tests/` 4종 — `test_market_day.py`(신규) · `test_order_permissions.py`(신규) · `test_dispatch_service.py` · `test_route_service.py`

## 동기화
- 상태: **로컬 = 원격 = 운영 VM 모두 `6fa72c2`** (ahead 0 / behind 0 / 미커밋 0건)
- 마지막 fetch: 2026-09-20 12:38 KST
- 배포: frontend 단독 순차 빌드(`docker compose build frontend` → `up -d frontend`) 4회 수행, 전부 `DEPLOY_DONE`

## 리스크
- 🟢 **09-18 커밋 운영 반영 확인 완료 (2026-09-20 10:52 SSH 실측)** — VM `/opt/hanwool` HEAD = `33e5bc0`(로컬과 동일), `alembic current` = **`a2b3c4d5e678 (head)`**, 컨테이너 backend(healthy)·frontend 46시간 가동, db·redis·backup_db 6주 healthy
- 🟡 **gcloud active 계정·프로젝트 불일치** — active `ttong627@gmail.com` / project `ttong-hub`. hanwool 작업 시 `--account=ttong0627@gmail.com` 필수 (두 계정 모두 로그인됨)
- 🟡 **Docker Desktop 데몬 미실행** — 로컬 `docker compose` 사용 시 먼저 실행
- 🟢 운영 서버 정상(200) · git 최신 · 워킹트리 clean · gh 계정 일치 · 의존성 설치 완료 · 유일 클론 확인(I:)
