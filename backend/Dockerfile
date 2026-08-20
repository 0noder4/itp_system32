# Stage 1: Base build stage
FROM python:3.13-slim AS builder

RUN apt-get update && apt-get install -y \
    python3-dev \
    mariadb-client \
    libmariadb3 \
    libmariadb-dev \
    build-essential \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Create the app directory
RUN mkdir /app

# Set the working directory
WORKDIR /app

# Set environment variables to optimize Python
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Upgrade pip and install dependencies
RUN pip install --upgrade pip

# Copy the requirements file first (better caching)
COPY requirements.txt /app/

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Stage 2: Base runtime stage
FROM python:3.13-slim AS base

# Install ONLY the runtime MariaDB libraries, fonts for PDF generation, and curl for healthchecks
RUN apt-get update && apt-get install -y \
    libmariadb3 \
    mariadb-client \
    fonts-dejavu \
    fonts-dejavu-core \
    fonts-dejavu-extra \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy the Python dependencies from the builder stage
COPY --from=builder /usr/local/lib/python3.13/site-packages/ /usr/local/lib/python3.13/site-packages/
COPY --from=builder /usr/local/bin/ /usr/local/bin/

# Set the working directory
WORKDIR /app

# Set environment variables to optimize Python
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Copy application code
COPY . .

# Make entrypoint script executable
RUN chmod +x /app/docker-entrypoint.sh /app/docker-entrypoint-notifications.sh

# Expose the application port
EXPOSE 8000

# Set entrypoint to run migrations before starting the server
# Using bash explicitly to handle volume mounts that may override permissions
ENTRYPOINT ["/bin/bash", "/app/docker-entrypoint.sh"]

# Stage 3: Development stage
FROM base AS development

# Install development tools and dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    vim \
    fonts-dejavu \
    fonts-dejavu-core \
    fonts-dejavu-extra \
    && rm -rf /var/lib/apt/lists/*

# Install development Python packages
RUN pip install --no-cache-dir \
    ipdb \
    django-debug-toolbar \
    django-extensions

# Set Django environment to development
ENV DJANGO_SETTINGS_MODULE=backend.settings
ENV DEBUG=True

# Create directories for development
RUN mkdir -p /app/staticfiles /app/mediafiles

# Development command - Django development server with auto-reload
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

# Stage 4: Production stage
FROM base AS production

# Create non-root user for security
RUN useradd -m -r -u 1001 appuser

# Set Django environment to production (before collectstatic)
ENV DJANGO_SETTINGS_MODULE=backend.settings
ENV DEBUG=False

# Create staticfiles and mediafiles directories
RUN mkdir -p /app/staticfiles /app/mediafiles

# Collect static files before switching user (requires root for file creation)
# Use a minimal settings to avoid needing database connection during build
RUN DJANGO_SECRET_KEY=dummy python manage.py collectstatic --noinput || true

# Set proper ownership for directories
RUN chown -R appuser:appuser /app/staticfiles /app/mediafiles /app

# Switch to non-root user
USER appuser

# Production command - Gunicorn WSGI server
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "60", "--keep-alive", "2", "backend.wsgi:application"]