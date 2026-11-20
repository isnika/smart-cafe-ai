param(
  [Parameter(Mandatory = $true)]
  [string]$DockerHubUsername,

  [string]$Tag = "latest"
)

$ErrorActionPreference = "Stop"
$image = "$DockerHubUsername/smartcafe-frontend:$Tag"

docker build -t $image .
if ($LASTEXITCODE -ne 0) { throw "docker build failed" }

docker push $image
if ($LASTEXITCODE -ne 0) { throw "docker push failed" }

Write-Host "Published $image"
