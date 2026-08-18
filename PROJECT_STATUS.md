# 📋 PROJECT STATUS — hanwool (경안시장 집배송)
> 자동 생성: /확인 스킬 · 갱신 2026-08-18 12:26 KST

## ✅ 해결됨 (2026-08-18 12:35 KST 복구 완료)
- **복구 확인**: 형이 Cloudflare(Ttong627@gmail.com 계정)에서 A 레코드 `ga → 34.64.146.168` 추가(프록시 주황=프록싱됨). 실측: `/health` 200 · `/` 200 · API 422(정상 검증 응답). 장날 접수 마감(16:30) 전 복구.
- 프록싱됨(주황) 상태로 운영 중 — 문제 시 해당 레코드 편집→프록시 토글 끄면 기존 직결 방식 복귀.
- 남은 후속: ①`narami`(A → 34.50.53.232, 프록싱) 재등록 안내함 ②wssc.kr 존에 SPF/DMARC TXT 부재 — 네이버웍스 메일 발신 신뢰도 이슈, 별도 처리 예정.

### 사고 기록 (원인 보존용)
- **ga.wssc.kr DNS 레코드 소실 — 서비스 도메인 접속 불가** (8/18 장날, 접수시간 중 발견)
  - 증상: KT DNS·Google DNS·Cloudflare 권위서버(michael/dawn.ns.cloudflare.com) 모두 **NXDOMAIN**
  - **근본 원인 (2026-08-18 규명)**: 2026-08-14 yyplus/wssc-unified 보안 하드닝 작업(`i:\ttong_project\yyplus\wssc-unified\docs\보안_인프라_하드닝_2026-08.md`)으로 **wssc.kr DNS를 후이즈(whois.co.kr, ns1~4.whoisdomain.kr)에서 Cloudflare 무료로 이전**했는데, 이전 계획의 레코드 목록(wssc.kr·www·narami·MX·TXT)에 **hanwool용 `ga` 레코드가 없어 누락**됨. 실측: 루트·www·admin·mail·MX(네이버웍스 2건)는 생존, **`ga`·`narami` 누락**.
  - 서버는 무죄: VM `hanwool-server` RUNNING · IP `34.64.146.168` 직접 호출 시 `/health` **200** · 인증서 유효(CN=ga.wssc.kr, 만료 2026-10-13)
  - **복구 방법**: https://dash.cloudflare.com 로그인(2026-08-14경 새로 가입한 계정) → wssc.kr 존 → DNS → Records → A 레코드 추가: 이름 `ga`, 값 `34.64.146.168`, **Proxy 끔(DNS only, 회색 구름)** — VM의 Let's Encrypt 인증서를 그대로 쓰는 기존 구성 유지
  - 같은 김에 `narami`(A → 34.50.53.232, 계획서상 Proxied)도 누락 여부 판단 후 복구 권장. 후이즈에서 이전 전 캡처해 둔 DNS 스크린샷과 대조하면 다른 누락도 확인 가능.
  - 레코드 추가 즉시 복구됨 (서버·인증서 모두 정상 대기 중)
  - 로그인 이메일을 모르면: Gmail(ttong627·ttong0627 각각)에서 `from:cloudflare.com` 검색 → 8/14경 가입·인증 메일이 온 계정이 정답. 비번 분실 시 dash.cloudflare.com "Forgot password"로 재설정.

## 식별
- GitHub: **ttong0627/hanwool** (계정 세트: ttong0627) · 브랜치 `master`
- GCP 프로젝트: **hanwool-delivery-2026** (VM `hanwool-server` / `asia-northeast3-a` / 외부IP `34.64.146.168`)
- 로컬 경로: `d:\TTong_newproject\hanwool` ← **새 경로** (이전 `i:\ttong_project\hanwool`에서 이동, 새 클론)

## 배포 환경
- 접속 URL: https://ga.wssc.kr · API `https://ga.wssc.kr/api/v1` · Health `https://ga.wssc.kr/health`
- 헬스체크(2026-08-18 12:22): 도메인 **NXDOMAIN(접속 불가)** / IP 직접 `https://34.64.146.168/health`(Host: ga.wssc.kr) **200** → 서버 정상, DNS만 문제
- 호스팅: GCE VM e2-small + Docker Compose (nginx + backend + postgres + redis + 백업컨테이너)
- 빌드: `frontend` → `npm run build` / `desktop` → `npm run build:win` / `mobile` → Expo(로컬 Gradle APK)
- 배포: ⚠️ **`docker compose up -d --build`(전체 동시 빌드) 금지 — 2026-08-08 이 명령으로 VM이 멈췄다.**
  e2-small은 메모리 2GB. Postgres·Redis·backend가 떠 있는 상태에서 frontend 빌드까지 동시에 돌리면 OOM으로 SSH까지 죽는다.
  **반드시 한 서비스씩 순차 빌드:**
  ```bash
  git add . && git commit -m "..." && git push origin master
  gcloud compute ssh hanwool-server --project=hanwool-delivery-2026 --zone=asia-northeast3-a \
    --account=ttong0627@gmail.com \
    --command="cd /opt/hanwool && sudo git pull && \
      sudo docker compose build backend  && sudo docker compose up -d backend && \
      sudo docker compose build frontend && sudo docker compose up -d frontend"
  ```
  긴 빌드는 `setsid nohup ... > /tmp/deploy.log 2>&1 &`로 띄우고 로그 폴링.
