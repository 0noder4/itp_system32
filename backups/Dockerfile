FROM debian:bookworm-slim

# Install required packages
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    default-mysql-client \
    gzip \
    curl \
    ca-certificates \
    tzdata && \
    rm -rf /var/lib/apt/lists/*

# Install supercronic (container-friendly cron)
RUN curl -f -L https://github.com/aptible/supercronic/releases/download/v0.2.26/supercronic-linux-amd64 -o /usr/local/bin/supercronic && \
    chmod +x /usr/local/bin/supercronic && \
    test -x /usr/local/bin/supercronic || (echo "Failed to install supercronic" && exit 1)

# Create backup directory with proper permissions
RUN mkdir -p /backups && \
    chmod 755 /backups

# Copy backup script
COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["/usr/local/bin/supercronic", "/etc/crontab"]





