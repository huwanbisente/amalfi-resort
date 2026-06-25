# ====================================================================
#  AMALFI RESORT -- LOCAL DEV LAUNCHER
#  Starts ALL services for local development.
#  Run from: F:\PROJECTS\BUSINESS\Amalfi Resort\
#
#  Services started:
#    [1] Hub API    -> Node / amalfi-hub/server.js      -> http://localhost:3101
#    [2] Guest Site -> Static Amalfi guest-web          -> http://localhost:5273
#    [3] Admin Hub  -> Static Amalfi desktop admin      -> http://localhost:5274
#    [4] Admin Desk -> Static Amalfi mobile-admin       -> http://localhost:5275
#    [5] Chatbot    -> Python / uvicorn                 -> http://localhost:8101
# ====================================================================

$root = $PSScriptRoot

function Get-EnvValue {
    param([string]$Key)

    $envValue = [Environment]::GetEnvironmentVariable($Key)
    if ($envValue) { return $envValue }

    $envFile = Join-Path $root '.env'
    if (-not (Test-Path $envFile)) { return $null }

    $line = Get-Content $envFile | Where-Object { $_ -match "^\s*$([regex]::Escape($Key))\s*=" } | Select-Object -First 1
    if (-not $line) { return $null }

    return (($line -split '=', 2)[1]).Trim().Trim('"').Trim("'")
}

$hubAdminToken = Get-EnvValue 'HUB_ADMIN_TOKEN'
if (-not $hubAdminToken) { $hubAdminToken = 'dev-token' }

Write-Host ''
Write-Host '  AMALFI RESORT -- Starting Local Dev Environment' -ForegroundColor Cyan
Write-Host '  ------------------------------------------------' -ForegroundColor DarkGray
Write-Host ''

# -- [1] Master Hub API (Node / server.js) --------------------------
Write-Host '  -> [1/5] Starting Master Hub API on :3101...' -ForegroundColor Yellow
$cmd1 = "Set-Location '$root\amalfi-hub'; `$env:PORT='3101'; `$env:HUB_ADMIN_TOKEN='$hubAdminToken'; `$env:CHATBOT_URL='http://localhost:8101'; Write-Host '  [HUB API] Starting on :3101...' -ForegroundColor Yellow; node server.js"
Start-Process powershell -ArgumentList @('-NoExit', '-Command', $cmd1)
Start-Sleep -Milliseconds 800

# -- [2] Guest Site (Static / guest-web) ----------------------------
Write-Host '  -> [2/5] Starting Guest Site on :5273...' -ForegroundColor Yellow
$cmd2 = "Set-Location '$root\guest-web'; `$env:PORT='5273'; `$env:HUB_ORIGIN='http://127.0.0.1:3101'; Write-Host '  [GUEST SITE] Starting on :5273...' -ForegroundColor Green; npm run dev"
Start-Process powershell -ArgumentList @('-NoExit', '-Command', $cmd2)
Start-Sleep -Milliseconds 500

# -- [3] Admin Hub (Static / root desktop admin) --------------------
Write-Host '  -> [3/5] Starting Admin Hub on :5274...' -ForegroundColor Yellow
$cmd3 = "Set-Location '$root'; `$env:PORT='5274'; `$env:HUB_ORIGIN='http://127.0.0.1:3101'; `$env:HUB_ADMIN_TOKEN='$hubAdminToken'; Write-Host '  [ADMIN HUB] Starting on :5274...' -ForegroundColor Magenta; npm run dev:admin"
Start-Process powershell -ArgumentList @('-NoExit', '-Command', $cmd3)
Start-Sleep -Milliseconds 500

# -- [4] Admin Desk (Static / mobile-admin) -------------------------
Write-Host '  -> [4/5] Starting Admin Desk on :5275...' -ForegroundColor Yellow
$cmd4 = "Set-Location '$root\mobile-admin'; `$env:PORT='5275'; `$env:HUB_ORIGIN='http://127.0.0.1:3101'; `$env:HUB_ADMIN_TOKEN='$hubAdminToken'; Write-Host '  [ADMIN DESK] Starting on :5275...' -ForegroundColor Blue; npm run dev"
Start-Process powershell -ArgumentList @('-NoExit', '-Command', $cmd4)
Start-Sleep -Milliseconds 500

# -- [5] Chatbot (Python / uvicorn) ---------------------------------
Write-Host '  -> [5/5] Starting Chatbot on :8101...' -ForegroundColor Yellow
$cmd5 = "Set-Location '$root\amalfi-chatbot'; `$env:HUB_URL='http://localhost:3101'; Write-Host '  [CHATBOT] Starting on :8101...' -ForegroundColor Cyan; if (Test-Path '.\.venv\Scripts\Activate.ps1') { .\.venv\Scripts\Activate.ps1 }; uvicorn main:app --host 0.0.0.0 --port 8101 --reload"
Start-Process powershell -ArgumentList @('-NoExit', '-Command', $cmd5)

# -- Summary --------------------------------------------------------
Write-Host ''
Write-Host '  ALL SERVICES SPINNING UP -- Check each window for status.' -ForegroundColor Green
Write-Host ''
Write-Host '  +-----------------------------------------------------+' -ForegroundColor DarkGray
Write-Host '  |  Hub API     ->  http://localhost:3101              |' -ForegroundColor DarkGray
Write-Host '  |  Guest Site  ->  http://localhost:5273              |' -ForegroundColor DarkGray
Write-Host '  |  Admin Hub   ->  http://localhost:5274              |' -ForegroundColor DarkGray
Write-Host '  |  Admin Desk  ->  http://localhost:5275              |' -ForegroundColor DarkGray
Write-Host '  |  Chatbot     ->  http://localhost:8101              |' -ForegroundColor DarkGray
Write-Host '  +-----------------------------------------------------+' -ForegroundColor DarkGray
Write-Host ''
Write-Host '  To stop everything, run: .\dev-stop.ps1' -ForegroundColor DarkGray
Write-Host ''
