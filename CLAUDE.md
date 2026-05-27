# 경안시장 집배송 프로젝트 — CLAUDE 지침

> 글로벌 규칙(~/.claude/CLAUDE.md)이 항상 우선 적용됩니다.
> 이 파일은 이 프로젝트 전용 추가 지침입니다.

---

## 프로젝트 개요

- **서비스명**: 경안시장 집배송 서비스
- **목적**: 경기도 광주시 지자체 + 경안시장상인회 협약 무료 복지 배송 (노인 고객 대상)
- **배송 지역**: 경안동, 송정동, 쌍령동, 탄벌동

---

## 핵심 도메인 규칙 (모든 작업 시 반드시 준수)

### 작업 전 필수 참조
- 프로젝트 공통 작업 규칙: `AGENTS.md`
- 주소·배송동·지도·순번·배차 DB 활용 기준: `docs/ADDRESS_STRATEGY.md`
- 주소 검증 테스트 절차: `docs/ADDRESS_TESTING_GUIDE.md`
- 주소/배차 관련 기능을 수정할 때는 위 문서를 먼저 읽고, 규칙과 다르게 구현하지 않는다.

### 장날 (Market Day)
- **장날**: 매월 3, 8, 13, 18, 23, 28일 고정
- **접수 시간**: 장날 11:00 ~ 15:00 (서버·클라이언트 모두 강제)
- **배송 시작**: 15:00 이후 접수된 주문 기준 배송 진행
- **비장날**: 주문 접수 불가, 모든 접수 버튼 비활성화

```python
# 반드시 이 로직을 서버에서 검증 (클라이언트만으로는 부족)
def is_market_day(date) -> bool:
    return date.day in [3, 8, 13, 18, 23, 28]

def is_reception_open() -> bool:
    now = datetime.now(KST)
    return is_market_day(now) and 11 <= now.hour < 15
```

### 수혜 자격 조건
- **나이**: 65세 이상 (birth_year 기준 서버에서 계산)
- **거주지**: 경안동, 송정동, 쌍령동, 탄벌동 4개 동 주민만 해당
- **서비스**: 완전 무료 (비용 발생 없음)

### DB 핵심 규칙
- User 테이블: `birth_year` 필드 필수 (65세 검증용, AES-256 암호화 대상)
- Order 테이블: `market_date` 필드 필수 (장날별 통계·감사 추적)
- 생년월일은 개인정보 → AES-256 암호화 필수
- 주소는 문자열만 저장하지 않고 행안부 표준키(`adm_cd`, `rn_mgt_sn`, `bd_mgt_sn`, `buld_mnnm`, `buld_slno`)와 매칭 상태를 함께 저장
- 배송동 판정은 `delivery_zones`, 주소 보정은 `address_overrides`, 검증 이력은 `address_resolution_logs`, 배차 이력은 `dispatch_runs`/`dispatch_run_items`를 기준으로 함

---

## 기술 스택 (고정)

| 영역 | 스택 |
|------|------|
| 백엔드 | Python FastAPI (async) |
| DB | PostgreSQL + SQLAlchemy + Alembic |
| 암호화 | AES-256 (개인정보 필드), bcrypt 3.2.2 (비밀번호) |
| 인증 | JWT AccessToken 30분 + RefreshToken 7일 |
| 캐시 | Redis |
| 프론트 | React + Vite + TypeScript + Tailwind CSS |
| 모바일 | React Native + Expo |
| 데스크탑 | Electron |
| 배포 | GCE VM e2-small (asia-northeast3-a) + Docker Compose |
| 실시간 | WebSocket |

---

## 서버 정보

- **Domain**: https://ga.wssc.kr
- **API**: https://ga.wssc.kr/api/v1
- **Health**: https://ga.wssc.kr/health
- **API Docs**: production disabled
- **GCP 프로젝트**: hanwool-delivery-2026
- **VM 이름**: hanwool-server
- **GitHub**: https://github.com/ttong0627/hanwool

---

## 역할 체계 (5단계)

| 역할 | 설명 |
|------|------|
| super_admin | DB 접근, 개인정보 폐기, 계정 관리 |
| admin | 전체 운영 (통계, 민원, 기사 관리) |
| receiver | 주문 접수 + 고객 이력 전체 조회 |
| driver | 전체 주문 조회 + 주문 전달 + 배송 루트 |
| customer | 본인 주문/추적 (모바일) |

---

## 메뉴 구조 및 기능 정의

### Admin / Super Admin
| 메뉴 | 핵심 기능 |
|------|----------|
| 대시보드 | 장날 여부·D-Day·접수 시간 카운트다운, 실시간 주문 현황, 기사 위치 |
| 주문 관리 | 장날별 필터, 전체 주문 CRUD, 기사 배정 |
| 배송 확인 | 실시간 배송 상태 추적 |
| 기사 관리 | 기사 계정·배송 이력 관리 |
| 고객 관리 | 65세 이상 배지, 생년월일·동 정보 포함 고객 DB |
| 민원 관리 | 민원 접수·처리·이력 |
| 통계·보고서 | 장날별 통계, 동별 배송량, 기사 실적 |
| 개인정보 | 개인정보 열람·폐기 (super_admin 전용) |
| 사용자 관리 | 시스템 계정 관리 |

### Receiver (접수 담당)
| 메뉴 | 핵심 기능 |
|------|----------|
| 주문 접수 | 장날·시간 잠금, 65세 자격 경고, 고객 자동완성 |
| 오늘 명단 | 당일 접수 목록 전체 조회 |
| 라벨 출력 | QR 코드 포함 배송 라벨 PDF 출력 |

---

## 개발 원칙

1. **개인정보 보호 최우선**: 성명·전화번호·주소·생년월일은 AES-256 암호화 필수
2. **노인 친화 UI**: 최소 버튼 수, 최대 글씨 크기 (모바일 고객 화면)
3. **오프라인 대응**: 기사 앱은 오늘 배송 목록 로컬 캐싱 필수
4. **SMS는 기기 발송**: expo-sms로 기사 핸드폰에서 직접 발송 (유료 API 미사용)
5. **장날 로직은 서버 강제**: 접수 시간·장날 검증은 반드시 백엔드 API에서도 수행
6. **65세 검증은 birth_year 기준**: 클라이언트 경고 + 서버 검증 병행

---

## 드림팀 분업 규칙 (이 프로젝트 전용)

| 작업 유형 | 담당 |
|----------|------|
| 장날·접수시간 로직 | 브루마 구현, 코코 보안 검토 |
| 고객 DB 변경 (생년월일 등) | 빌 설계, 미아 무결성 검토 |
| 대시보드·UI 개편 | 홀리 설계, 브루마 구현 |
| API 신규 엔드포인트 | 안토니 설계, 브루마 구현, 코코 보안 검토 |
| 통계·보고서 | 빌 쿼리, 브루마 구현 |

---

## 테스트 계정

| 역할 | 전화번호 | 비밀번호 |
|------|----------|----------|
| Demo accounts | seed.py requires ALLOW_DEMO_SEED=true and SEED_* password environment variables |

---

## 코드 배포 절차

```bash
# 로컬에서 수정 후
git add .
git commit -m "feat/fix/chore: 내용"
git push origin master

# VM 반영 (Windows PowerShell)
gcloud compute ssh hanwool-server --project=hanwool-delivery-2026 --zone=asia-northeast3-a --command="cd /opt/hanwool && sudo git pull && sudo docker compose up -d --build"
```
