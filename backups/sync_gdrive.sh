#!/usr/bin/env bash
set -euo pipefail

# Sync local backups, emergency .xlsx exports, PNG maps, and mediafiles to Google Shared Drive via rclone.
# Usage: sync_gdrive.sh [--db] [--media] [--exports] [--all] [--check]

RUN_DB=false
RUN_MEDIA=false
RUN_EXPORTS=false
CHECK_ONLY=false
CURRENT_STAGE="inicjalizacja"

usage() {
    cat <<'EOF'
Usage: sync_gdrive.sh [--db] [--media] [--exports] [--all] [--check]
  --db       Sync MySQL .sql.gz dumps to gdrive:baza-sql
  --media    Sync unpacked mediafiles (excluding drafts/backups/mapy) with --backup-dir versioning
  --exports  Sync emergency .xlsx exports, najnowsze/ folder, and PNG maps to mediafiles/mapy
  --all      Sync --db, --media, and --exports
  --check    Verify rclone configuration, service account file, and Shared Drive access
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --db)
            RUN_DB=true
            shift
            ;;
        --media)
            RUN_MEDIA=true
            shift
            ;;
        --exports)
            RUN_EXPORTS=true
            shift
            ;;
        --all)
            RUN_DB=true
            RUN_MEDIA=true
            RUN_EXPORTS=true
            shift
            ;;
        --check)
            CHECK_ONLY=true
            shift
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

if [[ "$CHECK_ONLY" != "true" && "$RUN_DB" != "true" && "$RUN_MEDIA" != "true" && "$RUN_EXPORTS" != "true" ]]; then
    echo "ERROR: Specify at least one of --db, --media, --exports, --all, or --check." >&2
    usage >&2
    exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-/backups}"
MEDIA_DIR="${MEDIA_DIR:-/mediafiles}"
DB_NAME="${DATABASE_NAME:-}"
DB_HOST="${DATABASE_HOST:-db}"
DB_USER="${DATABASE_USER:-root}"
DB_PASSWORD="${DATABASE_PASSWORD:-${DATABASE_ROOT_PASSWORD:-}}"
DB_PORT="${DATABASE_PORT:-3306}"
PROJECT_NAME="${PROJECT_NAME:-itp_system32}"
ADMIN_EMAIL_CACHE="${BACKUP_DIR}/.admin_email"
LOG_FILE="${BACKUP_DIR}/backup.log"

GDRIVE_SYNC_ENABLED="${GDRIVE_SYNC_ENABLED:-false}"
GDRIVE_SHARED_DRIVE_ID="${GDRIVE_SHARED_DRIVE_ID:-}"
GDRIVE_SERVICE_ACCOUNT_FILE="${GDRIVE_SERVICE_ACCOUNT_FILE:-/secrets/gdrive-sa.json}"
GDRIVE_MEDIA_ARCHIVE_RETENTION_DAYS="${GDRIVE_MEDIA_ARCHIVE_RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"
touch "$LOG_FILE"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [gdrive] $1" | tee -a "$LOG_FILE"
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

trim_log() {
    local f="$1"
    local max_lines=5000
    if [[ -f "$f" ]]; then
        local count
        count=$(wc -l < "$f" 2>/dev/null || echo 0)
        if [[ "$count" -gt "$max_lines" ]]; then
            tail -n "$max_lines" "$f" > /tmp/gdrive_trim.tmp
            cat /tmp/gdrive_trim.tmp > "$f"
            rm -f /tmp/gdrive_trim.tmp
        fi
    fi
}

