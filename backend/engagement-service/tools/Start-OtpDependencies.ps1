[CmdletBinding()]
param(
    [string]$RabbitMqSbin
)

$ErrorActionPreference = 'Stop'

function Test-AmqpPort {
    $amqpClient = New-Object System.Net.Sockets.TcpClient
    try {
        $amqpConnect = $amqpClient.ConnectAsync('127.0.0.1', 5672)
        if (-not $amqpConnect.Wait(1000)) { return $false }
        return $amqpClient.Connected
    } catch {
        return $false
    } finally {
        $amqpClient.Dispose()
    }
}

if (Test-AmqpPort) {
    Write-Host 'RabbitMQ AMQP port 5672 is already reachable.'
    return
}

if (-not $RabbitMqSbin) {
    $rabbitInstallRoot = Join-Path $env:ProgramFiles 'RabbitMQ Server'
    $rabbitInstallation = Get-ChildItem -LiteralPath $rabbitInstallRoot -Directory -ErrorAction SilentlyContinue |
        Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'sbin\rabbitmq-server.bat') } |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($rabbitInstallation) { $RabbitMqSbin = Join-Path $rabbitInstallation.FullName 'sbin' }
}

if (-not $RabbitMqSbin) {
    throw 'RabbitMQ installation not found. Supply -RabbitMqSbin with the installed sbin directory.'
}
$rabbitLauncher = Join-Path $RabbitMqSbin 'rabbitmq-server.bat'
if (-not (Test-Path -LiteralPath $rabbitLauncher -PathType Leaf)) {
    throw "RabbitMQ launcher not found: $rabbitLauncher"
}

# The Windows service may be Disabled or require Administrator privileges.
# Start the installed broker under the current user with its existing configuration/data.
# Do not reset users, queues, the Erlang cookie, or the broker database.
Write-Host 'Starting the installed RabbitMQ broker under the current Windows user...'
Start-Process -FilePath $rabbitLauncher -ArgumentList '-detached' -WorkingDirectory $RabbitMqSbin -WindowStyle Hidden | Out-Null
for ($amqpAttempt = 0; $amqpAttempt -lt 40; $amqpAttempt++) {
    if (Test-AmqpPort) {
        Write-Host 'RabbitMQ AMQP port 5672 is reachable. Existing application consumers can reconnect.'
        return
    }
    Start-Sleep -Seconds 1
}
throw 'RabbitMQ did not open port 5672. Check the RabbitMQ logs under %APPDATA%\RabbitMQ\log.'
