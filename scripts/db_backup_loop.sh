#!/bin/sh
set -eu

PRIMARY_HOST="${PRIMARY_HOST:-db}"
PRIMARY_DB="${POSTGRES_DB:-hanwool_db}"
PRIMARY_USER="${POSTGRES_USER:-hanwool}"
BACKUP_HOST="${BACKUP_HOST:-backup_db}"
BACKUP_DB="${BACKUP_POSTGRES_DB:-hanwool_backup_db}"
BACKUP_USER="${POSTGRES_USER:-hanwool}"
INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-7200}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"

mkdir -p "$BACKUP_DIR"

wait_for_postgres() {
  host="$1"
  db="$2"
  password="$3"
  export PGPASSWORD="$password"
  until pg_isready -h "$host" -U "$PRIMARY_USER" -d "$db" >/dev/null 2>&1; do
    echo "waiting for postgres host=$host db=$db"
    sleep 3
  done
}

run_backup() {
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  dump_path="$BACKUP_DIR/hanwool_db_$timestamp.dump"
  temp_dump_path="$dump_path.tmp"

  wait_for_postgres "$PRIMARY_HOST" "$PRIMARY_DB" "$POSTGRES_PASSWORD"
  wait_for_postgres "$BACKUP_HOST" "$BACKUP_DB" "$BACKUP_POSTGRES_PASSWORD"

  echo "backup started at $timestamp"

  export PGPASSWORD="$POSTGRES_PASSWORD"
  pg_dump \
    -h "$PRIMARY_HOST" \
    -U "$PRIMARY_USER" \
    -d "$PRIMARY_DB" \
    -Fc \
    --no-owner \
    --no-privileges \
    -f "$temp_dump_path"
  mv "$temp_dump_path" "$dump_path"
  chmod 600 "$dump_path"
  ln -sfn "$(basename "$dump_path")" "$BACKUP_DIR/latest.dump"

  export PGPASSWORD="$BACKUP_POSTGRES_PASSWORD"
  dropdb -h "$BACKUP_HOST" -U "$BACKUP_USER" --if-exists --force "$BACKUP_DB"
  createdb -h "$BACKUP_HOST" -U "$BACKUP_USER" "$BACKUP_DB"
  pg_restore \
    -h "$BACKUP_HOST" \
    -U "$BACKUP_USER" \
    -d "$BACKUP_DB" \
    --no-owner \
    --no-privileges \
    "$dump_path"

  find "$BACKUP_DIR" -type f -name 'hanwool_db_*.dump' -mtime +"$RETENTION_DAYS" -delete
  echo "backup completed dump=$dump_path restored_to=$BACKUP_HOST/$BACKUP_DB"
}

while true; do
  if ! run_backup; then
    echo "backup failed at $(date -u +%Y%m%dT%H%M%SZ)" >&2
  fi
  sleep "$INTERVAL_SECONDS"
done