on_error() {
    local exit_code=$?
    local line_no="${1:-?}"
    trap - ERR
    set +e
    unset MYSQL_PWD || true

    log "ERROR: Google Drive sync failed at stage '${CURRENT_STAGE}' (line ${line_no}, exit ${exit_code})."

    if [[ "$CHECK_ONLY" != "true" ]]; then
        local alert_to
        alert_to=$(resolve_alert_email)
        if [[ -n "$alert_to" ]]; then
            local subject="[ITP BACKUP ALERT] Błąd syncu Google Drive (${PROJECT_NAME}) - ${CURRENT_STAGE}"
            local tail_logs
            tail_logs=$(tail -n 40 "$LOG_FILE" 2>/dev/null || true)
            {
                echo "Automatyczna synchronizacja backupów na Google Drive (${PROJECT_NAME}) zakończyła się błędem."
                echo ""
                echo "Etap: ${CURRENT_STAGE}"
                echo "Linia skryptu: ${line_no}"
                echo "Kod wyjścia: ${exit_code}"
                echo "Czas: $(date '+%Y-%m-%d %H:%M:%S %Z')"
                echo ""
                echo "Ostatnie wpisy z backup.log:"
                echo "${tail_logs}"
            } | /usr/local/bin/send_alert_email.py --to "$alert_to" --subject "$subject" || true
        else
            log "WARNING: Failure alert email not sent (Settings.system_admin_email not configured or cached yet)."
        fi
    fi

    trim_log "$LOG_FILE"
    exit "$exit_code"
}

trap 'on_error $LINENO' ERR

if [[ "${GDRIVE_SYNC_ENABLED,,}" != "true" ]]; then
    if [[ "$CHECK_ONLY" == "true" ]]; then
        echo "Google Drive sync is disabled (GDRIVE_SYNC_ENABLED=${GDRIVE_SYNC_ENABLED}). Set GDRIVE_SYNC_ENABLED=true in .env to enable." >&2
        exit 1
    fi
    log "Skipping sync (GDRIVE_SYNC_ENABLED=${GDRIVE_SYNC_ENABLED})."
    exit 0
fi

CURRENT_STAGE="walidacja-konfiguracji"
if [[ -z "$GDRIVE_SHARED_DRIVE_ID" ]]; then
    echo "ERROR: GDRIVE_SHARED_DRIVE_ID is empty." >&2
    exit 1
fi
if [[ ! -r "$GDRIVE_SERVICE_ACCOUNT_FILE" || ! -s "$GDRIVE_SERVICE_ACCOUNT_FILE" ]]; then
    echo "ERROR: Service account JSON file not found or unreadable: ${GDRIVE_SERVICE_ACCOUNT_FILE}" >&2
    exit 1
fi

export RCLONE_CONFIG=/dev/null
export RCLONE_CONFIG_GDRIVE_TYPE=drive
export RCLONE_CONFIG_GDRIVE_SCOPE=drive
export RCLONE_CONFIG_GDRIVE_SERVICE_ACCOUNT_FILE="$GDRIVE_SERVICE_ACCOUNT_FILE"
export RCLONE_CONFIG_GDRIVE_TEAM_DRIVE="$GDRIVE_SHARED_DRIVE_ID"
export RCLONE_CONFIG_GDRIVE_USE_TRASH=true

RCLONE_COMMON_FLAGS=(
    --fast-list
    --transfers 4
    --checkers 8
    --retries 3
    --low-level-retries 5
    --contimeout 30s
    --timeout 300s
    --stats-one-line
    --stats 0
)

run_rclone() {
    rclone "$@" "${RCLONE_COMMON_FLAGS[@]}" >> "$LOG_FILE" 2>&1
}

if [[ "$CHECK_ONLY" == "true" ]]; then
    CURRENT_STAGE="test-polaczenia"
    echo "Checking Google Shared Drive access (ID=${GDRIVE_SHARED_DRIVE_ID})..."
    rclone lsd gdrive: --contimeout 30s --timeout 60s
    echo "OK: Google Drive connection and permissions verified."
    exit 0
fi

exec 8>/tmp/gdrive_sync.lock
if ! flock -w 600 8; then
    log "ERROR: Timed out waiting for /tmp/gdrive_sync.lock"
    exit 1
fi

