# 📋 PROJECT STATUS — hanwool (경안시장 집배송)
> 자동 생성: /확인 스킬 · 갱신 2026-08-08 13:12 KST

## 식별
- GitHub: **ttong0627/hanwool** (계정 세트: ttong0627) · 브랜치 `master`
- GCP 프로젝트: **hanwool-delivery-2026** (VM `hanwool-server` / `asia-northeast3-a`)
- 로컬 경로: `i:\ttong_project\hanwool`

## 배포 환경
- 접속 URL: https://ga.wssc.kr · API `https://ga.wssc.kr/api/v1` · Health `https://ga.wssc.kr/health`
- **헬스체크 결과(2026-08-08 13:12): `/health` 200 (0.06s), `/` 200 → 운영 정상**
- 호스팅: GCE VM e2-small + Docker Compose (nginx + backend + postgres + redis + 백업컨테이너)
- 빌드: `frontend` → `npm run build` / `desktop` → `npm run build:win` / `mobile` → Expo(로컬 Gradle APK)
- 배포:
  ```bash
  git add . && git commit -m "..." && git push origin master
  gcloud compute ssh hanwool-server --project=hanwool-delivery-2026 --zone=asia-northeast3-a \
    --command="cd /opt/hanwool && sudo git pull && sudo docker compose up -d --build"
  ```
- ⚠️ **배포 전 gcloud 계정 전환 필수**: 현재 active `ttong627@gmail.com`은 hanwool-delivery-2026 **권한 없음**(compute.instances.list 거부 확인). → `gcloud config set account ttong0627@gmail.com` 또는 명령마다 `--account=ttong0627@gmail.com`
- 커밋·푸시: gh active 계정 `ttong0627` = repo owner → **일치(전환 불필요)**

## 앱 구성
| 앱/패키지 | 경로 | 역할 | 스택 |
|---|---|---|---|
| backend | `backend/` | API 서버, 주소검증, 배차·순번 | Python 3.11 · FastAPI · SQLAlchemy · Alembic · PostgreSQL · Redis |
| hanwool-frontend v1.0.0 | `frontend/` | 관리자·접수 웹 (dev/build/preview) | React · Vite · TypeScript · Tailwind |
| hanwool-mobile v1.0.0 | `mobile/` | 기사/고객 앱 (start/android/ios) | React Native · Expo |
| hanwool-desktop v1.0.2 | `desktop/` | PC앱 (build:win/build:mac) | Electron |
| 운영 스크립트 | `scripts/` | DB 백업 루프, GCS 오프사이트 동기화, 복구 | Bash |

## 마지막 작업
- `2f38f05` 2026-06-15 16:32 `chore: 미사용 변수 geo_source_map 제거 (순번 리팩터 잔재 정리)`
- **경과: 53일** (직전 로컬 HEAD는 `44fbfad` 2026-06-08 → 이번 /확인에서 15커밋 FF 최신화)
- 요약: **주소 인프라 대공사 + 배송순번 버그 정리** — ①광주 지번 완전적재 & 건물좌표 Kakao 일괄 지오코딩 ②주소 미매칭 Kakao 폴백 + 담당자 **주소확인(AddressReview)** 워크플로 신설 ③18개 동 외 주소도 저장 허용 ④직접입력 중복주문 방지(`client_row_id` 멱등키) ⑤배송순번 당일 전역 고유·연속 부여(중복·인플레이션 방지)

## 규칙 문서 (SSOT — 작업 전 필독)
| 문서 | 내용 |
|---|---|
| `AGENTS.md` | 프로젝트 공통 작업 규칙(언어·필수참조·주소/DB·배송동 18개·배차 40/60건 판단) |
| `CLAUDE.md` | 장날(3·8·13·18·23·28)·접수시간·역할 5단계·메뉴 정의·드림팀 분업 |
| `docs/ADDRESS_STRATEGY.md` | **주소 최우선 기준** — 행안부 매칭, 배송동 판정, 지도, 순번 |
| `docs/DISPATCH_SEQUENCE_RULES.md` | 기사 배정 규칙 + 배송 순번 규칙 (운영 코드 기준, 2026-06-07) |
| `docs/ADDRESS_TESTING_GUIDE.md` | 주소 검증 테스트 절차(운영 DB 실주소 추출) |
| `docs/DB_BACKUP_RESTORE.md` | 2시간 주기 자동 백업 구조·복구 절차 |
| `docs/JIBUN_FULL_LOAD_GUIDE.md` | 광주 지번 전체 적재(8,927 → 건물 60,529 기준 확대) |

⚠️ 자동메모리와 충돌 시 **문서(SSOT) 우선**. 접수 마감은 커밋 `3983448`로 **15:00 → 16:30 연장**됨(CLAUDE.md 본문은 15:00 표기 — 코드 기준이 정본).

## 작업환경
- node v24.15.0 / npm 11.12.1 / Python 3.11.9
- 도구: gh ✅ · gcloud ✅ · firebase ✅ · docker CLI ✅
- 의존성: frontend/mobile/desktop **node_modules 설치됨**, `backend/.venv` 존재 → **추가 설치 불필요**
- 시크릿(존재여부만): `.env` ✅ · `backend/.env` ✅ · `docker-compose.yml` ✅ · `docker-compose.override.yml` ✅(로컬전용)
- ⚠️ **Docker Desktop 데몬 미실행** — 로컬 `docker compose` 사용 시 Docker Desktop 먼저 실행

## 동기화
- 상태: **FF 최신화 완료** (behind 15 → 0, ahead 0) · `44fbfad` → `2f38f05`
- 마지막 fetch: 2026-08-08 13:10 KST
- 처리: 로컬 untracked 7건이 원격 커밋과 **내용 100% 동일**(CRLF/LF 차이뿐)임을 대조 확인 후 백업→제거→FF 머지
  - 백업: `C:\Users\ttong\AppData\Local\Temp\claude\i--ttong-project-hanwool\1b8f02e4-3930-4f1b-bdeb-94c5f5128147\scratchpad\untracked_backup_20260808`
- 잔여 untracked 2건(로컬 전용, 보존): `docker-compose.override.yml`, `frontend/nginx.local.conf`

## 리스크
- 🔴 **gcloud active 계정 불일치** — `ttong627@gmail.com`은 hanwool-delivery-2026 권한 없음. 배포 전 `ttong0627@gmail.com`로 전환 필수 (두 계정 모두 로그인은 되어 있음)
- 🟡 **Docker Desktop 미실행** — 로컬 백엔드 기동 불가 상태
- 🟡 **53일 공백** — 운영 DB/서버 상태와 로컬 코드 인식 차이 가능. 주소·순번 관련 작업 전 `docs/DISPATCH_SEQUENCE_RULES.md` 재확인 권장
- 🟢 운영 서버 정상(200), git 동기화 최신, 의존성 설치 완료, GitHub 계정 일치
