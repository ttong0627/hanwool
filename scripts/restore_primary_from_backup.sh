#!/bin/sh
set -eu

PRIMARY_HOST="${PRIMARY_HOST:-db}"
PRIMARY_DB="${POSTGRES_DB:-hanwool_db}"
PRIMARY_USER="${POSTGRES_USER:-hanwool}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
DUMP_FILE="${1:-$BACKUP_DIR/latest.dump}"

if [ "${CONFIRM_RESTORE:-}" != "RESTORE_HANWOOL_PRIMARY_DB" ]; then
  echo "Refusing to restore without CONFIRM_RESTORE=RESTORE_HANWOOL_PRIMARY_DB" >&2
  echo "Example:" >&2
  echo "  docker compose run --rm -e CONFIRM_RESTORE=RESTORE_HANWOOL_PRIMARY_DB db_backup sh /usr/local/bin/restore_primary_from_backup.sh /backups/latest.dump" >&2
  exit 1
fi

if [ ! -f "$DUMP_FILE" ]; then
  echo "Dump file not found: $DUMP_FILE" >&2
  exit 1
fi

export PGPASSWORD="$POSTGRES_PASSWORD"

echo "Restoring primary DB from $DUMP_FILE"
dropdb -h "$PRIMARY_HOST" -U "$PRIMARY_USER" --if-exists --force "$PRIMARY_DB"
createdb -h "$PRIMARY_HOST" -U "$PRIMARY_USER" "$PRIMARY_DB"
pg_restore \
  -h "$PRIMARY_HOST" \
  -U "$PRIMARY_USER" \
  -d "$PRIMARY_DB" \
  --no-owner \
  --no-privileges \
  "$DUMP_FILE"

echo "Primary DB restore completed"
