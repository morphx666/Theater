# Theater setup for Windows.
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1 [-NoUpdate]
# Updates the app with git (unless -NoUpdate), checks Node.js, installs and builds the app, finds your receiver,
# writes .env, and can make Theater start automatically when you sign in. Run it again to update: it keeps your
# settings and restarts Theater.
# (Plain ASCII and Windows PowerShell 5.1 syntax on purpose, so it runs on any Windows 10/11.)
param([switch]$NoUpdate)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$AppDir = (Get-Location).Path
$TaskName = 'Theater'
$RuleName = 'Theater'
$Server = Join-Path $AppDir 'server\index.ts'

# Colors (same styles as setup.sh and scripts/setup.ts): off when not a terminal or with NO_COLOR.
$Esc = [char]27
$Ansi = (-not [Console]::IsOutputRedirected) -and (-not $env:NO_COLOR) -and $Host.UI.SupportsVirtualTerminal
function Style($code, $text) { if ($Ansi) { "$Esc[$($code)m$text$Esc[0m" } else { $text } }
function Title($text) { # section header: bold violet
  Write-Host ''
  if ($Ansi) { Write-Host (Style '1;38;5;135' $text) } else { Write-Host $text -ForegroundColor Magenta }
}
function AskYes($question, $default = $true) {
  if ([Console]::IsInputRedirected) {
    Write-Host "  $question $(if ($default) { 'yes' } else { 'no' })"
    return $default
  }
  $hint = if ($default) { '[Y/n]' } else { '[y/N]' }
  Write-Host -NoNewline "  $(Style 1 $question) $(Style 2 $hint) "
  $a = Read-Host
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

# ---------- update ----------
# Fast-forward only, so local edits and commits are never merged or overwritten. After an update, the new
# setup.ps1 runs in place of this one (THEATER_UPDATED stops it from updating again).
if (-not $NoUpdate -and -not $env:THEATER_UPDATED) {
  Title 'Update'
  if (-not (Test-Path (Join-Path $AppDir '.git'))) {
    Write-Host "  This copy wasn't downloaded with git, so setup can't update it. Installing it as it is."
  } elseif (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "  Git isn't installed, so setup can't check for updates. Installing this version."
  } else {
    $branchRef = & git symbolic-ref -q HEAD
    $upstream = if ($branchRef) { & git for-each-ref --format='%(upstream:short)' $branchRef } else { '' }
    $old = & git rev-parse --short HEAD
    if (-not $upstream) {
      Write-Host "  This copy isn't on a branch that follows GitHub, so setup didn't update it."
    } else {
      $env:GIT_TERMINAL_PROMPT = '0'
      & git fetch --quiet
      if ($LASTEXITCODE -ne 0) {
        Write-Host "  Couldn't check for updates (no connection?). Installing the version you have."
      } else {
        & git merge --ff-only --quiet $upstream
        $merged = $LASTEXITCODE -eq 0
        $new = & git rev-parse --short HEAD
        if (-not $merged) {
          Write-Host "  Couldn't update without touching your local changes. Installing the version you have."
        } elseif ($new -eq $old) {
          Write-Host "  Already up to date ($old)."
        } else {
          Write-Host "  Updated $old -> $new."
          $env:THEATER_UPDATED = '1'
          & (Get-Process -Id $PID).Path -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath
          exit $LASTEXITCODE
        }
      }
    }
  }
}

# ---------- Node.js ----------
Title 'Node.js'
$node = FindNode
if (-not $node) {
  $current = Get-Command node -ErrorAction SilentlyContinue
  $found = if ($current) { (& $current.Source -v) } else { 'none' }
  Write-Host "  Theater needs Node.js 22.18 or newer (found: $found)."
  if ((Get-Command winget -ErrorAction SilentlyContinue) -and
      (& { Write-Host '  Setup can install the current Node.js LTS with winget.'; AskYes 'Install it?' })) {
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
Run 'npm.cmd' @('ci', '--no-audit', '--no-fund', '--loglevel=error') # errors only
Run 'npm.cmd' @('run', 'build', '--silent', '--', '--logLevel', 'error')

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
} elseif (& {
    Write-Host "  Setup can add a Windows Firewall rule for port $port. Windows asks for permission."
    AskYes 'Let phones and tablets on your network reach Theater?'
  }) {
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
