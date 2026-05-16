# 경안시장 집배송 프로젝트 — CLAUDE 지침

> 글로벌 규칙(~/.claude/CLAUDE.md)이 항상 우선 적용됩니다.
> 이 파일은 이 프로젝트 전용 추가 지침입니다.

---

## 프로젝트 개요

- **서비스명**: 경안시장 집배송 서비스
- **목적**: 경기도 광주시 지자체 + 경안시장상인회 협약 무료 복지 배송 (노인 고객 대상)
- **배송 지역**: 경안동, 송정동, 쌍령동, 탄벌동

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

- **외부 IP**: 34.64.146.168
- **API**: http://34.64.146.168:8000
- **Web**: http://34.64.146.168:80
- **API Docs**: http://34.64.146.168:8000/docs
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

## 테스트 계정

| 역할 | 전화번호 | 비밀번호 |
|------|----------|----------|
| 관리자 | 010-0000-0000 | admin1234 |
| 접수자 | 010-1111-1111 | receiver1234 |
| 기사 | 010-2222-2222 | driver1234 |

---

## 개발 원칙

1. **개인정보 보호 최우선**: 성명·전화번호·주소는 AES-256 암호화 필수
2. **노인 친화 UI**: 최소 버튼 수, 최대 글씨 크기 (모바일 고객 화면)
3. **오프라인 대응**: 기사 앱은 오늘 배송 목록 로컬 캐싱 필수
4. **SMS는 기기 발송**: expo-sms로 기사 핸드폰에서 직접 발송 (유료 API 미사용)

---

## 코드 배포 절차

```bash
# 로컬에서 수정 후
git add .
git commit -m "feat/fix/chore: 내용"
git push origin master

# VM 반영
gcloud compute ssh hanwool-server \
  --project=hanwool-delivery-2026 \
  --zone=asia-northeast3-a \
  --strict-host-key-checking=no \
  --command="cd /opt/hanwool && sudo git pull && sudo docker compose up -d --build"
```
