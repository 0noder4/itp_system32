FROM alpine:latest

# Install required packages
RUN apk add --no-cache \
    mysql-client \
    gzip \
    dcron \
    tzdata

# Create backup directory
RUN mkdir -p /backups

# Copy backup script
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

# Create crontab directory
RUN mkdir -p /var/spool/cron/crontabs

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["crond", "-f", "-d", "8"]



