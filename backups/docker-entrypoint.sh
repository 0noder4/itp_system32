#!/bin/sh
set -e

# Set timezone if provided (default: Europe/Warsaw)
TZ="${TZ:-Europe/Warsaw}"
if [ -n "$TZ" ]; then
    if [ -f "/usr/share/zoneinfo/$TZ" ]; then
        rm -f /etc/localtime
        cp "/usr/share/zoneinfo/$TZ" /etc/localtime
        echo "$TZ" > /etc/timezone
    else
        echo "WARNING: Invalid timezone $TZ, using default" >&2
    fi
fi

BACKUP_DIR="${BACKUP_DIR:-/backups}"
mkdir -p "$BACKUP_DIR" "${BACKUP_DIR}/exports"
chown 1001:1001 "${BACKUP_DIR}/exports"
chmod 775 "${BACKUP_DIR}/exports"

# Create crontab file for supercronic
CRONTAB_FILE="/etc/crontab"
BACKUP_SCHEDULE="${BACKUP_SCHEDULE:-0 */6 * * *}"
MEDIA_BACKUP_ENABLED="${MEDIA_BACKUP_ENABLED:-true}"
MEDIA_BACKUP_SCHEDULE="${MEDIA_BACKUP_SCHEDULE:-30 2 * * *}"
GDRIVE_EXPORTS_SYNC_SCHEDULE="${GDRIVE_EXPORTS_SYNC_SCHEDULE:-5 3 * * *}"

{
    echo "${BACKUP_SCHEDULE} /usr/local/bin/backup.sh --db-only >> ${BACKUP_DIR}/cron.log 2>&1"
    if [ "$MEDIA_BACKUP_ENABLED" = "true" ]; then
        echo "${MEDIA_BACKUP_SCHEDULE} /usr/local/bin/backup.sh --media-only >> ${BACKUP_DIR}/cron.log 2>&1"
    fi
    echo "${GDRIVE_EXPORTS_SYNC_SCHEDULE} /usr/local/bin/sync_gdrive.sh --exports >> ${BACKUP_DIR}/cron.log 2>&1"
} > "$CRONTAB_FILE"
chmod 644 "$CRONTAB_FILE"

echo "Backup cron jobs configured (TZ=${TZ}):"
cat "$CRONTAB_FILE"

# Run initial backup if BACKUP_ON_START is set
if [ "${BACKUP_ON_START:-false}" = "true" ]; then
    echo "Running initial backup..."
    if ! /usr/local/bin/backup.sh; then
        echo "WARNING: Initial backup failed" >&2
    fi
fi

# Execute the command passed to the container
exec "$@"