if [[ "$RUN_DB" == "true" ]]; then
    CURRENT_STAGE="sync-baza-sql"
    shopt -s nullglob
    db_files=("${BACKUP_DIR}"/*.sql.gz)
    shopt -u nullglob
    if [[ ${#db_files[@]} -eq 0 ]]; then
        log "WARNING: No .sql.gz dumps found in ${BACKUP_DIR}; skipping gdrive:baza-sql sync."
    else
        log "Syncing database dumps (${#db_files[@]} files) to gdrive:baza-sql..."
        run_rclone sync "$BACKUP_DIR" "gdrive:baza-sql" \
            --include "/*.sql.gz" \
            --exclude "*"
        log "Database dumps synced to gdrive:baza-sql."
    fi
fi

if [[ "$RUN_MEDIA" == "true" ]]; then
    CURRENT_STAGE="sync-mediafiles"
    if [[ ! -d "$MEDIA_DIR" ]]; then
        log "WARNING: Media directory ${MEDIA_DIR} does not exist; skipping gdrive:mediafiles sync."
    else
        media_count=$(find "$MEDIA_DIR" -type f \
            ! -path "${MEDIA_DIR}/sheet_file_drafts/*" \
            ! -path "${MEDIA_DIR}/sheet_file_backups/*" \
            ! -path "${MEDIA_DIR}/mapy/*" \
            | head -n 1 | wc -l)
        if [[ "$media_count" -eq 0 ]]; then
            log "WARNING: No eligible mediafiles found in ${MEDIA_DIR}; skipping gdrive:mediafiles sync."
        else
            archive_day=$(date +%Y-%m-%d)
            log "Syncing mediafiles to gdrive:mediafiles (archive dir: mediafiles-archiwum-zmian/${archive_day})..."
            run_rclone sync "$MEDIA_DIR" "gdrive:mediafiles" \
                --exclude "/sheet_file_drafts/**" \
                --exclude "/sheet_file_backups/**" \
                --exclude "/mapy/**" \
                --backup-dir "gdrive:mediafiles-archiwum-zmian/${archive_day}"
            log "Mediafiles synced to gdrive:mediafiles."

            CURRENT_STAGE="sprzatanie-archiwum-zmian"
            if rclone lsf "gdrive:" --dirs-only --contimeout 30s --timeout 60s 2>/dev/null | grep -qx "mediafiles-archiwum-zmian/"; then
                run_rclone delete "gdrive:mediafiles-archiwum-zmian" \
                    --min-age "${GDRIVE_MEDIA_ARCHIVE_RETENTION_DAYS}d"
                run_rclone rmdirs "gdrive:mediafiles-archiwum-zmian" --leave-root
            fi
        fi
    fi
fi

if [[ "$RUN_EXPORTS" == "true" ]]; then
    CURRENT_STAGE="sync-excele-i-mapy"
    EXPORTS_ROOT="${BACKUP_DIR}/exports"
    if [[ ! -d "$EXPORTS_ROOT" ]]; then
        log "WARNING: Exports directory ${EXPORTS_ROOT} does not exist; skipping exports sync."
    else
        latest_export_dir=$(find "$EXPORTS_ROOT" -mindepth 1 -maxdepth 1 -type d ! -name '.tmp_*' -printf '%f\n' \
            | grep -E '^[0-9]{8}_[0-9]{6}' | sort -r | head -n 1 || true)
        if [[ -z "$latest_export_dir" ]]; then
            log "WARNING: No timestamped export folders found in ${EXPORTS_ROOT}; skipping exports sync."
        else
            latest_full="${EXPORTS_ROOT}/${latest_export_dir}"
            log "Syncing emergency .xlsx history to gdrive:excele-ratunkowe (latest=${latest_export_dir})..."
            run_rclone sync "$EXPORTS_ROOT" "gdrive:excele-ratunkowe" \
                --exclude ".tmp_*/**" \
                --exclude "/najnowsze/**"
            run_rclone sync "$latest_full" "gdrive:excele-ratunkowe/najnowsze"

            if [[ -d "${latest_full}/mapy" ]] && compgen -G "${latest_full}/mapy/*.png" >/dev/null; then
                log "Syncing latest hall map PNGs to gdrive:mediafiles/mapy..."
                run_rclone sync "${latest_full}/mapy" "gdrive:mediafiles/mapy" \
                    --include "*.png" \
                    --exclude "*"
            fi
            log "Emergency exports and maps synced to Google Drive."
        fi
    fi
fi

trim_log "$LOG_FILE"
exit 0
