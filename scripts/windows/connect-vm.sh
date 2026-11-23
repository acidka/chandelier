#!/bin/bash
# Phase 7 W0 from the Mac: make the Parallels Windows VM reachable for the agent over SSH, in one run.
#
#   scripts/windows/connect-vm.sh ["VM name"]      (default: the first VM whose name contains "Windows")
#
# 1. Makes an SSH key in tmp/windows-vm/ (git-ignored; ~/.ssh is not touched) and an ssh config there.
# 2. Starts the VM and waits for Parallels Tools.
# 3. Runs setup-vm.ps1 in the VM (OpenSSH server + this key) through `prlctl exec`; if Parallels refuses exec
#    (edition without it), puts a one-line command on the clipboard to paste into PowerShell in the VM.
# 4. Waits for SSH, installs Node.js LTS and Git over SSH (winget), clones the repo (develop) to C:\src\chandelier.
# Afterwards:  ssh -F tmp/windows-vm/ssh_config win
# Still manual: install Illustrator from Creative Cloud in the VM, start it once, close its first-run dialogs.
# Safe to re-run. Written 2026-11-23.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/tmp/windows-vm"
KEY="$DIR/id_ed25519"
CFG="$DIR/ssh_config"
PRLCTL="/Applications/Parallels Desktop.app/Contents/MacOS/prlctl"
command -v prlctl >/dev/null 2>&1 && PRLCTL="$(command -v prlctl)"
REPO="https://github.com/acidka/chandelier.git"
BRANCH="develop"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[31mError: %s\033[0m\n' "$*" >&2; exit 1; }

[ -x "$PRLCTL" ] || die "Parallels Desktop not found (expected $PRLCTL)."

# --- 1. key + config ---------------------------------------------------------------------------------------------
mkdir -p "$DIR"; chmod 700 "$DIR"
if [ ! -f "$KEY" ]; then
  say "Making an SSH key in tmp/windows-vm/"
  ssh-keygen -q -t ed25519 -N '' -C "chandelier-agent" -f "$KEY"
fi
PUB="$(cat "$KEY.pub")"

# --- 2. VM -------------------------------------------------------------------------------------------------------
VM="${1:-}"
if [ -z "$VM" ]; then
  VM="$("$PRLCTL" list -a -o name --no-header | sed 's/[[:space:]]*$//' | grep -i windows | head -1 || true)"
  [ -n "$VM" ] || die "No VM with \"Windows\" in its name. Pass the VM name: $0 \"My VM\""
fi
say "VM: $VM"
status="$("$PRLCTL" list -a -o status,name --no-header | grep -F "$VM" | awk '{print $1}' | head -1)"
case "$status" in
  running) ;;
  suspended|paused) "$PRLCTL" resume "$VM" ;;
  *) "$PRLCTL" start "$VM" ;;
esac

vm_ps() { # run a PowerShell script (stdin) in the VM as SYSTEM through Parallels Tools
  local b64; b64="$(iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n')"
  "$PRLCTL" exec "$VM" powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand "$b64"
}

say "Waiting for Windows and Parallels Tools (log in to Windows in the VM window if it asks)"
EXEC=0
for _ in $(seq 1 60); do
  if out="$(echo 'Write-Output ok' | vm_ps 2>&1)"; then
    case "$out" in *ok*) EXEC=1; break ;; esac
  fi
  case "${out:-}" in *[Ll]icen*|*[Ee]dition*|*not\ supported*|*[Pp]ermission*) break ;; esac
  sleep 5
done

# setup-vm.ps1 with the key filled in (its param() line removed: an encoded command can't take parameters)
payload() {
  printf '$PublicKey = %s\n$SkipTools = $%s\n' "'$PUB'" "$1"
  sed '/^param(/d' "$ROOT/scripts/windows/setup-vm.ps1"
}

