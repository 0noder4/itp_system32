#!/bin/bash

# VPS Setup script for ITP System32
# Run this script once on your VPS to prepare it for deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🛠️  Setting up VPS for ITP System32 deployment...${NC}"

# Update system packages
echo -e "${YELLOW}📦 Updating system packages...${NC}"
sudo apt update && sudo apt upgrade -y

# Install Docker
echo -e "${YELLOW}🐳 Installing Docker...${NC}"
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    echo -e "${GREEN}✅ Docker installed successfully${NC}"
else
    echo -e "${GREEN}✅ Docker is already installed${NC}"
fi

# Install Docker Compose
echo -e "${YELLOW}🐳 Installing Docker Compose...${NC}"
if ! command -v docker-compose &> /dev/null; then
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo -e "${GREEN}✅ Docker Compose installed successfully${NC}"
else
    echo -e "${GREEN}✅ Docker Compose is already installed${NC}"
fi

# Install additional tools
echo -e "${YELLOW}🔧 Installing additional tools...${NC}"
sudo apt install -y curl wget git htop nano

# Create project directory
echo -e "${YELLOW}📁 Creating project directory...${NC}"
sudo mkdir -p /opt/itp_system32
sudo chown $USER:$USER /opt/itp_system32

# Create environment file template
echo -e "${YELLOW}📝 Creating environment file template...${NC}"
cat > /opt/itp_system32/.env.template << 'EOF'
# Project Configuration
PROJECT_NAME=itp_system32
ENV=production

# Database Configuration
DATABASE_NAME=itp_system32_db
DATABASE_USER=itp_user
DATABASE_PASSWORD=your_secure_password_here
DATABASE_ROOT_PASSWORD=your_root_password_here
DATABASE_HOST=db
DATABASE_PORT=3306
DATABASE_ENGINE=django.db.backends.mysql

# Django Configuration
DJANGO_SECRET_KEY=your_secret_key_here
DEBUG=False
DJANGO_LOGLEVEL=INFO
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,your_domain.com

# Docker Image Versions
BACKEND_VERSION=latest
FRONTEND_VERSION=latest
EOF

# Create systemd service for auto-start (optional)
echo -e "${YELLOW}⚙️  Creating systemd service...${NC}"
sudo tee /etc/systemd/system/itp-system32.service > /dev/null << 'EOF'
[Unit]
Description=ITP System32 Application
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/itp_system32
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
TimeoutStartSec=0
User=ubuntu

[Install]
WantedBy=multi-user.target
EOF

# Set up log rotation for Docker containers
echo -e "${YELLOW}📋 Setting up log rotation...${NC}"
sudo tee /etc/logrotate.d/docker-containers > /dev/null << 'EOF'
/var/lib/docker/containers/*/*.log {
    rotate 7
    daily
    compress
    size=1M
    missingok
    delaycompress
    copytruncate
}
EOF

# Configure firewall (if ufw is installed)
echo -e "${YELLOW}🔥 Configuring firewall...${NC}"
if command -v ufw &> /dev/null; then
    sudo ufw allow 22/tcp   # SSH
    sudo ufw allow 80/tcp   # HTTP
    sudo ufw allow 443/tcp  # HTTPS
    sudo ufw allow 3000/tcp # Frontend
    sudo ufw allow 8000/tcp # Backend
    echo -e "${GREEN}✅ Firewall configured${NC}"
else
    echo -e "${YELLOW}⚠️  UFW not found, skipping firewall configuration${NC}"
fi

# Create backup script
echo -e "${YELLOW}💾 Creating backup script...${NC}"
cat > /opt/itp_system32/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/backups/itp_system32"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup database
docker-compose exec -T db mysqldump -u root -p$DATABASE_ROOT_PASSWORD $DATABASE_NAME > $BACKUP_DIR/db_$DATE.sql

# Backup application files
tar -czf $BACKUP_DIR/app_$DATE.tar.gz /opt/itp_system32 --exclude=node_modules --exclude=.git

# Keep only last 7 days of backups
find $BACKUP_DIR -type f -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR/app_$DATE.tar.gz"
EOF

chmod +x /opt/itp_system32/backup.sh

# Create monitoring script
echo -e "${YELLOW}📊 Creating monitoring script...${NC}"
cat > /opt/itp_system32/monitor.sh << 'EOF'
#!/bin/bash
echo "=== ITP System32 Status ==="
echo "Date: $(date)"
echo ""
echo "=== Docker Containers ==="
docker-compose ps
echo ""
echo "=== System Resources ==="
echo "CPU Usage:"
top -bn1 | grep "Cpu(s)" | awk '{print $2}' | awk -F'%' '{print $1}'
echo ""
echo "Memory Usage:"
free -h
echo ""
echo "Disk Usage:"
df -h /
echo ""
echo "=== Application Health ==="
echo "Frontend (port 3000):"
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 || echo "Not responding"
echo ""
echo "Backend (port 8000):"
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000 || echo "Not responding"
echo ""
EOF

chmod +x /opt/itp_system32/monitor.sh

echo -e "${GREEN}✅ VPS setup completed successfully!${NC}"
echo ""
echo -e "${BLUE}📋 Next steps:${NC}"
echo -e "1. Copy your .env file to /opt/itp_system32/.env"
echo -e "2. Configure your domain and SSL certificates"
echo -e "3. Set up reverse proxy (nginx) if needed"
echo -e "4. Run the deployment script"
echo ""
echo -e "${BLUE}📝 Useful commands:${NC}"
echo -e "• Check status: /opt/itp_system32/monitor.sh"
echo -e "• Create backup: /opt/itp_system32/backup.sh"
echo -e "• View logs: docker-compose logs -f"
echo -e "• Restart services: docker-compose restart"
echo ""
echo -e "${YELLOW}⚠️  Important: Log out and log back in to apply Docker group changes${NC}"
