#!/bin/bash
set -e

# Function to check database connection with better error reporting
check_database() {
  python -c "
import os
import sys
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
try:
    django.setup()
    from django.db import connection
    connection.ensure_connection()
    sys.exit(0)
except Exception as e:
    print(f'Database connection error: {e}', file=sys.stderr)
    sys.exit(1)
" 2>&1
}

# Wait for database to be ready
echo "Waiting for database to be ready..."
MAX_RETRIES=60
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if check_database > /dev/null 2>&1; then
    echo "Database is ready!"
    break
  fi
  
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "ERROR: Failed to connect to database after $MAX_RETRIES attempts"
    echo "Database configuration:"
    echo "  HOST: ${DATABASE_HOST:-not set}"
    echo "  PORT: ${DATABASE_PORT:-not set}"
    echo "  NAME: ${DATABASE_NAME:-not set}"
    echo "  USER: ${DATABASE_USERNAME:-not set}"
    check_database
    exit 1
  fi
  
  echo "Database is unavailable - sleeping (attempt $RETRY_COUNT/$MAX_RETRIES)..."
  sleep 1
done

# Run migrations
echo "Running migrations..."
python manage.py migrate --noinput

# Collect static files (important for production with volumes)
# Skip in development if DEBUG=True to speed up startup
if [ "${DEBUG:-False}" != "True" ]; then
    echo "Collecting static files..."
    python manage.py collectstatic --noinput
fi

# Execute the command passed to the container
echo "Starting application..."
exec "$@"

