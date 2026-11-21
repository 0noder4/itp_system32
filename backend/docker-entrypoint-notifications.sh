#!/bin/bash
set -e

HOUR="${NOTIFICATIONS_HOUR:-9}"
MINUTE="${NOTIFICATIONS_MINUTE:-0}"
HOUR=$((10#$HOUR))
MINUTE=$((10#$MINUTE))

EXPORT_ENABLED="${EMERGENCY_EXPORT_ENABLED:-true}"
EXPORT_HOUR="${EMERGENCY_EXPORT_HOUR:-2}"
EXPORT_MINUTE="${EMERGENCY_EXPORT_MINUTE:-45}"
EXPORT_HOUR=$((10#$EXPORT_HOUR))
EXPORT_MINUTE=$((10#$EXPORT_MINUTE))

echo "Notification scheduler started (Europe/Warsaw ${HOUR}:$(printf '%02d' "$MINUTE"))"
if [ "$EXPORT_ENABLED" = "true" ]; then
  echo "Emergency .xlsx export scheduled (Europe/Warsaw ${EXPORT_HOUR}:$(printf '%02d' "$EXPORT_MINUTE"))"
fi

last_run_date=""
last_export_date=""

while true; do
  current_hour=$(TZ=Europe/Warsaw date +%H)
  current_minute=$(TZ=Europe/Warsaw date +%M)
  current_date=$(TZ=Europe/Warsaw date +%Y-%m-%d)
  current_hour=$((10#$current_hour))
  current_minute=$((10#$current_minute))

  if [ "$current_hour" -eq "$HOUR" ] && [ "$current_minute" -eq "$MINUTE" ] && [ "$last_run_date" != "$current_date" ]; then
    ok=1
    echo "Running send_invitation_expiry_reminders..."
    if ! python manage.py send_invitation_expiry_reminders; then
      echo "WARNING: send_invitation_expiry_reminders failed; will retry while still in the scheduled minute" >&2
      ok=0
    fi
    echo "Running auto_reject_missing_fire_certs..."
    if ! python manage.py auto_reject_missing_fire_certs; then
      echo "WARNING: auto_reject_missing_fire_certs failed; will retry while still in the scheduled minute" >&2
      ok=0
    fi
    if [ "$ok" -eq 1 ]; then
      last_run_date="$current_date"
    fi
  fi

  if [ "$EXPORT_ENABLED" = "true" ] && [ "$current_hour" -eq "$EXPORT_HOUR" ] && [ "$current_minute" -eq "$EXPORT_MINUTE" ] && [ "$last_export_date" != "$current_date" ]; then
    last_export_date="$current_date"
    echo "Running export_emergency_xlsx..."
    if ! python manage.py export_emergency_xlsx; then
      echo "WARNING: export_emergency_xlsx failed (email alert sent if configured)" >&2
    fi
  fi

  sleep 20
done
