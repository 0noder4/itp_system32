#!/bin/bash
set -e

HOUR="${NOTIFICATIONS_HOUR:-9}"
MINUTE="${NOTIFICATIONS_MINUTE:-0}"
HOUR=$((10#$HOUR))
MINUTE=$((10#$MINUTE))

echo "Invitation reminder scheduler started (Europe/Warsaw ${HOUR}:$(printf '%02d' "$MINUTE"))"

last_run_date=""

while true; do
  current_hour=$(TZ=Europe/Warsaw date +%H)
  current_minute=$(TZ=Europe/Warsaw date +%M)
  current_date=$(TZ=Europe/Warsaw date +%Y-%m-%d)
  current_hour=$((10#$current_hour))
  current_minute=$((10#$current_minute))

  if [ "$current_hour" -eq "$HOUR" ] && [ "$current_minute" -eq "$MINUTE" ] && [ "$last_run_date" != "$current_date" ]; then
    echo "Running send_invitation_expiry_reminders..."
    if python manage.py send_invitation_expiry_reminders; then
      last_run_date="$current_date"
    else
      echo "WARNING: send_invitation_expiry_reminders failed; will retry while still in the scheduled minute" >&2
    fi
  fi
  sleep 20
done
