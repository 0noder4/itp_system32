# Database Clear Guide

This guide explains how to safely wipe the MySQL data used by ITP System32 by dropping and recreating the database (no volume deletion). Use these steps when you need a clean database for development or testing. **Never run these commands on production without a verified backup and a maintenance window.**

## What gets removed

- All rows in the MySQL database (database is dropped and recreated)
- Mailpit data is preserved (volume is untouched)
- Schemas will be recreated after migrations

## 1) Optional: Create a backup

```bash
# Dump the current database before wiping
docker compose exec db mysqldump -u "$DATABASE_USER" -p"$DATABASE_PASSWORD" "$DATABASE_NAME" > backup.sql
```

## 2) Drop and recreate the database

```bash
# Drop and recreate (requires DATABASE_* env vars to match the running db)
docker compose exec db mysql -u "$DATABASE_USER" -p"$DATABASE_PASSWORD" -e "DROP DATABASE IF EXISTS \`$DATABASE_NAME\`; CREATE DATABASE \`$DATABASE_NAME\`;"
# Or use docker desktop exec
```

## 3) Remove Django migration files

delete generated migration files (keep `__init__.py`) before re-running migrations:

```bash
find backend -path "*/migrations/*.py" ! -name "__init__.py" -delete
find backend -path "*/migrations/*.pyc" -delete
```

## 4) Recreate services and database schema

```bash
# Start all services
docker compose up -d

# Re-run migrations to recreate tables
docker compose exec backend python manage.py migrate
```