# --- 3. OpenSSH in the VM ------------------------------------------------------------------------------------------
if [ "$EXEC" = 1 ]; then
  say "Setting up OpenSSH in the VM (prlctl exec, takes a few minutes the first time)"
  payload true | vm_ps || die "setup-vm.ps1 failed in the VM (output above)."
  WINUSER="$(echo '(Get-CimInstance Win32_ComputerSystem).UserName' | vm_ps | tr -d '\r' | tail -1)"
  WINUSER="${WINUSER##*\\}"
else
  b64="$(payload false | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n')"
  printf "Start-Process powershell -Verb RunAs -ArgumentList '-NoExit','-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','%s'\n" "$b64" | pbcopy
  say "Parallels did not allow prlctl exec (${out:-no answer}). One manual step:"
  echo "   In the VM: Start → type PowerShell → Enter, then paste (Ctrl+V) and press Enter; click Yes in the UAC prompt."
  echo "   (The command is on the clipboard; Parallels shares it with the VM.)"
  read -r -p "   Press Enter here when the blue window says 'Done'… " _
  WINUSER=""
fi
[ -n "$WINUSER" ] || read -r -p "Windows user name in the VM [$USER]: " WINUSER
WINUSER="${WINUSER:-$USER}"

IP=""
for _ in $(seq 1 30); do
  IP="$("$PRLCTL" list -a -o ip,name --no-header | grep -F "$VM" | awk '{print $1}' | grep -E '^[0-9]+\.' | head -1 || true)"
  [ -n "$IP" ] && break; sleep 2
done
[ -n "$IP" ] || read -r -p "VM IP address (setup printed it): " IP

cat > "$CFG" <<EOF
Host win
  HostName $IP
  User $WINUSER
  IdentityFile $KEY
  IdentitiesOnly yes
  UserKnownHostsFile $DIR/known_hosts
  StrictHostKeyChecking accept-new
  ServerAliveInterval 30
EOF
S() { ssh -F "$CFG" -o BatchMode=yes -o ConnectTimeout=5 win "$@"; }

say "Waiting for SSH at $WINUSER@$IP"
ok=0
for _ in $(seq 1 30); do S 'Write-Output ready' 2>/dev/null | grep -q ready && { ok=1; break; }; sleep 3; done
[ "$ok" = 1 ] || die "SSH does not answer. Check in the VM: Get-Service sshd; your user must be an administrator."

# --- 4. tools + repo ---------------------------------------------------------------------------------------------
say "Node.js and Git"
S 'foreach ($id in @("OpenJS.NodeJS.LTS","Git.Git")) { winget list --id $id -e --accept-source-agreements *> $null; if ($LASTEXITCODE -ne 0) { winget install --id $id -e --silent --accept-package-agreements --accept-source-agreements --scope machine } }' \
  || echo "   winget over SSH failed: install Node.js LTS and Git in the VM by hand, then re-run this script."
# new SSH sessions see the updated machine PATH
S '$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine"); node -v; git --version' || true

say "Repository → C:\\src\\chandelier ($BRANCH)"
S "\$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine'); if (-not (Test-Path C:\\src\\chandelier\\.git)) { New-Item -ItemType Directory -Force C:\\src | Out-Null; git clone -q $REPO C:\\src\\chandelier }; cd C:\\src\\chandelier; git fetch -q origin; git checkout -q $BRANCH 2>\$null; git pull -q 2>\$null; git log --oneline -1" \
  || echo "   Clone failed (is $BRANCH pushed?). The agent can sync it later."

# sshd hands new sessions the PATH it started with: restart it so they see Node and Git
S 'Restart-Service sshd' >/dev/null 2>&1 || true

say "Done. The agent connects with:  ssh -F tmp/windows-vm/ssh_config win"
echo "   Still yours: install Illustrator from Creative Cloud in the VM (English UI), start it once, close the first-run dialogs."
echo "   Keep Windows logged in; live tests run in your desktop session (scripts/windows/run-interactive.ps1)."
