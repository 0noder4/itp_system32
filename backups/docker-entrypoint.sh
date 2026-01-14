#!/bin/sh
set -e

# Set timezone if provided
if [ -n "$TZ" ]; then
    if [ -f "/usr/share/zoneinfo/$TZ" ]; then
        # Remove existing /etc/localtime (file or symlink) before setting new timezone
        rm -f /etc/localtime
        cp /usr/share/zoneinfo/$TZ /etc/localtime
        echo $TZ > /etc/timezone
    else
        echo "WARNING: Invalid timezone $TZ, using default" >&2
    fi
fi

# Create crontab file for supercronic
CRONTAB_FILE="/etc/crontab"

# Default backup schedule (daily at 2 AM)
BACKUP_SCHEDULE="${BACKUP_SCHEDULE:-0 2 * * *}"

# Build crontab entry (supercronic uses standard crontab format)
CRONTAB_ENTRY="${BACKUP_SCHEDULE} /usr/local/bin/backup.sh >> /backups/cron.log 2>&1"

# Write crontab
echo "$CRONTAB_ENTRY" > "$CRONTAB_FILE"
chmod 644 "$CRONTAB_FILE"

echo "Backup cron job configured: $BACKUP_SCHEDULE"
echo "Crontab entry: $CRONTAB_ENTRY"
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





