#!/bin/sh
# Daily backup for the license server's sqlite DB (1-Eng-C: fleet-wide
# dependency, needs its own backup separate from any host-level assumption).
# Run via cron: 0 3 * * * /opt/.../license-server/backup.sh
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
DB="${LICENSE_SERVER_DB:-$DIR/license.db}"
BACKUP_DIR="${LICENSE_SERVER_BACKUP_DIR:-$DIR/backups}"

mkdir -p "$BACKUP_DIR"
cp "$DB" "$BACKUP_DIR/license-$(date +%Y%m%d-%H%M%S).db"
find "$BACKUP_DIR" -name "license-*.db" -mtime +30 -delete

echo "Backed up $DB -> $BACKUP_DIR ($(date))"
