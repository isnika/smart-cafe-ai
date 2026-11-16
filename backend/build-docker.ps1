# ==============================================================================
# SMART CAFE AI - AUTOMATED DOCKER BUILD SCRIPT (WINDOWS POWERSHELL)
# ==============================================================================

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  SMART CAFE AI - QUY TRÌNH BUILD DOCKER TỐI ƯU TOÀN DIỆN  " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Kiểm tra Docker Engine
Write-Host "`n[1/3] Kiểm tra Docker Engine..." -ForegroundColor Green
try {
    $dockerInfo = docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "-> CẢNH BÁO: Docker Engine chưa được bật! Vui lòng khởi động Docker Desktop trước." -ForegroundColor Red
        exit 1
    }
    Write-Host "-> Docker Engine đang hoạt động bình thường!" -ForegroundColor White
} catch {
    Write-Host "-> Không tìm thấy lệnh docker. Vui lòng cài đặt Docker Desktop." -ForegroundColor Red
    exit 1
}

# 2. Biên dịch song song toàn bộ Microservices qua Maven Wrapper
Write-Host "`n[2/3] Đóng gói Layered JAR cho 10 Microservices qua Maven Wrapper..." -ForegroundColor Green
$startTime = Get-Date

try {
    .\mvnw.cmd clean package -DskipTests
    if ($LASTEXITCODE -ne 0) {
        Write-Host "-> Lỗi khi biên dịch Maven!" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "-> Lỗi khi biên dịch Maven!" -ForegroundColor Red
    exit 1
}

$mavenDuration = (Get-Date) - $startTime
Write-Host "-> Đóng gói toàn bộ 10 JARs thành công trong $($mavenDuration.Minutes)m $($mavenDuration.Seconds)s!" -ForegroundColor White

# 3. Build Docker Images qua Docker Compose với Layer Caching
Write-Host "`n[3/3] Đang build các Docker Images siêu nhẹ (Temurin 17 JRE Alpine)..." -ForegroundColor Green
docker compose build

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n==========================================================" -ForegroundColor Cyan
    Write-Host "  BUILD DOCKER HOÀN TẤT THÀNH CÔNG RỰC RỠ!                 " -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "`nĐể khởi chạy toàn bộ hệ thống:" -ForegroundColor Yellow
    Write-Host "   docker compose up -d" -ForegroundColor White
    Write-Host "`nĐể xem logs hệ thống:" -ForegroundColor Yellow
    Write-Host "   docker compose logs -f" -ForegroundColor White
    Write-Host "`nĐể kiểm tra trạng thái các container:" -ForegroundColor Yellow
    Write-Host "   docker compose ps" -ForegroundColor White
    Write-Host "`nĐể dừng toàn bộ hệ thống:" -ForegroundColor Yellow
    Write-Host "   docker compose down" -ForegroundColor White
} else {
    Write-Host "-> Lỗi khi build Docker Images!" -ForegroundColor Red
    exit 1
}
