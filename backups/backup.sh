#!/usr/bin/env bash
set -euo pipefail

# Database + mediafiles backup script with dynamic disk guard and failure-only SMTP alerts.
# Usage: ./backup.sh [--db-only | --media-only] [--tag <label>]

RUN_DB=true
RUN_MEDIA=true
RAW_TAG=""
CURRENT_STAGE="inicjalizacja"
TMP_FILES=()

usage() {
    cat <<'EOF'
Usage: backup.sh [--db-only | --media-only] [--tag <label>]
  --db-only     Run only MySQL backup
  --media-only  Run only mediafiles backup
  --tag <label> Add a tag suffix (e.g. pre-deploy, pre-restore)
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --db-only)
            RUN_MEDIA=false
            shift
            ;;
        --media-only)
            RUN_DB=false
            shift
            ;;
        --tag)
            if [[ $# -lt 2 || -z "${2:-}" ]]; then
                echo "ERROR: --tag requires a value" >&2
                exit 1
            fi
            RAW_TAG="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "ERROR: Unknown argument: $1" >&2
            usage >&2
            exit 1
            ;;
    esac
done

if [[ "$RUN_DB" != "true" && "$RUN_MEDIA" != "true" ]]; then
    echo "ERROR: Cannot combine --db-only and --media-only" >&2
    exit 1
fi

TAG=""
if [[ -n "$RAW_TAG" ]]; then
    TAG=$(printf '%s' "$RAW_TAG" | sed -E 's/[^A-Za-z0-9_-]+/-/g; s/^[-_]+//; s/[-_]+$//' | cut -c1-40)
    if [[ -z "$TAG" ]]; then
        echo "ERROR: Tag '$RAW_TAG' contains no valid characters" >&2
        exit 1
    fi
fi

DB_NAME="${DATABASE_NAME:-}"
DB_HOST="${DATABASE_HOST:-db}"
DB_USER="${DATABASE_USER:-root}"
DB_PASSWORD="${DATABASE_PASSWORD:-${DATABASE_ROOT_PASSWORD:-}}"
DB_PORT="${DATABASE_PORT:-3306}"

BACKUP_DIR="${BACKUP_DIR:-/backups}"
MEDIA_DIR="${MEDIA_DIR:-/mediafiles}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
MEDIA_RETENTION_DAYS="${MEDIA_BACKUP_RETENTION_DAYS:-14}"
MIN_FREE_GB="${BACKUP_MIN_FREE_GB:-5}"
PROJECT_NAME="${PROJECT_NAME:-itp_system32}"
ADMIN_EMAIL_CACHE="${BACKUP_DIR}/.admin_email"
LOG_FILE="${BACKUP_DIR}/backup.log"

mkdir -p "$BACKUP_DIR"
touch "$LOG_FILE"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

fail() {
    log "ERROR: $1"
    return 1
}

is_valid_alert_email() {
    local email
    email=$(printf '%s' "${1:-}" | tr -d '\r\n' | xargs)
    [[ -n "$email" ]] || return 1
    [[ "${email,,}" != "admin@example.com" ]] || return 1
    [[ "$email" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]
}

query_live_admin_email() {
    if [[ -z "$DB_NAME" || -z "$DB_PASSWORD" ]]; then
        return 0
    fi
    MYSQL_PWD="$DB_PASSWORD" mysql \
        -h "$DB_HOST" \
        -P "$DB_PORT" \
        -u "$DB_USER" \
        -N -B \
        --connect-timeout=5 \
        "$DB_NAME" \
        -e "SELECT system_admin_email FROM companies_settings ORDER BY id LIMIT 1" 2>/dev/null \
        | head -n 1 \
        | tr -d '\r\n' \
        | xargs || true
}

refresh_admin_email_cache() {
    local email
    email=$(query_live_admin_email)
    if is_valid_alert_email "$email"; then
        printf '%s\n' "$email" > "${ADMIN_EMAIL_CACHE}.tmp"
        chmod 600 "${ADMIN_EMAIL_CACHE}.tmp"
        mv -f "${ADMIN_EMAIL_CACHE}.tmp" "$ADMIN_EMAIL_CACHE"
    fi
}

resolve_alert_email() {
    local email=""
    email=$(query_live_admin_email)
    if is_valid_alert_email "$email"; then
        printf '%s' "$email"
        return 0
    fi
    if [[ -f "$ADMIN_EMAIL_CACHE" ]]; then
        email=$(head -n 1 "$ADMIN_EMAIL_CACHE" | tr -d '\r\n' | xargs || true)
        if is_valid_alert_email "$email"; then
            printf '%s' "$email"
            return 0
        fi
    fi
    if is_valid_alert_email "${BACKUP_ALERT_EMAIL:-}"; then
        printf '%s' "${BACKUP_ALERT_EMAIL}" | tr -d '\r\n' | xargs
        return 0
    fi
    return 0
}

cleanup_tmp_files() {
    local f
    for f in "${TMP_FILES[@]:-}"; do
        if [[ -n "$f" && -e "$f" ]]; then
            rm -f "$f" || true
        fi
    done
    rm -f "${ADMIN_EMAIL_CACHE}.tmp" || true
}

trim_log() {
    local f="$1"
    local max_lines=5000
    if [[ -f "$f" ]]; then
        local count
        count=$(wc -l < "$f" 2>/dev/null || echo 0)
        if [[ "$count" -gt "$max_lines" ]]; then
            tail -n "$max_lines" "$f" > /tmp/backup_trim.tmp
            cat /tmp/backup_trim.tmp > "$f"
            rm -f /tmp/backup_trim.tmp
        fi
    fi
}

on_error() {
    local exit_code=$?
    local line_no="${1:-?}"
    trap - ERR
    set +e
    unset MYSQL_PWD || true

    cleanup_tmp_files

    local df_line
    df_line=$(df -h "$BACKUP_DIR" 2>/dev/null | tail -n 1 || true)
    log "ERROR: Backup failed at stage '${CURRENT_STAGE}' (line ${line_no}, exit ${exit_code}). Disk: ${df_line}"

    local alert_to
    alert_to=$(resolve_alert_email)
    if [[ -n "$alert_to" ]]; then
        local subject="[ITP BACKUP ALERT] Błąd backupu (${PROJECT_NAME}) - ${CURRENT_STAGE}"
        local tail_logs
        tail_logs=$(tail -n 40 "$LOG_FILE" 2>/dev/null || true)
        {
            echo "Automatyczny backup systemu ITP (${PROJECT_NAME}) zakończył się błędem."
            echo ""
            echo "Etap: ${CURRENT_STAGE}"
            echo "Linia skryptu: ${line_no}"
            echo "Kod wyjścia: ${exit_code}"
            echo "Czas: $(date '+%Y-%m-%d %H:%M:%S %Z')"
            echo "Dysk (${BACKUP_DIR}): ${df_line}"
            echo ""
            echo "Ostatnie wpisy z backup.log:"
            echo "${tail_logs}"
        } | /usr/local/bin/send_alert_email.py --to "$alert_to" --subject "$subject" || true
    else
        log "WARNING: Failure alert email not sent (Settings.system_admin_email not configured or cached yet)."
    fi

    trim_log "$LOG_FILE"
    exit "$exit_code"
}

trap 'on_error $LINENO' ERR

get_free_mb() {
    df -Pm "$BACKUP_DIR" | awk 'NR==2 {print $4}'
}

assert_min_free_space() {
    local required_mb="$1"
    local context_label="$2"
    local free_mb
    free_mb=$(get_free_mb)
    if [[ -z "$free_mb" || "$free_mb" -lt "$required_mb" ]]; then
        log "ERROR: Insufficient disk space for ${context_label}: free=${free_mb:-0}MB, required>=${required_mb}MB"
        return 1
    fi
}

# Serialize concurrent runs (cron vs manual pre-deploy)
exec 9>/tmp/backup.lock
if ! flock -w 300 9; then
    log "ERROR: Timed out waiting for /tmp/backup.lock"
    exit 1
fi

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
SUFFIX=""
if [[ -n "$TAG" ]]; then
    SUFFIX="_${TAG}"
fi
MIN_FREE_MB=$((MIN_FREE_GB * 1024))

log "Starting backup (db=${RUN_DB}, media=${RUN_MEDIA}, tag=${TAG:-none})"

# Refresh cached admin email silently whenever MySQL is reachable (never sends email on success)
refresh_admin_email_cache || true

if [[ "$RUN_DB" == "true" ]]; then
    CURRENT_STAGE="walidacja-db"
    if [[ -z "$DB_NAME" ]]; then
        fail "DATABASE_NAME is not set"
    fi
    if [[ -z "$DB_PASSWORD" ]]; then
        fail "DATABASE_PASSWORD or DATABASE_ROOT_PASSWORD is not set"
    fi

    assert_min_free_space "$MIN_FREE_MB" "MySQL dump"

    DB_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}${SUFFIX}.sql.gz"
    DB_SQL_TMP="${DB_FILE%.gz}.sql.tmp"
    DB_GZ_TMP="${DB_FILE}.tmp"
    TMP_FILES+=("$DB_SQL_TMP" "$DB_GZ_TMP")

    CURRENT_STAGE="dump-db"
    log "Creating MySQL dump..."
    export MYSQL_PWD="$DB_PASSWORD"
    mysqldump \
        -h "$DB_HOST" \
        -P "$DB_PORT" \
        -u "$DB_USER" \
        --single-transaction \
        --quick \
        --lock-tables=false \
        --routines \
        --triggers \
        --default-character-set=utf8mb4 \
        "$DB_NAME" > "$DB_SQL_TMP" 2>> "$LOG_FILE"
    unset MYSQL_PWD

    if [[ ! -s "$DB_SQL_TMP" ]]; then
        fail "MySQL dump file is empty"
    fi

    CURRENT_STAGE="kompresja-i-test-db"
    gzip -c "$DB_SQL_TMP" > "$DB_GZ_TMP"
    rm -f "$DB_SQL_TMP"
    gzip -t "$DB_GZ_TMP"
    mv -f "$DB_GZ_TMP" "$DB_FILE"

    DB_SIZE=$(du -h "$DB_FILE" | cut -f1)
    log "Database backup ready: ${DB_FILE} (${DB_SIZE})"

    # Refresh again after confirmed DB connectivity
    refresh_admin_email_cache || true
fi

if [[ "$RUN_MEDIA" == "true" ]]; then
    CURRENT_STAGE="walidacja-mediafiles"
    if [[ ! -d "$MEDIA_DIR" ]]; then
        fail "Media directory does not exist: ${MEDIA_DIR}"
    fi

    MEDIA_SIZE_MB=$(du -sm "$MEDIA_DIR" | awk '{print $1}')
    REQUIRED_MEDIA_FREE_MB=$((MEDIA_SIZE_MB + MIN_FREE_MB))
    assert_min_free_space "$REQUIRED_MEDIA_FREE_MB" "mediafiles archive (${MEDIA_SIZE_MB}MB + ${MIN_FREE_GB}GB buffer)"

    MEDIA_FILE="${BACKUP_DIR}/mediafiles_${TIMESTAMP}${SUFFIX}.tar.gz"
    MEDIA_TMP="${MEDIA_FILE}.tmp"
    TMP_FILES+=("$MEDIA_TMP")

    CURRENT_STAGE="archiwizacja-mediafiles"
    log "Archiving mediafiles (${MEDIA_SIZE_MB}MB)..."
    set +e
    tar --numeric-owner -czf "$MEDIA_TMP" -C "$MEDIA_DIR" . 2>> "$LOG_FILE"
    TAR_RC=$?
    set -e

    if [[ "$TAR_RC" -eq 1 ]]; then
        log "WARNING: tar reported file changed during read (exit 1); verifying archive integrity..."
    elif [[ "$TAR_RC" -ge 2 ]]; then
        fail "tar failed with exit code ${TAR_RC}"
    fi

    CURRENT_STAGE="weryfikacja-mediafiles"
    if [[ ! -s "$MEDIA_TMP" ]]; then
        fail "Media archive is empty"
    fi
    tar -tzf "$MEDIA_TMP" >/dev/null
    mv -f "$MEDIA_TMP" "$MEDIA_FILE"

    MEDIA_ARCHIVE_SIZE=$(du -h "$MEDIA_FILE" | cut -f1)
    log "Mediafiles backup ready: ${MEDIA_FILE} (${MEDIA_ARCHIVE_SIZE})"
fi

CURRENT_STAGE="sprzatanie-retencji"
if [[ "$RUN_DB" == "true" && -n "$DB_NAME" ]]; then
    find "$BACKUP_DIR" -maxdepth 1 -name "${DB_NAME}_*.sql.gz" -type f -mtime +"$RETENTION_DAYS" -delete
fi
if [[ "$RUN_MEDIA" == "true" ]]; then
    find "$BACKUP_DIR" -maxdepth 1 -regextype posix-extended \
        -regex ".*/mediafiles_[0-9]{8}_[0-9]{6}\\.tar\\.gz" \
        -type f -mtime +"$MEDIA_RETENTION_DAYS" -delete
    find "$BACKUP_DIR" -maxdepth 1 -regextype posix-extended \
        -regex ".*/mediafiles_[0-9]{8}_[0-9]{6}_.+\\.tar\\.gz" \
        -type f -mtime +"$RETENTION_DAYS" -delete
fi

trim_log "$LOG_FILE"
trim_log "${BACKUP_DIR}/cron.log"

log "Backup completed successfully"
exit 0
