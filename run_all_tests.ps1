# Amalfi Sanctuary: Full-Spectrum Test Runner
# Runs the deploy-facing checks for chatbot, guest web, admin desktop, and admin desk.

$ErrorActionPreference = "Continue"
$reportDir = Join-Path -Path $PSScriptRoot -ChildPath "amalfi-ops\reports"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null
$logPath = Join-Path -Path $reportDir -ChildPath "test_summary_success.txt"
$overallFailed = $false

"AMALFI RESORT: FULL TEST LABORATORY REPORT`nGenerated: $(Get-Date)`n" | Out-File $logPath -Encoding utf8
"==========================================================" | Out-File $logPath -Append -Encoding utf8

function LogResult($Module, $Status, $Details) {
    $color = "Red"
    if ($Status -eq "PASS") { $color = "Green" }
    Write-Host "[$Status] $Module - $Details" -ForegroundColor $color
}

function EnsureNodeModules($ModulePath) {
    if (!(Test-Path (Join-Path $ModulePath "node_modules"))) {
        npm install --no-audit --silent
    }
}

function InvokeLoggedCommand($Module, $Label, [scriptblock]$Command) {
    "--- $Module / $Label ---`n" | Out-File $logPath -Append -Encoding utf8
    $output = & $Command 2>&1
    $exitCode = $LASTEXITCODE
    $output | Out-String | Out-File $logPath -Append -Encoding utf8

    if ($exitCode -eq 0) {
        LogResult "$Module" "PASS" "$Label"
        "`n[PASS] $Module / $Label`n" | Out-File $logPath -Append -Encoding utf8
        return $true
    }

    $script:overallFailed = $true
    LogResult "$Module" "FAIL" "$Label (exit code: $exitCode)"
    "`n[FAIL] $Module / $Label (exit code: $exitCode)`n" | Out-File $logPath -Append -Encoding utf8
    return $false
}

function CleanWebTestDatabases() {
    $testDir = Join-Path $PSScriptRoot "amalfi-web\tests"
    Get-ChildItem -Path $testDir -Filter "*.sqlite*" -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -ne "test_database.sqlite" } |
        Remove-Item -Force -ErrorAction SilentlyContinue
}

function Test-LocalHubReady() {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3101/api/v1/public/portal-status" -TimeoutSec 3
        return ($response.StatusCode -lt 500)
    } catch {
        return $false
    }
}

function Start-LocalHubForBrowser() {
    if (Test-LocalHubReady) {
        Write-Host "Local Hub already reachable for browser checks." -ForegroundColor DarkGray
        return $null
    }

    Write-Host "Starting local Hub API for browser checks..." -ForegroundColor DarkGray
    $hubRoot = Join-Path $PSScriptRoot "amalfi-hub"
    $nodePath = "node"
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $nodePath
    $startInfo.Arguments = "server.js"
    $startInfo.WorkingDirectory = $hubRoot
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $false
    $startInfo.RedirectStandardError = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.Environment["BROWSER"] = "none"
    $startInfo.Environment["PORT"] = "3101"

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    [void]$process.Start()

    $deadline = (Get-Date).AddSeconds(35)
    while ((Get-Date) -lt $deadline) {
        if (Test-LocalHubReady) {
            Write-Host "Local Hub API is ready." -ForegroundColor DarkGray
            return $process
        }
        if ($process.HasExited) {
            throw "Local Hub API exited before readiness."
        }
        Start-Sleep -Milliseconds 500
    }

    try {
        if ($env:OS -eq "Windows_NT") {
            Start-Process -FilePath "taskkill.exe" -ArgumentList @("/pid", "$($process.Id)", "/t", "/f") -WindowStyle Hidden -Wait
        } else {
            $process.Kill()
        }
    } catch {}
    throw "Timed out waiting for local Hub API on http://127.0.0.1:3101"
}

