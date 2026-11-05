# Theater setup for Windows.
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1
# Checks Node.js, installs and builds the app, finds your receiver, writes .env, and can make Theater start
# automatically when you sign in. Run it again after `git pull` to update: it keeps your settings and restarts Theater.
# (Plain ASCII and Windows PowerShell 5.1 syntax on purpose, so it runs on any Windows 10/11.)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$AppDir = (Get-Location).Path
$TaskName = 'Theater'
$RuleName = 'Theater'
$Server = Join-Path $AppDir 'server\index.ts'

function Title($text) { Write-Host ''; Write-Host $text -ForegroundColor Cyan }
function AskYes($question, $default = $true) {
  if ([Console]::IsInputRedirected) {
    Write-Host "  $question $(if ($default) { 'yes' } else { 'no' })"
    return $default
  }
  $hint = if ($default) { '[Y/n]' } else { '[y/N]' }
  $a = Read-Host "  $question $hint"
  if ([string]::IsNullOrWhiteSpace($a)) { return $default }
  return $a -match '^[Yy]'
}
function NodeOk($exe) {
  if (-not $exe -or -not (Test-Path $exe)) { return $false }
  & $exe -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)"
  return $LASTEXITCODE -eq 0
}
function FindNode {
  $candidates = @()
  $c = Get-Command node -ErrorAction SilentlyContinue
  if ($c) { $candidates += $c.Source }
  $candidates += (Join-Path $env:ProgramFiles 'nodejs\node.exe')
  foreach ($n in $candidates) { if (NodeOk $n) { return $n } }
  return $null
}
function Run($exe, [string[]]$arguments) {
  & $exe @arguments
  if ($LASTEXITCODE -ne 0) { throw "'$exe $($arguments -join ' ')' failed (exit code $LASTEXITCODE)" }
}
function StopTheater {
  # Stops Theater processes started by the scheduled task (they are recognized by this folder's server path).
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($Server) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

# ---------- Node.js ----------
Title 'Node.js'
$node = FindNode
if (-not $node) {
  $current = Get-Command node -ErrorAction SilentlyContinue
  $found = if ($current) { (& $current.Source -v) } else { 'none' }
  Write-Host "  Theater needs Node.js 22.18 or newer (found: $found)."
  if ((Get-Command winget -ErrorAction SilentlyContinue) -and (AskYes 'Install the current Node.js LTS with winget?')) {
    & winget install --exact --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) { & winget upgrade --exact --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements }
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
    $node = FindNode
  }
  if (-not $node) {
    Write-Host '  Install Node.js 22.18 or newer from https://nodejs.org, then run setup again.' -ForegroundColor Yellow
    exit 1
  }
}
Write-Host "  Using Node $(& $node -v) ($node)"
$env:Path = (Split-Path $node) + ';' + $env:Path # npm below runs with this Node

# ---------- install and build ----------
Title 'Installing and building'
StopTheater # a running copy would keep files in use
Run 'npm.cmd' @('ci', '--no-audit', '--no-fund')
Run 'npm.cmd' @('run', 'build')

# ---------- settings ----------
Title 'Settings'
Run $node @('scripts/setup.ts', 'configure')
$port = 8787
$m = Select-String -Path (Join-Path $AppDir '.env') -Pattern '^\s*PORT\s*=\s*(\d+)' | Select-Object -First 1
if ($m) { $port = [int]$m.Matches[0].Groups[1].Value }

# ---------- firewall ----------
Title 'Network access'
$rule = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue | Select-Object -First 1
$rulePort = if ($rule) { ($rule | Get-NetFirewallPortFilter).LocalPort } else { $null }
if ($rule -and "$rulePort" -eq "$port") {
  Write-Host "  Windows Firewall already lets your local network reach port $port."
} elseif (AskYes "Let phones and tablets on your network reach Theater? (adds a Windows Firewall rule for port $port; Windows asks for permission)") {
  $cmd = "Remove-NetFirewallRule -DisplayName '$RuleName' -ErrorAction SilentlyContinue; " +
         "New-NetFirewallRule -DisplayName '$RuleName' -Description 'Theater web remote (local network only)' " +
         "-Direction Inbound -Protocol TCP -LocalPort $port -RemoteAddress LocalSubnet -Action Allow | Out-Null"
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($cmd))
  try {
    Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList "-NoProfile -EncodedCommand $encoded"
    Write-Host "  Added. Devices on your local network can reach port $port."
  } catch {
    Write-Host '  Skipped (permission was not given). Only this computer can open Theater.' -ForegroundColor Yellow
  }
}

# ---------- start automatically ----------
Title 'Start automatically'
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$autostart = $false
if ($task -or (AskYes 'Start Theater automatically when you sign in to Windows?')) {
  if ($task) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  }
  StopTheater
  # A hidden PowerShell window starts Node, so no console window stays open.
  $q = { param($s) "'" + $s.Replace("'", "''") + "'" }
  $inner = "Set-Location -LiteralPath $(& $q $AppDir); & $(& $q $node) --env-file-if-exists=.env $(& $q $Server); exit `$LASTEXITCODE"
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory $AppDir `
    -Argument "-NoProfile -WindowStyle Hidden -EncodedCommand $([Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($inner)))"
  $user = "$env:USERDOMAIN\$env:USERNAME"
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
  $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
  $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description "Theater web remote ($AppDir). Created by setup.ps1; run setup.ps1 again to update it." | Out-Null
  Start-ScheduledTask -TaskName $TaskName
  $autostart = $true
  Write-Host '  Theater is running, and starts whenever you sign in.'
}

# ---------- done ----------
Title 'Theater is ready'
if ($autostart) {
  Write-Host '  Open:'
} else {
  Write-Host '  Start it with:  npm start'
  Write-Host '  Then open:'
}
Run $node @('scripts/setup.ts', 'summary')
if ($autostart) {
  Write-Host ''
  Write-Host "  Stop it:   Stop-ScheduledTask $TaskName    Remove it:  Unregister-ScheduledTask $TaskName"
}
Write-Host ''
