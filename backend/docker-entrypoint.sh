#!/bin/bash
set -e

# Wait for database to be ready
echo "Waiting for database to be ready..."
until python -c "
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()
from django.db import connection
connection.ensure_connection()
" 2>/dev/null; do
  echo "Database is unavailable - sleeping"
  sleep 1
done

echo "Database is ready!"

# Run migrations
echo "Running migrations..."
python manage.py migrate --noinput

# Execute the command passed to the container
echo "Starting application..."
exec "$@"

