# Install Node.js LTS and Git for Windows from their official downloads (no winget: fresh Windows 10 may lack it,
# and winget is unreliable over SSH). Run elevated (an administrator's SSH session is). Skips what is installed.
# Picks x64 or ARM64 builds by the machine. Used by connect-vm.sh. Written 2026-11-23.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$arm = $env:PROCESSOR_ARCHITECTURE -eq 'ARM64'
$tmp = Join-Path $env:TEMP 'chandelier-tools'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
Refresh-Path

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  $v = (Invoke-RestMethod 'https://nodejs.org/dist/index.json' | Where-Object { $_.lts } | Select-Object -First 1).version
  $a = 'x64'; if ($arm) { $a = 'arm64' }
  $msi = Join-Path $tmp "node-$v-$a.msi"
  Write-Host "Node.js $v ($a)"
  Invoke-WebRequest "https://nodejs.org/dist/$v/node-$v-$a.msi" -OutFile $msi -UseBasicParsing
  $p = Start-Process msiexec.exe -ArgumentList '/i', "`"$msi`"", '/qn', '/norestart' -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "Node.js installer exit code $($p.ExitCode)" }
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  $rel = Invoke-RestMethod 'https://api.github.com/repos/git-for-windows/git/releases/latest' -Headers @{ 'User-Agent' = 'chandelier-setup' }
  $pat = '^Git-[\d.]+-64-bit\.exe$'; if ($arm) { $pat = '^Git-[\d.]+-arm64\.exe$' }
  $asset = $rel.assets | Where-Object { $_.name -match $pat } | Select-Object -First 1
  $exe = Join-Path $tmp $asset.name
  Write-Host "Git $($rel.tag_name)"
  Invoke-WebRequest $asset.browser_download_url -OutFile $exe -UseBasicParsing
  $p = Start-Process $exe -ArgumentList '/VERYSILENT', '/NORESTART', '/SUPPRESSMSGBOXES', '/NOCANCEL', '/SP-' -Wait -PassThru
  if ($p.ExitCode -ne 0) { throw "Git installer exit code $($p.ExitCode)" }
}

Refresh-Path
node -v
git --version
