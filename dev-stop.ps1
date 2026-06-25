# ====================================================================
#  AMALFI RESORT -- LOCAL DEV STOPPER
#  Kills ALL local Amalfi dev services cleanly.
#  Run from: F:\PROJECTS\BUSINESS\Amalfi Resort\
#
#  Stops:
#    - All Node.js processes  (Hub API + Vite dev servers)
#    - All Python/uvicorn     (Chatbot)
# ====================================================================

Write-Host ''
Write-Host '  AMALFI RESORT -- Stopping All Local Dev Services' -ForegroundColor Red
Write-Host '  --------------------------------------------------' -ForegroundColor DarkGray
Write-Host ''

$stoppedAny = $false

# -- Kill Node.js (Hub API + Vite dev servers) ----------------------
$nodeProcs = Get-Process -Name 'node' -ErrorAction SilentlyContinue
if ($nodeProcs) {
    $count = $nodeProcs.Count
    Stop-Process -Name 'node' -Force -ErrorAction SilentlyContinue
    Write-Host "  OK Stopped $count Node.js process(es)  [Hub API + Vite apps]" -ForegroundColor Green
    $stoppedAny = $true
} else {
    Write-Host '  -- No Node.js processes found -- already stopped.' -ForegroundColor DarkGray
}

# -- Kill Python / uvicorn (Chatbot) --------------------------------
$pyProcs = Get-Process -Name 'python', 'python3', 'uvicorn' -ErrorAction SilentlyContinue
if ($pyProcs) {
    $count = $pyProcs.Count
    Stop-Process -Name 'python', 'python3', 'uvicorn' -Force -ErrorAction SilentlyContinue
    Write-Host "  OK Stopped $count Python/uvicorn process(es) [Chatbot]" -ForegroundColor Green
    $stoppedAny = $true
} else {
    Write-Host '  -- No Python/uvicorn processes found -- already stopped.' -ForegroundColor DarkGray
}

# -- Port verification ----------------------------------------------
Write-Host ''
$ports = @(3101, 5273, 5274, 5275, 8101)
$anyStillRunning = $false
foreach ($port in $ports) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        Write-Host "  WARN Port $port still in use (PID $($conn.OwningProcess))" -ForegroundColor Yellow
        $anyStillRunning = $true
    }
}

if (-not $anyStillRunning) {
    Write-Host '  OK  Ports 3101, 5273, 5274, 5275, 8101 -- all clear.' -ForegroundColor Green
}

Write-Host ''
if ($stoppedAny) {
    Write-Host '  All Amalfi services stopped. Safe to close.' -ForegroundColor Cyan
} else {
    Write-Host '  Nothing was running. All clear!' -ForegroundColor Cyan
}
Write-Host ''
