# One-time setup of a Windows test machine (VM) so an agent on the Mac can work in it over SSH (phase 7 W0).
# Easiest: run scripts/windows/connect-vm.sh on the Mac; it makes a key and runs this in the VM for you.
# By hand: once in the VM, in Windows PowerShell "Run as administrator":
#
#   powershell -ExecutionPolicy Bypass -File setup-vm.ps1 -PublicKey "ssh-ed25519 AAAA... you@mac"
#
# -SkipTools leaves Node/Git out (connect-vm.sh installs them over SSH when this runs as SYSTEM via prlctl exec).
#
# What it does: OpenSSH server (PowerShell as its shell) with your Mac's public key, Node.js LTS + Git via winget,
# no sleep while plugged in, and prints the address to ssh to. It does NOT install Illustrator: sign in to Creative
# Cloud, install Illustrator, start it once and close its first-run dialogs yourself (the only manual part).
# Untested until W0 (written 2026-11-23 without a Windows machine).
param([string]$PublicKey, [switch]$SkipTools)
$ErrorActionPreference = 'Stop'
if (-not $PublicKey) { throw 'give -PublicKey "ssh-ed25519 ..."' }

function Step($m) { Write-Host "==> $m" }

Step 'OpenSSH server'
$cap = Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Server*' | Select-Object -First 1
if ($cap.State -ne 'Installed') { Add-WindowsCapability -Online -Name $cap.Name | Out-Null }
Set-Service -Name sshd -StartupType Automatic
Start-Service sshd
New-ItemProperty -Path 'HKLM:\SOFTWARE\OpenSSH' -Name DefaultShell -PropertyType String -Force `
  -Value "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" | Out-Null
# The rule Windows creates covers Private networks only; a Parallels shared network is Public (seen 2026-11-23)
if (Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue) {
  Set-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -Profile Any -Enabled True
} else {
  New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH Server (sshd)' -Profile Any -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 | Out-Null
}

Step 'Authorized key'
# Members of Administrators use the shared administrators_authorized_keys file (sshd_config default on Windows).
$isAdmin = (New-Object Security.Principal.WindowsPrincipal ([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($isAdmin) {
  $f = "$env:ProgramData\ssh\administrators_authorized_keys"
  if (-not ((Test-Path $f) -and (Select-String -Path $f -SimpleMatch $PublicKey -Quiet))) { Add-Content -Path $f -Value $PublicKey }
  # Administrators and SYSTEM by SID: the names are localised
  icacls.exe $f /inheritance:r /grant '*S-1-5-32-544:F' /grant '*S-1-5-18:F' | Out-Null
} else {
  $d = Join-Path $env:USERPROFILE '.ssh'
  New-Item -ItemType Directory -Force -Path $d | Out-Null
  Add-Content -Path (Join-Path $d 'authorized_keys') -Value $PublicKey
}

if (-not $SkipTools) {
  Step 'Node.js LTS and Git (winget)'
  foreach ($id in @('OpenJS.NodeJS.LTS', 'Git.Git')) {
    winget install --id $id -e --silent --accept-package-agreements --accept-source-agreements --scope machine
  }
}

Step 'No sleep while plugged in (the agent works while you are away)'
powercfg /change standby-timeout-ac 0
powercfg /change monitor-timeout-ac 0

Step 'Done'
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1).IPAddress
Write-Host "From the Mac:  ssh $env:USERNAME@$ip"
Write-Host 'Stay logged in to Windows: Illustrator and the live tests run in your desktop session (scripts/windows/run-interactive.ps1).'
Write-Host 'Next: install Illustrator from Creative Cloud, start it once, close the first-run dialogs.'
