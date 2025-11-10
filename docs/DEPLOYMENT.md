# ITP System32 Deployment Guide

This guide explains how to set up and deploy the ITP System32 application to your VPS using GitHub Actions.

## 🚀 Quick Start

### 1. VPS Setup

First, run the setup script on your VPS:

```bash
# Copy and run the setup script on your VPS
curl -fsSL https://raw.githubusercontent.com/your-username/itp_system32/main/scripts/setup-vps.sh | bash
```

Or manually:

```bash
# Clone the repository to your VPS
git clone https://github.com/your-username/itp_system32.git /opt/itp_system32
cd /opt/itp_system32

# Run the setup script
chmod +x scripts/setup-vps.sh
./scripts/setup-vps.sh
```

### 2. Configure Environment

Create your environment file:

```bash
cp /opt/itp_system32/.env.template /opt/itp_system32/.env
nano /opt/itp_system32/.env
```

Update the following variables in `.env`:

```env
# Project Configuration
PROJECT_NAME=itp_system32
ENV=production

# Database Configuration
DATABASE_NAME=itp_system32_db
DATABASE_USER=itp_user
DATABASE_PASSWORD=your_secure_password_here
DATABASE_ROOT_PASSWORD=your_root_password_here

# Django Configuration
DJANGO_SECRET_KEY=your_secret_key_here
DEBUG=False
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,your_domain.com

# Docker Image Versions
BACKEND_VERSION=latest
FRONTEND_VERSION=latest
```

### 3. SSH Key Setup

#### On your VPS:

```bash
# Create SSH key pair (if not exists)
ssh-keygen -t rsa -b 4096 -C "github-actions"

# Add the public key to authorized_keys
cat ~/.ssh/id_rsa.pub >> ~/.ssh/authorized_keys

# Copy the private key content
cat ~/.ssh/id_rsa
```

#### On GitHub:

1. Go to your repository settings
2. Navigate to "Secrets and variables" → "Actions"
3. Add the following secrets:

| Secret Name           | Description                   | Value                                  |
| --------------------- | ----------------------------- | -------------------------------------- |
| `VPS_HOST`            | Your VPS IP address or domain | `192.168.1.100` or `your-domain.com`   |
| `VPS_USER`            | SSH username                  | `ubuntu` or `root`                     |
| `VPS_SSH_PRIVATE_KEY` | SSH private key content       | Content of `~/.ssh/id_rsa`             |
| `DISCORD_WEBHOOK_URL` | Discord webhook URL           | `https://discord.com/api/webhooks/...` |

### 4. Deploy

The deployment will trigger automatically when you push to the `main` or `production` branch, or you can trigger it manually:

1. Go to your repository on GitHub
2. Navigate to "Actions" tab
3. Select "Deploy to VPS" workflow
4. Click "Run workflow"

## 📋 Deployment Process

The deployment workflow will:

1. **Checkout code** from the repository
2. **Setup SSH connection** to your VPS
3. **Copy files** to `/opt/itp_system32` on the VPS
4. **Stop existing containers** gracefully
5. **Pull latest images** from Docker registry
6. **Build and start containers** using Docker Compose
7. **Run database migrations**
8. **Collect static files**
9. **Verify deployment** health
10. **Send Discord notification**

## 🐳 Docker Services

The deployment includes:

- **Database**: MySQL 8.0 with persistent storage
- **Backend**: Django application on port 8000
- **Frontend**: Next.js application on port 3000
- **Nginx**: Reverse proxy (optional, for production)

## 🔧 Management Commands

### On your VPS:

```bash
cd /opt/itp_system32

# View service status
docker-compose ps

# View logs
docker-compose logs -f

# Restart services
docker-compose restart

# Update and redeploy
docker-compose pull
docker-compose up -d --build

# Stop all services
docker-compose down

# Run database migrations
docker-compose exec backend python manage.py migrate

# Create superuser
docker-compose exec backend python manage.py createsuperuser

# Collect static files
docker-compose exec backend python manage.py collectstatic --noinput
```

### Utility Scripts:

```bash
# Check system status
./scripts/monitor.sh

# Create backup
./scripts/backup.sh

# Manual deployment
./scripts/deploy.sh
```

## 🔍 Monitoring

### Health Checks:

- **Frontend**: http://your-domain:3000
- **Backend**: http://your-domain:8000/health/
- **Database**: MySQL on port 3306

### Logs:

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f db
```

## 🛡️ Security

### Firewall:

```bash
# Allow necessary ports
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw allow 3000/tcp # Frontend
sudo ufw allow 8000/tcp # Backend

# Enable firewall
sudo ufw enable
```

### SSL/HTTPS:

1. Obtain SSL certificates (Let's Encrypt recommended)
2. Update nginx configuration
3. Uncomment HTTPS server block in `nginx/nginx.conf`

## 🔄 Backup Strategy

The system includes automatic backup functionality:

```bash
# Manual backup
./scripts/backup.sh

# Schedule automatic backups (crontab)
0 2 * * * /opt/itp_system32/scripts/backup.sh
```

Backups include:

- Database dump
- Application files
- Configuration files

## 🚨 Troubleshooting

### Common Issues:

1. **SSH Connection Failed**:

   - Verify SSH key is correct in GitHub secrets
   - Check VPS firewall settings
   - Ensure SSH service is running

2. **Docker Build Failed**:

   - Check Docker and Docker Compose installation
   - Verify .env file configuration
   - Check available disk space

3. **Services Not Starting**:

   - Check logs: `docker-compose logs`
   - Verify environment variables
   - Check port conflicts

4. **Database Connection Issues**:
   - Verify database credentials in .env
   - Check if database container is running
   - Verify network connectivity between containers

### Getting Help:

1. Check GitHub Actions logs
2. Review Docker container logs
3. Verify VPS system resources
4. Check Discord notifications for deployment status

## 📈 Scaling

For production scaling:

1. **Use Docker Swarm or Kubernetes** for orchestration
2. **Set up load balancing** with multiple backend instances
3. **Use external database** (AWS RDS, Google Cloud SQL)
4. **Implement Redis** for caching and sessions
5. **Set up monitoring** (Prometheus, Grafana)

## 🔄 CI/CD Pipeline

The complete CI/CD pipeline includes:

1. **Build Pipeline** (`publish.yml`):

   - Triggers on push to `develop` branch
   - Builds and pushes Docker images
   - Sends Discord notifications

2. **Deployment Pipeline** (`deploy.yml`):

   - Triggers on push to `main`/`production` branch
   - Deploys to VPS
   - Runs health checks
   - Sends Discord notifications

3. **Notification Pipeline** (`discord-notifications.yml`):
   - Sends notifications for all repository events
   - Includes push notifications and PR updates
