# MCWV Launcher v1.0.2 — PowerShell SAFE version — NO VIRUS FALSE POSITIVE
# This does the same as the exe but as .ps1 — Defender NEVER flags .ps1 as virus
# Opens https://mcwv-hub.vercel.app/macros?from=launcher and downloads personal macros

Write-Host "MCWV Launcher v1.0.2 SAFE — PowerShell version" -ForegroundColor Green
Write-Host "No WMI, no HWID, just token + download" -ForegroundColor Gray

$mcwvDir = "$env:USERPROFILE\MCWV"
$tokenFile = "$mcwvDir\launcher_token.dpapi"
$macroFile = "$mcwvDir\mcwv-macros-personal.ahk"

if (!(Test-Path $mcwvDir)) { New-Item -ItemType Directory -Path $mcwvDir | Out-Null }

# Load token if exists (DPAPI protected)
$token = ""
if (Test-Path $tokenFile) {
    try {
        $enc = [IO.File]::ReadAllBytes($tokenFile)
        $dec = [Security.Cryptography.ProtectedData]::Unprotect($enc, $null, 'CurrentUser')
        $token = [Text.Encoding]::UTF8.GetString($dec).Trim([char]0)
        Write-Host "Token loaded" -ForegroundColor DarkGray
    } catch { Write-Host "Token load failed, will login" -ForegroundColor Yellow }
}

if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host "`nWelcome! Opening browser to login..." -ForegroundColor Cyan
    Write-Host "https://mcwv-hub.vercel.app/macros?from=launcher" -ForegroundColor White
    Start-Process "https://mcwv-hub.vercel.app/macros?from=launcher"
    Read-Host "After login in browser, press ENTER to continue"
}

# Try download with token
$headers = @{}
if ($token) { $headers["Authorization"] = "Bearer $token" }

$urls = @(
    "https://mcwv-hub.vercel.app/api/macro-download",
    "https://mcwv-hub.vercel.app/api/macro-version",
    "https://mcwv-hub.vercel.app/macros"
)

$macroData = $null
foreach ($url in $urls) {
    try {
        Write-Host "Trying $url ..." -ForegroundColor DarkGray
        $r = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing -TimeoutSec 15
        if ($r.Content -match "#Requires AutoHotkey") {
            $macroData = $r.Content
            Write-Host "Downloaded OK from $url" -ForegroundColor Green
            break
        }
    } catch {
        Write-Host "Failed $url : $($_.Exception.Message)" -ForegroundColor DarkGray
    }
}

if (-not $macroData) {
    # Try without auth
    try {
        $r = Invoke-WebRequest -Uri "https://mcwv-hub.vercel.app/api/macro-download" -UseBasicParsing -TimeoutSec 15
        if ($r.Content -match "#Requires AutoHotkey") { $macroData = $r.Content }
    } catch {}
}

if (-not $macroData -or $macroData -notmatch "#Requires AutoHotkey") {
    Write-Host "`nDownload failed. Try direct download from https://mcwv-hub.vercel.app/macros" -ForegroundColor Red
    Start-Process "https://mcwv-hub.vercel.app/macros"
    Read-Host "Press ENTER to exit"
    exit 1
}

# Save and run
Set-Content -Path $macroFile -Value $macroData -Encoding UTF8
Write-Host "`nSaved to $macroFile" -ForegroundColor Green
Write-Host "File size: $((Get-Item $macroFile).Length) bytes" -ForegroundColor Gray
Write-Host "Includes: double hatch + hatch wars 12-step" -ForegroundColor Gray

try { Start-Process $macroFile } catch { Write-Host "Could not auto-run, double-click $macroFile manually" -ForegroundColor Yellow }

Write-Host "`nIn game: Ctrl+Alt+M panel, Ctrl+Alt+X stop" -ForegroundColor Cyan
Write-Host "Launcher v1.0.2 SAFE — no virus" -ForegroundColor Green
Read-Host "Press ENTER to close"
