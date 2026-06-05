#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# GCS 오프사이트 백업 동기화 — VM 호스트에서 cron으로 실행
#
# 로컬 백업(db_backups 볼륨)을 GCS 버킷으로 복제해 VM 디스크 손상 시에도
# 백업본이 살아남도록 한다. GCE VM의 기본 서비스 계정 인증(gcloud)을
# 그대로 사용하므로 별도 키 파일이 필요 없다.
#
# ── 최초 1회 설정 ────────────────────────────────────────────────────────────
#   1) 버킷 생성(서울 리전):
#        gsutil mb -l asia-northeast3 gs://hanwool-db-offsite
#   2) 라이프사이클(30일 후 삭제, 선택):
#        gsutil lifecycle set <(echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":30}}]}') gs://hanwool-db-offsite
#   3) VM 기본 서비스계정에 버킷 쓰기 권한 확인(보통 기본 SA로 충분).
#   4) cron 등록(2시간마다, 백업 생성 후 시점에 맞춤):
#        crontab -e
#        27 */2 * * * /opt/hanwool/scripts/gcs_offsite_sync.sh >> /var/log/hanwool-gcs-sync.log 2>&1
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# 대상 버킷 (환경변수로 덮어쓰기 가능)
BUCKET="${BACKUP_GCS_BUCKET:-gs://hanwool-db-offsite}"

# db_backups 도커 볼륨의 호스트 경로 (compose 프로젝트명 hanwool 기준)
SRC="${BACKUP_SRC_DIR:-/var/lib/docker/volumes/hanwool_db_backups/_data}"

ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }

if ! command -v gsutil >/dev/null 2>&1; then
  echo "[gcs-sync $(ts)] ERROR: gsutil 없음 — google-cloud-sdk 설치 필요" >&2
  exit 1
fi

if [ ! -d "$SRC" ]; then
  echo "[gcs-sync $(ts)] ERROR: 백업 소스 디렉토리 없음: $SRC" >&2
  echo "  실제 경로 확인: docker volume inspect hanwool_db_backups --format '{{ .Mountpoint }}'" >&2
  exit 1
fi

echo "[gcs-sync $(ts)] rsync 시작: $SRC -> $BUCKET/db_backups/"
gsutil -m rsync -r "$SRC" "$BUCKET/db_backups/"
echo "[gcs-sync $(ts)] 완료"
