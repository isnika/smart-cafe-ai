# ==============================================================================
# SMART CAFE AI - DOCKER HUB PUSH SCRIPT
# ==============================================================================
# Cách sử dụng (từ thư mục backend):
#   .\push-docker.ps1 -Username your_dockerhub_username
#   .\push-docker.ps1 -Username your_dockerhub_username -Tag "1.0.0"
# ==============================================================================

param(
    [string]$Username = "nguyenchanhkhue",
    [string]$Tag = "latest",
    [switch]$IncludeMysql = $true
)

$ErrorActionPreference = "Stop"

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "   SMART CAFE AI - PUSH IMAGES TO DOCKER HUB            " -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan
Write-Host "Target Hub Account : $Username" -ForegroundColor Yellow
Write-Host "Image Tag          : $Tag" -ForegroundColor Yellow
Write-Host "Include MySQL Image: $IncludeMysql`n" -ForegroundColor Yellow

# Kiểm tra đăng nhập Docker Hub
Write-Host "[1/3] Kiểm tra trạng thái đăng nhập Docker..." -ForegroundColor Green
docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker daemon chưa khởi động. Vui lòng mở Docker Desktop!" -ForegroundColor Red
    exit 1
}

Write-Host "Vui lòng đảm bảo bạn đã chạy 'docker login' thành công.`n" -ForegroundColor Gray

# Danh sách microservices
$services = @(
    "discovery-server",
    "api-gateway",
    "identity-service",
    "catalog-service",
    "store-service",
    "order-service",
    "payment-service",
    "inventory-service",
    "engagement-service",
    "intelligence-service"
)

# 2. Tag & Push Microservices
Write-Host "[2/3] Tag & Push 10 Microservices..." -ForegroundColor Green

foreach ($svc in $services) {
    $localImage = "smartcafe/${svc}:latest"
    $remoteImage = "${Username}/smartcafe-${svc}:${Tag}"

    Write-Host "--------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "Đang xử lý: $svc" -ForegroundColor Cyan

    # Kiểm tra local image có tồn tại không
    $check = docker images -q $localImage
    if (-not $check) {
        Write-Host "Cảnh báo: Image cục bộ '$localImage' chưa có. Vui lòng chạy build-docker.ps1 trước!" -ForegroundColor Yellow
        continue
    }

    Write-Host "  -> Tagging: $localImage -> $remoteImage" -ForegroundColor Gray
    docker tag $localImage $remoteImage

    Write-Host "  -> Pushing: $remoteImage..." -ForegroundColor Green
    docker push $remoteImage
}

# 3. Build & Push Custom MySQL (nếu bật)
if ($IncludeMysql) {
    Write-Host "--------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "[3/3] Đóng gói & Push Custom MySQL (có sẵn 50 sản phẩm & data)..." -ForegroundColor Cyan
    
    $mysqlLocal = "smartcafe/mysql:latest"
    $mysqlRemote = "${Username}/smartcafe-mysql:${Tag}"

    Write-Host "  -> Building $mysqlLocal từ ../database/Dockerfile.mysql..." -ForegroundColor Gray
    docker build -t $mysqlLocal -f ../database/Dockerfile.mysql ../database

    Write-Host "  -> Tagging $mysqlLocal -> $mysqlRemote" -ForegroundColor Gray
    docker tag $mysqlLocal $mysqlRemote

    Write-Host "  -> Pushing $mysqlRemote..." -ForegroundColor Green
    docker push $mysqlRemote
}

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host "   HOÀN TẤT PUSH TOÀN BỘ IMAGE LÊN DOCKER HUB!           " -ForegroundColor Green
Write-Host "========================================================`n" -ForegroundColor Green
Write-Host "Người khác có thể pull và chạy hệ thống bằng cách:" -ForegroundColor Cyan
Write-Host "  1. Tải file backend/docker-compose.hub.yml" -ForegroundColor White
Write-Host "  2. Thay 'smartcafe/<service>' thành '$Username/smartcafe-<service>:$Tag'" -ForegroundColor White
Write-Host "  3. Chạy lệnh: docker compose -f docker-compose.hub.yml up -d" -ForegroundColor White
Write-Host ""
