FROM alpine:latest

# Install required packages
RUN apk add --no-cache \
    mysql-client \
    gzip \
    tzdata \
    curl

# Install supercronic (container-friendly cron)
RUN curl -L https://github.com/aptible/supercronic/releases/download/v0.2.26/supercronic-linux-amd64 -o /usr/local/bin/supercronic && \
    chmod +x /usr/local/bin/supercronic

# Create backup directory
RUN mkdir -p /backups

# Copy backup script
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["/usr/local/bin/supercronic", "/etc/crontab"]





