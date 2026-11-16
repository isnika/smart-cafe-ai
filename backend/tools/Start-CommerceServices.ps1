param(
    [ValidateSet('store-service','catalog-service','order-service')]
    [string[]]$Services = @('store-service','catalog-service','order-service'),
    [string]$JavaHome = $env:JAVA_HOME,
    [switch]$Build
)
$ErrorActionPreference = 'Stop'
$backendRoot = Split-Path $PSScriptRoot -Parent
if (-not $JavaHome) { throw 'Chỉ định -JavaHome tới JDK 17 trở lên hoặc đặt JAVA_HOME.' }
$javaExe = Join-Path $JavaHome 'bin/java.exe'
if (-not (Test-Path -LiteralPath $javaExe)) { throw "Không tìm thấy Java: $javaExe" }
$env:JAVA_HOME = $JavaHome
$env:PATH = (Join-Path $JavaHome 'bin') + ';' + $env:PATH
$ports = @{ 'store-service'=8083; 'catalog-service'=8082; 'order-service'=8084 }
foreach ($service in $Services) {
    $serviceDir = Join-Path $backendRoot $service
    $envFile = Join-Path $serviceDir '.env'
    if (-not (Test-Path -LiteralPath $envFile)) { throw "Thiếu $envFile. Xem backend/COMMERCE_REAL_INTEGRATION.md." }
    $settings = @{}
    foreach ($line in Get-Content -LiteralPath $envFile -Encoding UTF8) {
        if ($line.Trim() -match '^(?!#)([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
            $settings[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
        }
    }
    foreach ($name in @('SPRING_DATASOURCE_URL','SPRING_DATASOURCE_USERNAME','SPRING_DATASOURCE_PASSWORD','JWT_SECRET','STORE_INTERNAL_API_KEY')) {
        if (-not $settings[$name]) { throw "Thiếu $name trong $envFile" }
    }
    if ($settings['SPRING_DATASOURCE_URL'] -notlike "jdbc:mysql:*smart_cafe_$($service.Replace('-service',''))_db*") {
        throw "Datasource $service phải trỏ MySQL riêng của service; kiểm tra $envFile."
    }
    if ($service -ne 'store-service' -and -not $settings['CATALOG_INTERNAL_API_KEY']) { throw "Thiếu CATALOG_INTERNAL_API_KEY trong $envFile" }
    $socket = New-Object System.Net.Sockets.TcpClient
    try { $socket.Connect('127.0.0.1', $ports[$service]); $listening = $true } catch { $listening = $false } finally { $socket.Dispose() }
    if ($listening) { throw "Cổng $($ports[$service]) đã được dùng; kiểm tra service đang chạy trước khi khởi động lại." }
    $original = @{}
    foreach ($name in $settings.Keys) {
        $original[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $settings[$name], 'Process')
    }
    try {
        if ($Build) {
            & mvn -f (Join-Path $serviceDir 'pom.xml') '-DskipTests' package
            if ($LASTEXITCODE -ne 0) { throw "Build $service thất bại." }
        }
        $jar = Join-Path $serviceDir "target/$service-0.0.1-SNAPSHOT.jar"
        if (-not (Test-Path -LiteralPath $jar)) { throw "Chưa build $service. Chạy lại với -Build." }
        $runtimeDir = Join-Path $serviceDir 'target/real-runtime'
        New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        # Keep schema changes explicit. Import migrations before launch; do not let Hibernate alter live tables.
        $proc = Start-Process -FilePath $javaExe -ArgumentList @('-jar', "`"$jar`"", '--spring.jpa.hibernate.ddl-auto=none', '--logging.level.root=INFO', '--spring.jpa.show-sql=false') -WorkingDirectory $serviceDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir "$stamp.stdout.log") -RedirectStandardError (Join-Path $runtimeDir "$stamp.stderr.log")
        Write-Output "$service started: PID=$($proc.Id), port=$($ports[$service]), logs=$runtimeDir"
    } finally {
        foreach ($name in $settings.Keys) { [Environment]::SetEnvironmentVariable($name, $original[$name], 'Process') }
    }
}
