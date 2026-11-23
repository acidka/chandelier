# Run a command in the logged-in user's DESKTOP session and wait for it (phase 7 W0, for agents working over SSH).
#
# Why: an SSH session is a separate logon session. COM's running-object table is per session, so a process started
# over SSH can't attach to the Illustrator on the desktop (GetActiveObject fails) and anything it launches is
# invisible. A scheduled task with an Interactive logon runs in the desktop session, at normal (not elevated) level,
# like Illustrator itself.
#
#   ssh win 'powershell -File C:\src\chandelier\scripts\windows\run-interactive.ps1 -Dir C:\src\chandelier -Command "npm run test:live"'
#
# Prints the command's output and exits with its exit code. Needs the user to be logged in (not just the VM running).
# Untested until W0 (written 2026-11-23 without a Windows machine).
param(
  [Parameter(Mandatory = $true)][string]$Command,
  [string]$Dir = (Get-Location).Path,
  [int]$TimeoutSec = 1800
)
$ErrorActionPreference = 'Stop'
$name = 'ChandelierRun'
$work = Join-Path $env:TEMP 'chandelier-run'
New-Item -ItemType Directory -Force -Path $work | Out-Null
$log = Join-Path $work 'out.log'; $code = Join-Path $work 'exit.txt'; $cmd = Join-Path $work 'run.cmd'
Remove-Item -Force -ErrorAction SilentlyContinue $log, $code
Set-Content -Path $cmd -Encoding ASCII -Value @"
@echo off
cd /d "$Dir"
call $Command > "$log" 2>&1
echo %ERRORLEVEL% > "$code"
"@

$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name # USERDOMAIN is empty in SSH sessions
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$cmd`""
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds $TimeoutSec)
Register-ScheduledTask -TaskName $name -Action $action -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $name

$start = Get-Date; $until = $start.AddSeconds($TimeoutSec + 30); $seen = $false
while (-not (Test-Path $code)) {
  if ((Get-Date) -gt $until) { Write-Error "timed out after $TimeoutSec s"; exit 124 }
  $state = (Get-ScheduledTask -TaskName $name).State
  if ($state -eq 'Running') { $seen = $true }
  # Ended (or never started after 15 s) without writing an exit code: no desktop session to run in.
  if ($state -eq 'Ready' -and ($seen -or ((Get-Date) - $start).TotalSeconds -gt 15)) {
    Start-Sleep -Milliseconds 500
    if (-not (Test-Path $code)) { Write-Error 'the task ended without an exit code (is the user logged in to the desktop?)'; exit 125 }
  }
  Start-Sleep -Milliseconds 500
}
if (Test-Path $log) { Get-Content -Raw $log | Write-Output }
exit [int]((Get-Content -Raw $code).Trim())
