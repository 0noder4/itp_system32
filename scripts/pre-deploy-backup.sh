#!/usr/bin/env bash
set -euo pipefail

# One-command pre-deploy safety backup (DB + mediafiles + emergency .xlsx)
COMPOSE_FILE="${COMPOSE_FILE:-compose.prod.yml}"

echo "Running pre-deploy DB & mediafiles backup via ${COMPOSE_FILE}..."
docker compose -f "$COMPOSE_FILE" exec -T backup /usr/local/bin/backup.sh --tag pre-deploy --no-sync

echo "Running pre-deploy emergency .xlsx & PNG map export via ${COMPOSE_FILE}..."
docker compose -f "$COMPOSE_FILE" exec -T scheduler python manage.py export_emergency_xlsx --tag pre-deploy

echo "Syncing pre-deploy backups to Google Drive (if enabled) via ${COMPOSE_FILE}..."
docker compose -f "$COMPOSE_FILE" exec -T backup /usr/local/bin/sync_gdrive.sh --all

echo "Pre-deploy backup completed."
