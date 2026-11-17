#!/usr/bin/env bash
# Backup a self-hosted ScopeProfit Docker Compose install: PostgreSQL dump plus
# an archive of the uploaded-files volume (STORAGE_ROOT=/data/storage).
# The author's public instance runs on managed services (Neon + Cloudflare KV),
# where the provider keeps the backups; this script is for docker-compose.yml
# self-hosting. See docs/production-runbook.md.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
PGUSER="${POSTGRES_USER:-scopeprofit}"
PGDB="${POSTGRES_DB:-scopeprofit}"
mkdir -p "$BACKUP_DIR"

docker compose exec -T postgres pg_dump -U "$PGUSER" -Fc "$PGDB" >"$BACKUP_DIR/db-$STAMP.dump"
docker compose exec -T api sh -c 'tar czf - -C /data/storage .' >"$BACKUP_DIR/storage-$STAMP.tar.gz"

cat <<EOF
Backups written:
  $BACKUP_DIR/db-$STAMP.dump
  $BACKUP_DIR/storage-$STAMP.tar.gz
Restore the database with:
  docker compose exec -T postgres pg_restore -U $PGUSER -d $PGDB --clean < $BACKUP_DIR/db-$STAMP.dump
Keep copies outside the host and rotate old files (suggested: 7 daily backups).
EOF