function Stop-LocalHubForBrowser($HubProcess) {
    if ($null -eq $HubProcess) { return }
    if ($HubProcess.HasExited) { return }
    Write-Host "Stopping local Hub API used for browser checks..." -ForegroundColor DarkGray
    try {
        if ($env:OS -eq "Windows_NT") {
            Start-Process -FilePath "taskkill.exe" -ArgumentList @("/pid", "$($HubProcess.Id)", "/t", "/f") -WindowStyle Hidden -Wait
        } else {
            $HubProcess.Kill()
        }
        $HubProcess.WaitForExit(5000) | Out-Null
    } catch {
        Write-Host "Warning: could not stop local Hub API process cleanly: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

Write-Host "Cleaning orphan test databases..." -ForegroundColor DarkGray
CleanWebTestDatabases

Write-Host "`nLaunching Amalfi Test Laboratory..." -ForegroundColor Cyan
Write-Host "=========================================="

# --- MODULE 1: CHATBOT ---
Write-Host "`n[1/4] Testing Chatbot..." -ForegroundColor Yellow
Push-Location (Join-Path $PSScriptRoot "amalfi-chatbot")
try {
    pip install -q pytest pytest-asyncio pytest-cov httpx 2>$null
    InvokeLoggedCommand "Chatbot" "pytest webhooks, AI availability, and monitor feed" {
        python -m pytest tests/test_webhooks.py tests/test_ai_availability.py tests/test_chat_monitor_feed.py -v
    } | Out-Null
} catch {
    $overallFailed = $true
    LogResult "Chatbot" "FAIL" "Env Error: $($_.Exception.Message)"
    "`n[FAIL] Chatbot: Env Error: $($_.Exception.Message)`n" | Out-File $logPath -Append -Encoding utf8
} finally {
    Pop-Location
}

# --- MODULE 2: GUEST WEB ---
Write-Host "`n[2/4] Testing Guest Web App..." -ForegroundColor Yellow
Push-Location (Join-Path $PSScriptRoot "amalfi-web")
try {
    EnsureNodeModules (Get-Location)
    CleanWebTestDatabases

    InvokeLoggedCommand "Guest Web" "production build" { npm run build } | Out-Null
    InvokeLoggedCommand "Guest Web" "Vitest coverage suite" { npm test } | Out-Null

    $hubProcess = Start-LocalHubForBrowser
    try {
        InvokeLoggedCommand "Guest Web" "Playwright guest booking smoke" { npm run test:browser } | Out-Null
    } finally {
        Stop-LocalHubForBrowser $hubProcess
    }

    CleanWebTestDatabases
} catch {
    $overallFailed = $true
    LogResult "Guest Web" "FAIL" "Env Error: $($_.Exception.Message)"
    "`n[FAIL] Guest Web: Env Error: $($_.Exception.Message)`n" | Out-File $logPath -Append -Encoding utf8
} finally {
    Pop-Location
}

# --- MODULE 3: ADMIN DESKTOP ---
Write-Host "`n[3/4] Testing Admin Desktop App..." -ForegroundColor Yellow
Push-Location (Join-Path $PSScriptRoot "amalfi-admin")
try {
    EnsureNodeModules (Get-Location)

    InvokeLoggedCommand "Admin Desktop" "production build" { npm run build } | Out-Null
    InvokeLoggedCommand "Admin Desktop" "Vitest unit and component suite" { npm test } | Out-Null

    $hubProcess = Start-LocalHubForBrowser
    try {
        InvokeLoggedCommand "Admin Desktop" "Playwright manual booking smoke" { npm run test:browser } | Out-Null
    } finally {
        Stop-LocalHubForBrowser $hubProcess
    }
} catch {
    $overallFailed = $true
    LogResult "Admin Desktop" "FAIL" "Env Error: $($_.Exception.Message)"
    "`n[FAIL] Admin Desktop: Env Error: $($_.Exception.Message)`n" | Out-File $logPath -Append -Encoding utf8
} finally {
    Pop-Location
}

# --- MODULE 4: ADMIN DESK MOBILE ---
Write-Host "`n[4/4] Testing Admin Desk Mobile App..." -ForegroundColor Yellow
Push-Location (Join-Path $PSScriptRoot "amalfi-mobile-admin")
try {
    EnsureNodeModules (Get-Location)

    InvokeLoggedCommand "Admin Desk" "production build" { npm run build } | Out-Null
    InvokeLoggedCommand "Admin Desk" "Vitest controls suite" { npm test } | Out-Null

    $hubProcess = Start-LocalHubForBrowser
    try {
        InvokeLoggedCommand "Admin Desk" "Playwright mobile navigation smoke" { npm run test:browser } | Out-Null
        InvokeLoggedCommand "Admin Desk" "Playwright mobile booking mutation" { npm run test:browser:mutation } | Out-Null
    } finally {
        Stop-LocalHubForBrowser $hubProcess
    }
} catch {
    $overallFailed = $true
    LogResult "Admin Desk" "FAIL" "Env Error: $($_.Exception.Message)"
    "`n[FAIL] Admin Desk: Env Error: $($_.Exception.Message)`n" | Out-File $logPath -Append -Encoding utf8
} finally {
    Pop-Location
}

"==========================================================" | Out-File $logPath -Append -Encoding utf8
Write-Host "`n=========================================="
Write-Host "Check FULL RESULTS in $logPath"
if ($overallFailed) {
    Write-Host "FULL TEST VALIDATION FAILED" -ForegroundColor Red
    exit 1
}

Write-Host "ALL TESTS PASSED" -ForegroundColor Green
exit 0
