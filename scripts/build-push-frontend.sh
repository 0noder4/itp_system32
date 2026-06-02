#!/usr/bin/env bash
# Build and push frontend image for production (VPS).
# Run from repo root: ./scripts/build-push-frontend.sh
# Uses .env for DOCKER_REGISTRY and API_URL; FRONTEND_VERSION can be overridden:
#   FRONTEND_VERSION=0.1 ./scripts/build-push-frontend.sh

set -e
cd "$(dirname "$0")/.."
source .env 2>/dev/null || true
VERSION="${FRONTEND_VERSION:-0.0}"
API_URL="${API_URL:-http://localhost:8000}"
IMAGE="${DOCKER_REGISTRY}/itp_system32_frontend:${VERSION}"

echo "Building frontend (production) as ${IMAGE} ..."
docker build -f frontend/Dockerfile -t "$IMAGE" --target production \
  --build-arg NEXT_PUBLIC_API_URL="${API_URL}" \
  ./frontend

echo "Pushing ${IMAGE} ..."
docker push "$IMAGE"

echo "Done. On VPS set FRONTEND_VERSION=${VERSION} and run: docker compose -f compose.prod.yml pull frontend && docker compose -f compose.prod.yml up -d frontend"
