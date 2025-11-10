#!/bin/bash

# Deployment script for ITP System32 Production
# This script handles the deployment process on the VPS

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="compose.prod.yml"
ENV_FILE=".env"
MAX_WAIT_TIME=120  # Maximum wait time for services to be healthy (seconds)
HEALTH_CHECK_INTERVAL=5  # Interval between health checks (seconds)

echo -e "${GREEN}🚀 Starting production deployment process...${NC}"

# Check if we're in the right directory
if [ ! -f "$COMPOSE_FILE" ]; then
    echo -e "${RED}❌ Error: $COMPOSE_FILE not found. Are you in the project directory?${NC}"
    exit 1
fi

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}❌ Error: $ENV_FILE not found. Please create it with proper configuration.${NC}"
    exit 1
fi

# Function to wait for service health
wait_for_health() {
    local service=$1
    local elapsed=0
    
    echo -e "${YELLOW}⏳ Waiting for $service to be healthy...${NC}"
    while [ $elapsed -lt $MAX_WAIT_TIME ]; do
        if docker-compose -f "$COMPOSE_FILE" ps "$service" | grep -q "healthy"; then
            echo -e "${GREEN}✅ $service is healthy${NC}"
            return 0
        fi
        sleep $HEALTH_CHECK_INTERVAL
        elapsed=$((elapsed + HEALTH_CHECK_INTERVAL))
    done
    
    echo -e "${RED}❌ $service failed to become healthy within ${MAX_WAIT_TIME}s${NC}"
    docker-compose -f "$COMPOSE_FILE" logs --tail=50 "$service"
    return 1
}

# Stop existing containers gracefully
echo -e "${YELLOW}🛑 Stopping existing containers...${NC}"
docker-compose -f "$COMPOSE_FILE" down || true

# Remove old images to free up space
echo -e "${YELLOW}🧹 Cleaning up old Docker images...${NC}"
docker image prune -f || true

# Pull latest images from registry
echo -e "${YELLOW}📥 Pulling latest images...${NC}"
if ! docker-compose -f "$COMPOSE_FILE" pull; then
    echo -e "${RED}❌ Failed to pull images. Please check your Docker registry configuration.${NC}"
    exit 1
fi

# Start containers
echo -e "${YELLOW}🔨 Starting containers...${NC}"
if ! docker-compose -f "$COMPOSE_FILE" up -d; then
    echo -e "${RED}❌ Failed to start containers${NC}"
    docker-compose -f "$COMPOSE_FILE" logs --tail=50
    exit 1
fi

# Wait for database to be healthy
if ! wait_for_health "db"; then
    echo -e "${RED}❌ Database failed to start. Aborting deployment.${NC}"
    docker-compose -f "$COMPOSE_FILE" logs db
    exit 1
fi

# Wait for backend to be healthy
if ! wait_for_health "backend"; then
    echo -e "${RED}❌ Backend failed to start. Aborting deployment.${NC}"
    docker-compose -f "$COMPOSE_FILE" logs backend
    exit 1
fi

# Run database migrations
echo -e "${YELLOW}🗄️  Running database migrations...${NC}"
if ! docker-compose -f "$COMPOSE_FILE" exec -T backend python manage.py migrate --noinput; then
    echo -e "${RED}❌ Database migrations failed${NC}"
    docker-compose -f "$COMPOSE_FILE" logs backend
    exit 1
fi

# Collect static files
echo -e "${YELLOW}📁 Collecting static files...${NC}"
if ! docker-compose -f "$COMPOSE_FILE" exec -T backend python manage.py collectstatic --noinput; then
    echo -e "${RED}❌ Static file collection failed${NC}"
    docker-compose -f "$COMPOSE_FILE" logs backend
    exit 1
fi

# Wait for frontend to be healthy (optional, may not have healthcheck)
echo -e "${YELLOW}⏳ Waiting for frontend to start...${NC}"
sleep 10

# Check service status
echo -e "${YELLOW}🔍 Checking service status...${NC}"
docker-compose -f "$COMPOSE_FILE" ps

# Final verification
echo -e "${YELLOW}📊 Final status check...${NC}"
if docker-compose -f "$COMPOSE_FILE" ps | grep -q "Up"; then
    echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
    echo -e "${GREEN}🎉 All services are running${NC}"
else
    echo -e "${RED}❌ Some services failed to start${NC}"
    docker-compose -f "$COMPOSE_FILE" logs --tail=50
    exit 1
fi
