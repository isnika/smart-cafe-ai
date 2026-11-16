#!/usr/bin/env bash
# ==============================================================================
# SMART CAFE AI - DOCKER HUB PUSH SCRIPT (Bash)
# ==============================================================================
# Cách sử dụng (từ thư mục backend):
#   ./push-docker.sh your_dockerhub_username [tag]
# ==============================================================================

set -e

USERNAME=${1:-nguyenchanhkhue}
TAG=${2:-latest}

echo "========================================================"
echo "   SMART CAFE AI - PUSH IMAGES TO DOCKER HUB"
echo "========================================================"
echo "Target Hub Account : $USERNAME"
echo "Image Tag          : $TAG"
echo "========================================================"

services=(
  "discovery-server"
  "api-gateway"
  "identity-service"
  "catalog-service"
  "store-service"
  "order-service"
  "payment-service"
  "inventory-service"
  "engagement-service"
  "intelligence-service"
)

for svc in "${services[@]}"; do
  local_img="smartcafe/${svc}:latest"
  remote_img="${USERNAME}/smartcafe-${svc}:${TAG}"
  echo "==> Tagging & Pushing: $local_img -> $remote_img"
  docker tag "$local_img" "$remote_img"
  docker push "$remote_img"
done

echo "==> Building & Pushing Custom MySQL with pre-seeded data..."
docker build -t smartcafe/mysql:latest -f ../database/Dockerfile.mysql ../database
docker tag smartcafe/mysql:latest "${USERNAME}/smartcafe-mysql:${TAG}"
docker push "${USERNAME}/smartcafe-mysql:${TAG}"

echo "========================================================"
echo "   HOÀN TẤT PUSH TOÀN BỘ IMAGE!"
echo "========================================================"
