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

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

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
    log "Dump created successfully: $BACKUP_FILE"
else
    log "ERROR: Failed to create dump"
    unset MYSQL_PWD
    rm -f "$BACKUP_FILE"
    exit 1
fi

# Compress the backup
log "Compressing backup..."
if gzip "$BACKUP_FILE"; then
    log "Backup compressed successfully: $BACKUP_FILE_COMPRESSED"
    BACKUP_SIZE=$(du -h "$BACKUP_FILE_COMPRESSED" | cut -f1)
    log "Backup size: $BACKUP_SIZE"
else
    log "ERROR: Failed to compress backup"
    exit 1
fi

# Clean up old backups
log "Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete
REMAINING_BACKUPS=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -type f | wc -l)
log "Cleanup complete. Remaining backups: $REMAINING_BACKUPS"

log "Backup completed successfully"
exit 0