- 스왑: **2GB `/swapfile` 상시 활성** (2026-08-08 추가, `/etc/fstab` 등록, `vm.swappiness=20`). 끄지 말 것.
- ⚠️ **gcloud active 계정 = `ttong627@gmail.com`(권한 없음)**: hanwool 명령엔 반드시 `--account=ttong0627@gmail.com` 붙이거나 `gcloud config set account ttong0627@gmail.com`
- 커밋·푸시: gh active 계정 `ttong0627` = repo owner → **일치(전환 불필요)**

## 앱 구성
| 앱/패키지 | 경로 | 역할 | 스택 |
|---|---|---|---|
| backend | `backend/` | API 서버, 주소검증, 배차·순번 | Python 3.11 · FastAPI · SQLAlchemy · Alembic · PostgreSQL · Redis |
| hanwool-frontend v1.0.0 | `frontend/` | 관리자·접수 웹 | React · Vite · TypeScript · Tailwind |
| hanwool-mobile v1.0.0 | `mobile/` | 기사/고객 앱 | React Native · Expo |
| hanwool-desktop v1.0.2 | `desktop/` | PC앱 | Electron |
| 운영 스크립트 | `scripts/` | DB 백업 루프, GCS 오프사이트 동기화, 복구 | Bash |

## 마지막 작업
- `538eef0` 2026-08-08 15:15 `fix(address): 오염된 address_cache가 다른 번지를 되돌려주는 경로 차단`
- 경과: **10일** (2026-08-18 기준, date 명령 계산)
- 요약: 8/8에 주소 캐시 오염 차단(`backend/app/services/address_resolver.py`) + 유사도 매칭 번지 강제 치환 차단 + VM OOM 사고 대응(순차 빌드 규칙·스왑 2GB) 3건 처리 후 중단

## 규칙 문서 (SSOT — 작업 전 필독)
| 문서 | 내용 |
|---|---|
| `AGENTS.md` | 프로젝트 공통 작업 규칙(언어·필수참조·주소/DB·배송동 18개·배차 판단) |
| `CLAUDE.md` | 장날(3·8·13·18·23·28)·접수시간·역할 5단계·메뉴 정의·드림팀 분업 |
| `docs/ADDRESS_STRATEGY.md` | **주소 최우선 기준** — 행안부 매칭, 배송동 판정, 지도, 순번 |
| `docs/DISPATCH_SEQUENCE_RULES.md` | 기사 배정 규칙 + 배송 순번 규칙 (운영 코드 기준) |
| `docs/ADDRESS_TESTING_GUIDE.md` | 주소 검증 테스트 절차(운영 DB 실주소 추출) |
| `docs/DB_BACKUP_RESTORE.md` | 2시간 주기 자동 백업 구조·복구 절차 |
| `docs/JIBUN_FULL_LOAD_GUIDE.md` | 광주 지번 전체 적재 가이드 |

⚠️ 자동메모리와 충돌 시 **문서(SSOT) 우선**. 접수 마감은 커밋 `3983448`로 **15:00 → 16:30 연장**됨(CLAUDE.md 본문은 15:00 표기 — 코드 기준이 정본).

## 작업환경
- node v24.18.0 / npm 11.16.0 / Python 3.12.10
- 도구: gh ✅ · gcloud ✅ · firebase ✅ · docker CLI ✅(데몬 미실행)
- 의존성: **frontend·desktop·mobile `npm install` 자동 실행 완료(2026-08-18)** — esbuild 0.21.5 바이너리·electron.exe 존재 확인
- `backend/.venv` **없음** (새 클론이라 미생성 — 로컬 백엔드 개발 시에만 필요, 운영은 VM Docker)
- 시크릿(존재여부만): `backend/.env` **없음**(`.env.example`만 존재) · 로컬전용 `docker-compose.override.yml`·`frontend/nginx.local.conf` **없음** — 이전 PC(i: 드라이브)에만 있던 파일들, 로컬 서버 구동 시 재작성 필요

## 동기화
- 상태: **이미 최신** (behind 0 / ahead 0, 워킹트리 clean) · HEAD `538eef0`
- 마지막 fetch: 2026-08-18 12:22 KST (owner 토큰 주입, 전역 계정 불변)

## 리스크
- ✅ ~~ga.wssc.kr DNS 소실~~ → **2026-08-18 12:35 복구 완료** (Cloudflare A 레코드 재등록, 프록싱됨). 이제 hanwool 도메인은 Cloudflare(Ttong627@gmail.com 계정)의 wssc.kr 존에서 관리됨을 기억할 것
- 🔴 **gcloud active 계정 불일치** — `ttong627@gmail.com`은 hanwool-delivery-2026 권한 없음. 배포·SSH 시 `--account=ttong0627@gmail.com` 필수
- 🟡 **wssc.kr 존 SPF/DMARC TXT 부재** — 8/14 DNS 이전 때 TXT 미이전 추정. 네이버웍스 발신 메일 스팸 분류 위험 (후속 처리 예정)
- 🟡 **backend/.env·로컬전용 설정 없음** — 새 클론(d:)이라 로컬 백엔드/도커 구동 불가. 이전 i: 드라이브 파일 복사 또는 재작성 필요
- 🟡 **Docker Desktop 미실행** — 로컬 docker compose 사용 시 먼저 실행
- 🟢 VM RUNNING · 서버 200 · 인증서 2026-10-13까지 유효 · git 최신 · gh 계정 일치 · npm 의존성 설치 완료
