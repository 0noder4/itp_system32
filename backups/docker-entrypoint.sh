#!/bin/sh
set -e

# Set timezone if provided
if [ -n "$TZ" ]; then
    cp /usr/share/zoneinfo/$TZ /etc/localtime
    echo $TZ > /etc/timezone
fi

# Create crontab file
CRONTAB_FILE="/var/spool/cron/crontabs/root"

# Default backup schedule (daily at 2 AM)
BACKUP_SCHEDULE="${BACKUP_SCHEDULE:-0 2 * * *}"

# Build crontab entry
CRONTAB_ENTRY="${BACKUP_SCHEDULE} /usr/local/bin/backup.sh >> /backups/cron.log 2>&1"

# Write crontab
echo "$CRONTAB_ENTRY" > "$CRONTAB_FILE"
chmod 600 "$CRONTAB_FILE"

echo "Backup cron job configured: $BACKUP_SCHEDULE"
echo "Crontab entry: $CRONTAB_ENTRY"
crontab -l || true

# Run initial backup if BACKUP_ON_START is set
if [ "${BACKUP_ON_START:-false}" = "true" ]; then
    echo "Running initial backup..."
    /usr/local/bin/backup.sh
fi

# Execute the command passed to the container
exec "$@"



