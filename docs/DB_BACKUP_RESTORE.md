# 한울 DB 백업/복구 운영 가이드

## 자동 백업 구조

- `backup_db`: 운영 DB와 분리된 PostgreSQL 백업 DB
- `db_backup`: 2시간마다 운영 DB를 덤프하고 `backup_db`에 최신 상태로 복원하는 작업 컨테이너
- `db_backups`: 덤프 파일 보관 Docker volume

기본 주기와 보관 기간:

```bash
BACKUP_INTERVAL_SECONDS=7200
BACKUP_RETENTION_DAYS=14
```

백업 흐름:

```text
운영 DB(db/hanwool_db)
→ pg_dump custom format
→ /backups/hanwool_db_YYYYMMDDTHHMMSSZ.dump 저장
→ /backups/latest.dump 갱신
→ 백업 DB(backup_db/hanwool_backup_db) 재생성 후 pg_restore
```

## 백업 상태 확인

```bash
cd /opt/hanwool
sudo docker compose ps
sudo docker compose logs --tail=80 db_backup
sudo docker compose exec db_backup ls -lh /backups
```

## 백업 DB 직접 확인

```bash
cd /opt/hanwool
sudo docker compose exec backup_db psql -U hanwool -d hanwool_backup_db -c "\dt"
```

## 운영 DB 복구

복구는 운영 DB를 덮어쓰는 작업이므로 반드시 서비스 중단/공지 후 실행한다.

최신 백업으로 복구:

```bash
cd /opt/hanwool
sudo docker compose run --rm \
  -e CONFIRM_RESTORE=RESTORE_HANWOOL_PRIMARY_DB \
  db_backup sh /usr/local/bin/restore_primary_from_backup.sh /backups/latest.dump
sudo docker compose up -d
```

특정 시점 백업으로 복구:

```bash
cd /opt/hanwool
sudo docker compose run --rm \
  -e CONFIRM_RESTORE=RESTORE_HANWOOL_PRIMARY_DB \
  db_backup sh /usr/local/bin/restore_primary_from_backup.sh /backups/hanwool_db_YYYYMMDDTHHMMSSZ.dump
sudo docker compose up -d
```

복구 후 확인:

```bash
curl -fsS http://127.0.0.1:8000/health
sudo docker compose logs --tail=80 backend
```
