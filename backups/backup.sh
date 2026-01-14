#!/bin/sh
set -e

# Database backup script for MySQL
# Usage: ./backup.sh [database_name] [backup_dir] [retention_days]

DB_NAME="${DATABASE_NAME:-${1}}"
BACKUP_DIR="${BACKUP_DIR:-${2:-/backups}}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-${3:-30}}"
DB_HOST="${DATABASE_HOST:-db}"
DB_USER="${DATABASE_USER:-root}"
DB_PASSWORD="${DATABASE_PASSWORD:-${DATABASE_ROOT_PASSWORD}}"
DB_PORT="${DATABASE_PORT:-3306}"

# Validate required variables
if [ -z "$DB_NAME" ]; then
    echo "ERROR: DATABASE_NAME is not set" >&2
    exit 1
fi

if [ -z "$DB_PASSWORD" ]; then
    echo "ERROR: DATABASE_PASSWORD or DATABASE_ROOT_PASSWORD is not set" >&2
    exit 1
fi

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Ensure backup.log exists for error redirection
touch "${BACKUP_DIR}/backup.log"

# Generate timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql"
BACKUP_FILE_COMPRESSED="${BACKUP_FILE}.gz"

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "${BACKUP_DIR}/backup.log"
}

log "Starting backup for database: $DB_NAME"

# Perform MySQL dump
log "Creating dump..."
# Use MYSQL_PWD environment variable to avoid password in process list
export MYSQL_PWD="$DB_PASSWORD"
if mysqldump \
    -h "$DB_HOST" \
    -P "$DB_PORT" \
    -u "$DB_USER" \
    --single-transaction \
    --quick \
    --lock-tables=false \
    --routines \
    --triggers \
    "$DB_NAME" > "$BACKUP_FILE" 2>> "${BACKUP_DIR}/backup.log"; then
    unset MYSQL_PWD
    # Verify the backup file was created and has content
    if [ ! -f "$BACKUP_FILE" ] || [ ! -s "$BACKUP_FILE" ]; then
        log "ERROR: Backup file was not created or is empty"
        unset MYSQL_PWD
        rm -f "$BACKUP_FILE"
        exit 1
    fi
    log "Dump created successfully: $BACKUP_FILE"
else
    log "ERROR: Failed to create dump"
    unset MYSQL_PWD
    rm -f "$BACKUP_FILE"
    exit 1
fi

# Compress the backup
log "Compressing backup..."
if [ -f "$BACKUP_FILE" ] && gzip "$BACKUP_FILE"; then
    log "Backup compressed successfully: $BACKUP_FILE_COMPRESSED"
    BACKUP_SIZE=$(du -h "$BACKUP_FILE_COMPRESSED" | cut -f1)
    log "Backup size: $BACKUP_SIZE"
else
    log "ERROR: Failed to compress backup"
    exit 1
fi

# Clean up old backups
log "Cleaning up backups older than $RETENTION_DAYS days..."
if [ -d "$BACKUP_DIR" ]; then
    find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
    REMAINING_BACKUPS=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -type f 2>/dev/null | wc -l)
    log "Cleanup complete. Remaining backups: $REMAINING_BACKUPS"
else
    log "WARNING: Backup directory $BACKUP_DIR does not exist for cleanup"
fi

log "Backup completed successfully"
exit 0

