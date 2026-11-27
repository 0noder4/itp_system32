#!/usr/bin/env bash
set -euo pipefail

# Safe restore script for MySQL backups and mediafiles archives.
# Usage:
#   restore.sh --list
#   restore.sh [--db <file.sql.gz>] [--media <file.tar.gz>] [--yes] [--skip-safety-backup]

BACKUP_DIR="${BACKUP_DIR:-/backups}"
MEDIA_RESTORE_DIR="${MEDIA_RESTORE_DIR:-/mediafiles_rw}"
MEDIA_CHOWN="${MEDIA_CHOWN:-true}"
MEDIA_UID="${MEDIA_UID:-1001}"
MEDIA_GID="${MEDIA_GID:-1001}"

DB_NAME="${DATABASE_NAME:-}"
DB_HOST="${DATABASE_HOST:-db}"
DB_USER="${DATABASE_USER:-root}"
DB_PASSWORD="${DATABASE_PASSWORD:-${DATABASE_ROOT_PASSWORD:-}}"
DB_PORT="${DATABASE_PORT:-3306}"

LIST_ONLY=false
DB_INPUT=""
MEDIA_INPUT=""
ASSUME_YES=false
SKIP_SAFETY_BACKUP=false

usage() {
    cat <<'EOF'
Usage: restore.sh [options]
  --list                 List available DB dumps, mediafiles archives, and .xlsx exports
  --db <file>            Restore MySQL dump (.sql.gz, path or filename in /backups)
  --media <file>         Restore mediafiles archive (.tar.gz) into $MEDIA_RESTORE_DIR (/mediafiles_rw)
  --yes                  Skip interactive confirmation prompt
  --skip-safety-backup   Skip automatic pre-restore safety backup
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --list)
            LIST_ONLY=true
            shift
            ;;
        --db)
            if [[ $# -lt 2 || -z "${2:-}" ]]; then
                echo "ERROR: --db requires a file path or filename" >&2
                exit 1
            fi
            DB_INPUT="$2"
            shift 2
            ;;
        --media)
            if [[ $# -lt 2 || -z "${2:-}" ]]; then
                echo "ERROR: --media requires a file path or filename" >&2
                exit 1
            fi
            MEDIA_INPUT="$2"
            shift 2
            ;;
        --yes)
            ASSUME_YES=true
            shift
            ;;
        --skip-safety-backup)
            SKIP_SAFETY_BACKUP=true
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

list_backups() {
    echo "=== Database dumps (${BACKUP_DIR}) ==="
    find "$BACKUP_DIR" -maxdepth 1 -name "*.sql.gz" -type f -printf "%TY-%Tm-%Td %TH:%TM  %8s  %f\n" 2>/dev/null | sort -r || true
    echo ""
    echo "=== Mediafiles archives (${BACKUP_DIR}) ==="
    find "$BACKUP_DIR" -maxdepth 1 -name "mediafiles_*.tar.gz" -type f -printf "%TY-%Tm-%Td %TH:%TM  %8s  %f\n" 2>/dev/null | sort -r || true
    echo ""
    echo "=== Emergency .xlsx exports (${BACKUP_DIR}/exports) ==="
    if [[ -d "${BACKUP_DIR}/exports" ]]; then
        find "${BACKUP_DIR}/exports" -mindepth 1 -maxdepth 1 -type d ! -name '.tmp_*' -printf "%TY-%Tm-%Td %TH:%TM  %f/\n" 2>/dev/null | sort -r || true
    fi
}

resolve_backup_file() {
    local input="$1"
    if [[ -f "$input" ]]; then
        printf '%s' "$input"
        return 0
    fi
    if [[ -f "${BACKUP_DIR}/${input}" ]]; then
        printf '%s' "${BACKUP_DIR}/${input}"
        return 0
    fi
    echo "ERROR: Backup file not found: ${input}" >&2
    return 1
}

if [[ "$LIST_ONLY" == "true" ]]; then
    list_backups
    exit 0
fi

if [[ -z "$DB_INPUT" && -z "$MEDIA_INPUT" ]]; then
    echo "ERROR: Specify --list, --db <file>, and/or --media <file>." >&2
    usage >&2
    exit 1
fi

DB_FILE=""
if [[ -n "$DB_INPUT" ]]; then
    DB_FILE=$(resolve_backup_file "$DB_INPUT")
    if [[ -z "$DB_NAME" || -z "$DB_PASSWORD" ]]; then
        echo "ERROR: DATABASE_NAME and DATABASE_PASSWORD/DATABASE_ROOT_PASSWORD must be set for --db restore." >&2
        exit 1
    fi
    echo "Verifying database dump: ${DB_FILE}"
    gzip -t "$DB_FILE"
fi

MEDIA_FILE=""
if [[ -n "$MEDIA_INPUT" ]]; then
    MEDIA_FILE=$(resolve_backup_file "$MEDIA_INPUT")
    if [[ ! -d "$MEDIA_RESTORE_DIR" || ! -w "$MEDIA_RESTORE_DIR" ]]; then
        echo "ERROR: Writable media restore directory not found at ${MEDIA_RESTORE_DIR}." >&2
        echo "Run with a temporary read-write mount of the mediafiles volume, e.g.:" >&2
        echo "  docker compose -f compose.prod.yml run --rm -v itp_system32_mediafiles:/mediafiles_rw backup /usr/local/bin/restore.sh --media $(basename "$MEDIA_FILE")" >&2
        exit 1
    fi
    echo "Verifying mediafiles archive: ${MEDIA_FILE}"
    tar -tzf "$MEDIA_FILE" >/dev/null
fi

if [[ "$ASSUME_YES" != "true" ]]; then
    echo ""
    echo "WARNING: This operation will OVERWRITE live data:"
    [[ -n "$DB_FILE" ]] && echo "  - MySQL database '${DB_NAME}' from: ${DB_FILE}"
    [[ -n "$MEDIA_FILE" ]] && echo "  - Mediafiles directory '${MEDIA_RESTORE_DIR}' from: ${MEDIA_FILE}"
    echo ""
    if [[ -n "$DB_FILE" ]]; then
        read -r -p "Type '${DB_NAME}' or 'RESTORE' to confirm: " confirm
        if [[ "$confirm" != "$DB_NAME" && "$confirm" != "RESTORE" ]]; then
            echo "Restore cancelled."
            exit 1
        fi
    else
        read -r -p "Type 'RESTORE' to confirm: " confirm
        if [[ "$confirm" != "RESTORE" ]]; then
            echo "Restore cancelled."
            exit 1
        fi
    fi
fi

if [[ "$SKIP_SAFETY_BACKUP" != "true" ]]; then
    echo "Creating automatic pre-restore safety backup..."
    if [[ -n "$DB_FILE" && -n "$MEDIA_FILE" ]]; then
        /usr/local/bin/backup.sh --tag pre-restore --no-sync
    elif [[ -n "$DB_FILE" ]]; then
        /usr/local/bin/backup.sh --db-only --tag pre-restore --no-sync
    else
        /usr/local/bin/backup.sh --media-only --tag pre-restore --no-sync
    fi
fi

if [[ -n "$DB_FILE" ]]; then
    echo "Restoring MySQL database '${DB_NAME}' from ${DB_FILE}..."
    export MYSQL_PWD="$DB_PASSWORD"
    gunzip -c "$DB_FILE" | mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME"
    unset MYSQL_PWD
    echo "Database restore complete."
fi

if [[ -n "$MEDIA_FILE" ]]; then
    echo "Restoring mediafiles into ${MEDIA_RESTORE_DIR} from ${MEDIA_FILE}..."
    find "$MEDIA_RESTORE_DIR" -mindepth 1 -delete
    tar --numeric-owner -xzf "$MEDIA_FILE" -C "$MEDIA_RESTORE_DIR"
    if [[ "$MEDIA_CHOWN" == "true" ]]; then
        chown -R "${MEDIA_UID}:${MEDIA_GID}" "$MEDIA_RESTORE_DIR"
    fi
    echo "Mediafiles restore complete."
fi

echo "Restore finished successfully."
