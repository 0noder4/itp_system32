#!/usr/bin/env bash
# Build and push backend image for production (VPS).
# Run from repo root: ./scripts/build-push-backend.sh
# Uses .env for DOCKER_REGISTRY; BACKEND_VERSION can be overridden: BACKEND_VERSION=0.1 ./scripts/build-push-backend.sh

set -e
cd "$(dirname "$0")/.."
source .env 2>/dev/null || true
VERSION="${BACKEND_VERSION:-0.0}"
IMAGE="${DOCKER_REGISTRY}/itp_system32_backend:${VERSION}"

echo "Building backend (production) as ${IMAGE} ..."
docker build -f backend/Dockerfile -t "$IMAGE" --target production ./backend

echo "Pushing ${IMAGE} ..."
docker push "$IMAGE"

echo "Done. On VPS set BACKEND_VERSION=${VERSION} and run: docker compose -f compose.prod.yml pull backend && docker compose -f compose.prod.yml up -d backend"
