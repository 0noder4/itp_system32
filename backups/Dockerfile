FROM debian:bookworm-slim

# Install required packages
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    default-mysql-client \
    gzip \
    tar \
    util-linux \
    python3 \
    curl \
    ca-certificates \
    rclone \
    tzdata && \
    rm -rf /var/lib/apt/lists/*

# Install supercronic (container-friendly cron)
RUN curl -f -L https://github.com/aptible/supercronic/releases/download/v0.2.26/supercronic-linux-amd64 -o /usr/local/bin/supercronic && \
    chmod +x /usr/local/bin/supercronic && \
    test -x /usr/local/bin/supercronic || (echo "Failed to install supercronic" && exit 1)

# Create backup and secrets directories with proper permissions
RUN mkdir -p /backups /backups/exports /secrets && \
    chmod 755 /backups /secrets && \
    chmod 775 /backups/exports

# Copy backup, restore, sync, alert, and entrypoint scripts
COPY backup.sh /usr/local/bin/backup.sh
COPY restore.sh /usr/local/bin/restore.sh
COPY sync_gdrive.sh /usr/local/bin/sync_gdrive.sh
COPY send_alert_email.py /usr/local/bin/send_alert_email.py
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN sed -i 's/\r$//' \
        /usr/local/bin/backup.sh \
        /usr/local/bin/restore.sh \
        /usr/local/bin/sync_gdrive.sh \
        /usr/local/bin/send_alert_email.py \
        /usr/local/bin/docker-entrypoint.sh && \
    chmod +x \
        /usr/local/bin/backup.sh \
        /usr/local/bin/restore.sh \
        /usr/local/bin/sync_gdrive.sh \
        /usr/local/bin/send_alert_email.py \
        /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["/usr/local/bin/supercronic", "/etc/crontab"]
