# ====================================================================
#  AMALFI RESORT -- LOCAL DEV HEALTH CHECK
#  Verifies the local full-stack services and static-to-Hub proxies.
#  Run from: F:\PROJECTS\BUSINESS\Amalfi Resort\
# ====================================================================

$ErrorActionPreference = 'Stop'

function Get-EnvValue {
    param([string]$Key)

    $envValue = [Environment]::GetEnvironmentVariable($Key)
    if ($envValue) { return $envValue }

    $envFile = Join-Path $PSScriptRoot '.env'
    if (-not (Test-Path $envFile)) { return $null }

    $line = Get-Content $envFile | Where-Object { $_ -match "^\s*$([regex]::Escape($Key))\s*=" } | Select-Object -First 1
    if (-not $line) { return $null }

    return (($line -split '=', 2)[1]).Trim().Trim('"').Trim("'")
}

$adminToken = Get-EnvValue 'HUB_ADMIN_TOKEN'
if (-not $adminToken) { $adminToken = 'dev-token' }
$adminHeaders = @{ Authorization = "Bearer $adminToken" }

$checks = @(
    @{ Name = 'Hub API';      Url = 'http://localhost:3101/api/v1/public/knowledge'; Headers = @{}; Required = $true },
    @{ Name = 'Guest Site';   Url = 'http://localhost:5273/'; Headers = @{}; Required = $true },
    @{ Name = 'Admin Hub';    Url = 'http://localhost:5274/'; Headers = @{}; Required = $true },
    @{ Name = 'Admin Desk';   Url = 'http://localhost:5275/'; Headers = @{}; Required = $true },
    @{ Name = 'Chatbot';      Url = 'http://localhost:8101/'; Headers = @{}; Required = $false },
    @{ Name = 'Guest Assets'; Url = 'http://localhost:5273/api/v1/assets/logo/resort-logo.jpg'; Headers = @{}; Required = $true },
    @{ Name = 'Hero Asset';   Url = 'http://localhost:5273/api/v1/assets/hero/hero_premium.png'; Headers = @{}; Required = $true },
    @{ Name = 'Guest Proxy';  Url = 'http://localhost:5273/api/v1/public/knowledge'; Headers = @{}; Required = $true },
    @{ Name = 'Admin Proxy';  Url = 'http://localhost:5274/api/v1/admin/knowledge'; Headers = $adminHeaders; Required = $true },
    @{ Name = 'Desk Proxy';   Url = 'http://localhost:5275/api/v1/admin/knowledge'; Headers = $adminHeaders; Required = $true }
)

Write-Host ''
Write-Host '  AMALFI RESORT -- Local Health Check' -ForegroundColor Cyan
Write-Host '  -----------------------------------' -ForegroundColor DarkGray
Write-Host ''

$failed = @()

foreach ($check in $checks) {
    try {
        $response = Invoke-WebRequest -Uri $check.Url -Headers $check.Headers -UseBasicParsing -TimeoutSec 8
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
            Write-Host ("  OK   {0,-12} {1}" -f $check.Name, $check.Url) -ForegroundColor Green
        } else {
            Write-Host ("  WARN {0,-12} HTTP {1} - {2}" -f $check.Name, $response.StatusCode, $check.Url) -ForegroundColor Yellow
            if ($check.Required) { $failed += $check }
        }
    } catch {
        $label = if ($check.Required) { 'FAIL' } else { 'WARN' }
        $color = if ($check.Required) { 'Red' } else { 'Yellow' }
        Write-Host ("  {0,-4} {1,-12} {2}" -f $label, $check.Name, $check.Url) -ForegroundColor $color
        Write-Host ("       {0}" -f $_.Exception.Message) -ForegroundColor DarkGray
        if ($check.Required) { $failed += $check }
    }
}

Write-Host ''
if ($failed.Count -eq 0) {
    Write-Host '  All required local services and proxies responded.' -ForegroundColor Green
    exit 0
}

Write-Host "  $($failed.Count) required local check(s) failed. Start or restart with .\dev-start.ps1, then run this again." -ForegroundColor Yellow
exit 1
