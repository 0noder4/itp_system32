# Database Backup System

This directory contains the automatic database backup system for the ITP System 32 application.

## Features

- **Automatic scheduled backups** using cron
- **Compressed backups** to save disk space
- **Automatic cleanup** of old backups based on retention policy
- **Configurable schedule** via environment variables
- **Docker-based** implementation for easy deployment

## How It Works

The backup system runs as a separate Docker service that:

1. Connects to the MySQL database container
2. Creates a compressed SQL dump using `mysqldump`
3. Stores backups in a Docker volume
4. Automatically cleans up backups older than the retention period
5. Logs all operations for monitoring

## Configuration

Configure the backup system using environment variables in your `.env` file:

### `BACKUP_SCHEDULE`

Cron schedule for backups in crontab format (minute hour day month weekday).

Examples:

- `0 2 * * *` - Daily at 2:00 AM (default)
- `0 */6 * * *` - Every 6 hours
- `0 3 * * 0` - Weekly on Sunday at 3:00 AM
- `0 1 1 * *` - Monthly on the 1st at 1:00 AM

### `BACKUP_RETENTION_DAYS`

Number of days to keep backups before automatic deletion (default: 30).

### `BACKUP_ON_START`

Set to `true` to run a backup immediately when the container starts (default: `false`).

### `TZ`

Timezone for the backup schedule (default: `UTC`).

## Backup Files

Backups are stored in the `backups` Docker volume and named with the format:

```
<database_name>_YYYYMMDD_HHMMSS.sql.gz
```

For example:

```
system_32_20240115_020000.sql.gz
```

## Manual Backup

You can manually trigger a backup by executing the backup script inside the container:

```bash
docker exec <project_name>_backup /usr/local/bin/backup.sh
```

Or run a one-time backup without the service:

```bash
docker compose run --rm backup /usr/local/bin/backup.sh
```

## Restoring a Backup

To restore a backup:

1. Extract the compressed backup:

   ```bash
   gunzip backup_file.sql.gz
   ```

2. Restore to the database:
   ```bash
   docker exec -i <project_name>_db mysql -u root -p<password> <database_name> < backup_file.sql
   ```

Or using Docker Compose:

```bash
gunzip < backup_file.sql.gz | docker compose exec -T db mysql -u root -p$DATABASE_ROOT_PASSWORD $DATABASE_NAME
```

## Accessing Backups

Backups are stored in a Docker volume. To access them:

1. List backups:

   ```bash
   docker compose run --rm backup ls -lh /backups
   ```

2. Copy a backup to your host:
   ```bash
   docker compose run --rm -v $(pwd):/host backup cp /backups/<backup_file> /host/
   ```

## Logs

Backup operations are logged to `/backups/backup.log` inside the container. Cron job output is logged to `/backups/cron.log`.

View logs:

```bash
docker compose logs backup
```

## Troubleshooting

### Check if the backup service is running

```bash
docker compose ps backup
```

### Check cron status

```bash
docker compose exec backup crontab -l
```

### Manually test the backup script

```bash
docker compose exec backup /usr/local/bin/backup.sh
```

### View backup logs

```bash
docker compose exec backup cat /backups/backup.log
```

## Security Notes

- Backup files contain sensitive database data. Ensure the backups volume is properly secured.
- In production, consider encrypting backups or storing them in a secure external location.
- Regularly test backup restoration procedures.
