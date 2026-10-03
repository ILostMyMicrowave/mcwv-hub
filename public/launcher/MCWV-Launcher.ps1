$mcwvDir = "$env:USERPROFILE\MCWV"
$macroFile = "$mcwvDir\mcwv-macros-personal.ahk"
if (!(Test-Path $mcwvDir)) { New-Item -ItemType Directory -Path $mcwvDir | Out-Null }
Write-Host "Opening https://mcwv-hub.vercel.app/login?from=launcher"
Start-Process "https://mcwv-hub.vercel.app/login?from=launcher"
Read-Host "After login press ENTER"
try {
  Invoke-WebRequest -Uri https://mcwv-hub.vercel.app/api/macro-download -OutFile $macroFile -UseBasicParsing
  Start-Process $macroFile
} catch { Start-Process https://mcwv-hub.vercel.app/macros }
