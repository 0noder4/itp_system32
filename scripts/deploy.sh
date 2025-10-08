#!/bin/bash

# Deployment script for ITP System32
# This script handles the deployment process on the VPS

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="/opt/itp_system32"
COMPOSE_FILE="compose.yml"
ENV_FILE=".env"

echo -e "${GREEN}🚀 Starting deployment process...${NC}"

# Check if we're in the right directory
if [ ! -f "$COMPOSE_FILE" ]; then
    echo -e "${RED}❌ Error: $COMPOSE_FILE not found. Are you in the project directory?${NC}"
    exit 1
fi

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}⚠️  Warning: $ENV_FILE not found. Make sure to create it with proper configuration.${NC}"
fi

# Stop existing containers gracefully
echo -e "${YELLOW}🛑 Stopping existing containers...${NC}"
docker-compose down || true

# Remove old images to free up space (optional)
echo -e "${YELLOW}🧹 Cleaning up old Docker images...${NC}"
docker image prune -f || true

# Pull latest images if using registry
echo -e "${YELLOW}📥 Pulling latest images...${NC}"
docker-compose pull || echo -e "${YELLOW}⚠️  Could not pull images (may be building locally)${NC}"

# Build and start containers
echo -e "${YELLOW}🔨 Building and starting containers...${NC}"
docker-compose up -d --build

# Wait for services to be ready
echo -e "${YELLOW}⏳ Waiting for services to start...${NC}"
sleep 15

# Check if services are running
echo -e "${YELLOW}🔍 Checking service status...${NC}"
docker-compose ps

# Verify services are healthy
echo -e "${YELLOW}🏥 Health checking services...${NC}"

# Check backend health
if curl -f http://localhost:8000/health/ > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend is healthy${NC}"
else
    echo -e "${RED}❌ Backend health check failed${NC}"
    docker-compose logs backend
fi

# Check frontend health
if curl -f http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Frontend is healthy${NC}"
else
    echo -e "${RED}❌ Frontend health check failed${NC}"
    docker-compose logs frontend
fi

# Run database migrations (if backend is running)
echo -e "${YELLOW}🗄️  Running database migrations...${NC}"
docker-compose exec -T backend python manage.py migrate --noinput || echo -e "${YELLOW}⚠️  Migrations failed or backend not ready${NC}"

# Collect static files (if backend is running)
echo -e "${YELLOW}📁 Collecting static files...${NC}"
docker-compose exec -T backend python manage.py collectstatic --noinput || echo -e "${YELLOW}⚠️  Static collection failed or backend not ready${NC}"

# Final status check
echo -e "${YELLOW}📊 Final status check...${NC}"
if docker-compose ps | grep -q "Up"; then
    echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
    echo -e "${GREEN}🌐 Services available at:${NC}"
    echo -e "   • Frontend: http://localhost:3000"
    echo -e "   • Backend: http://localhost:8000"
    echo -e "   • Database: localhost:3306"
else
    echo -e "${RED}❌ Some services failed to start${NC}"
    docker-compose logs --tail=50
    exit 1
fi

echo -e "${GREEN}🎉 Deployment process completed!${NC}"
