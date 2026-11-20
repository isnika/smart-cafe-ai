#!/bin/bash
# ==============================================================================
# SMART CAFE AI - AUTOMATED DOCKER BUILD SCRIPT (BASH / LINUX / MAC)
# ==============================================================================

set -e

echo "=========================================================="
echo "  SMART CAFE AI - QUY TRÌNH BUILD DOCKER TỐI ƯU TOÀN DIỆN  "
echo "=========================================================="

# 1. Kiểm tra Docker
echo ""
echo "[1/3] Kiểm tra Docker Engine..."
if ! docker info > /dev/null 2>&1; then
    echo "-> CẢNH BÁO: Docker Engine chưa được bật! Vui lòng bật Docker daemon."
    exit 1
fi
echo "-> Docker Engine đang hoạt động bình thường!"

# 2. Biên dịch JAR toàn bộ Microservices qua Maven
echo ""
echo "[2/3] Đóng gói Layered JAR cho 10 Microservices qua Maven..."
./mvnw clean package -DskipTests
echo "-> Đóng gói toàn bộ 10 JARs thành công!"

# 3. Build Docker Images qua Docker Compose
echo ""
echo "[3/3] Đang build các Docker Images siêu nhẹ (Temurin 17 JRE Alpine)..."
docker compose build

echo ""
echo "=========================================================="
echo "  BUILD DOCKER HOÀN TẤT THÀNH CÔNG RỰC RỠ!                 "
echo "=========================================================="
echo ""
echo "Để khởi chạy toàn bộ hệ thống:"
echo "   docker compose up -d"
echo ""
echo "Để xem logs hệ thống:"
echo "   docker compose logs -f"
echo ""
echo "Để kiểm tra trạng thái các container:"
echo "   docker compose ps"
echo ""
echo "Để dừng toàn bộ hệ thống:"
echo "   docker compose down"
