#!/bin/bash
# Phase 7 W0 (x64 route): an x86_64 Windows 10 VM on an Apple Silicon Mac, installed unattended, reachable over SSH.
#
#   scripts/windows/make-x86-vm.sh <windows-10-x64.iso> ["VM name"]
#
# Why: Illustrator won't install on Windows 11 ARM64 (neither release nor beta, 2026-11-23). Parallels 20.2+ emulates
# x86_64 (hidden option --cpu-type x86; 1 vCPU, Windows 10 / Server 2022 guests; slow but real x64 Windows).
# The ISO: Windows 10 Enterprise 22H2 evaluation (90 days, no key), Microsoft's direct link:
#   https://go.microsoft.com/fwlink/p/?LinkID=2208844&clcid=0x409&culture=en-us&country=US
#
# Builds tmp/windows-vm/unattend.iso (Autounattend.xml + setup-vm.ps1): wipes the VM's disk, installs Windows,
# creates an administrator account named like your Mac user (password in tmp/windows-vm/password.txt), logs it in
# automatically, runs setup-vm.ps1 (OpenSSH + the key from connect-vm.sh). Then scripts/windows/connect-vm.sh
# "<VM name>" finishes (Node, Git, repo). Written 2026-11-23.
set -euo pipefail

ISO="${1:?usage: $0 <windows-10-x64.iso> [VM name]}"
VM="${2:-Windows 10 x64}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$ROOT/tmp/windows-vm"
PRLCTL="/Applications/Parallels Desktop.app/Contents/MacOS/prlctl"
command -v prlctl >/dev/null 2>&1 && PRLCTL="$(command -v prlctl)"
say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

[ -f "$ISO" ] || { echo "No ISO at $ISO" >&2; exit 1; }
mkdir -p "$DIR"; chmod 700 "$DIR"
[ -f "$DIR/id_ed25519" ] || ssh-keygen -q -t ed25519 -N '' -C chandelier-agent -f "$DIR/id_ed25519"
PUB="$(cat "$DIR/id_ed25519.pub")"
[ -f "$DIR/password.txt" ] || openssl rand -base64 24 | tr -dc "A-Za-z0-9" | cut -c1-20 > "$DIR/password.txt" # (tr|head under pipefail dies of SIGPIPE)
chmod 600 "$DIR/password.txt"
PASS="$(cat "$DIR/password.txt")"
WINUSER="${WINUSER:-$USER}"

say "Unattended setup disc (user $WINUSER)"
STAGE="$DIR/unattend"; rm -rf "$STAGE"; mkdir -p "$STAGE"
cp "$ROOT/scripts/windows/setup-vm.ps1" "$STAGE/setup-vm.ps1"
printf '%s\n' "$PUB" > "$STAGE/key.pub"
# Finds this disc by its files and runs setup-vm.ps1 with the key (FirstLogonCommands run as the new user, elevated).
cat > "$STAGE/firstlogon.cmd" <<'EOF'
@echo off
setlocal EnableDelayedExpansion
for %%d in (D E F G H I) do if exist %%d:\setup-vm.ps1 (
  set /p KEY=<%%d:\key.pub
  powershell -NoProfile -ExecutionPolicy Bypass -File %%d:\setup-vm.ps1 -PublicKey "!KEY!" -SkipTools > C:\Windows\Temp\chandelier-setup.log 2>&1
  goto :eof
)
EOF
perl -pi -e "s/\n/\r\n/" "$STAGE/firstlogon.cmd" # cmd wants CRLF
xml_escape() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }
PASS_X="$(printf '%s' "$PASS" | xml_escape)"
A='processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS" xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State"'
cat > "$STAGE/Autounattend.xml" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<unattend xmlns="urn:schemas-microsoft-com:unattend">
  <settings pass="windowsPE">
    <component name="Microsoft-Windows-International-Core-WinPE" $A>
      <SetupUILanguage><UILanguage>en-US</UILanguage></SetupUILanguage>
      <InputLocale>en-US</InputLocale><SystemLocale>en-US</SystemLocale><UILanguage>en-US</UILanguage><UserLocale>en-US</UserLocale>
    </component>
    <component name="Microsoft-Windows-Setup" $A>
      <DiskConfiguration>
        <Disk wcm:action="add">
          <DiskID>0</DiskID><WillWipeDisk>true</WillWipeDisk>
          <CreatePartitions>
            <CreatePartition wcm:action="add"><Order>1</Order><Type>EFI</Type><Size>260</Size></CreatePartition>
            <CreatePartition wcm:action="add"><Order>2</Order><Type>MSR</Type><Size>16</Size></CreatePartition>
            <CreatePartition wcm:action="add"><Order>3</Order><Type>Primary</Type><Extend>true</Extend></CreatePartition>
          </CreatePartitions>
          <ModifyPartitions>
            <ModifyPartition wcm:action="add"><Order>1</Order><PartitionID>1</PartitionID><Format>FAT32</Format><Label>System</Label></ModifyPartition>
            <ModifyPartition wcm:action="add"><Order>2</Order><PartitionID>3</PartitionID><Format>NTFS</Format><Label>Windows</Label><Letter>C</Letter></ModifyPartition>
          </ModifyPartitions>
        </Disk>
      </DiskConfiguration>
      <ImageInstall><OSImage>
        <InstallFrom><MetaData wcm:action="add"><Key>/IMAGE/INDEX</Key><Value>1</Value></MetaData></InstallFrom>
        <InstallTo><DiskID>0</DiskID><PartitionID>3</PartitionID></InstallTo>
      </OSImage></ImageInstall>
      <UserData><AcceptEula>true</AcceptEula><FullName>$WINUSER</FullName><Organization>chandelier</Organization></UserData>
    </component>
  </settings>
  <settings pass="specialize">
    <component name="Microsoft-Windows-Shell-Setup" $A>
      <ComputerName>CHANDELIER-W10</ComputerName><TimeZone>UTC</TimeZone>
    </component>
  </settings>
  <settings pass="oobeSystem">
    <component name="Microsoft-Windows-International-Core" $A>
      <InputLocale>en-US</InputLocale><SystemLocale>en-US</SystemLocale><UILanguage>en-US</UILanguage><UserLocale>en-US</UserLocale>
    </component>
    <component name="Microsoft-Windows-Shell-Setup" $A>
      <OOBE>
        <HideEULAPage>true</HideEULAPage><HideOnlineAccountScreens>true</HideOnlineAccountScreens>
        <HideWirelessSetupInOOBE>true</HideWirelessSetupInOOBE><HideLocalAccountScreen>true</HideLocalAccountScreen>
        <ProtectYourPC>3</ProtectYourPC><NetworkLocation>Work</NetworkLocation>
      </OOBE>
      <UserAccounts><LocalAccounts><LocalAccount wcm:action="add">
        <Name>$WINUSER</Name><Group>Administrators</Group><DisplayName>$WINUSER</DisplayName>
        <Password><Value>$PASS_X</Value><PlainText>true</PlainText></Password>
      </LocalAccount></LocalAccounts></UserAccounts>
      <AutoLogon><Enabled>true</Enabled><Username>$WINUSER</Username><LogonCount>9999999</LogonCount>
        <Password><Value>$PASS_X</Value><PlainText>true</PlainText></Password></AutoLogon>
      <FirstLogonCommands>
        <SynchronousCommand wcm:action="add"><Order>1</Order>
          <CommandLine>cmd /c for %d in (D E F G H I) do if exist %d:\firstlogon.cmd call %d:\firstlogon.cmd</CommandLine>
          <Description>Chandelier: OpenSSH and the agent key</Description></SynchronousCommand>
      </FirstLogonCommands>
    </component>
  </settings>
</unattend>
EOF
xmllint --noout "$STAGE/Autounattend.xml" # a typo would only show after an hour of emulated setup
rm -f "$DIR/unattend.iso"
hdiutil makehybrid -quiet -iso -joliet -default-volume-name UNATTEND -o "$DIR/unattend.iso" "$STAGE"

say "VM \"$VM\" (x86_64 emulation, 1 vCPU)"
if "$PRLCTL" list -a -o name --no-header | sed 's/[[:space:]]*$//' | grep -qxF "$VM"; then
  echo "A VM named \"$VM\" exists; delete it first (prlctl delete \"$VM\") or pass another name." >&2; exit 1
fi
"$PRLCTL" create "$VM" -d win-10 --cpu-type x86
"$PRLCTL" set "$VM" --cpus 1 --memsize 6144 >/dev/null
"$PRLCTL" set "$VM" --device-set cdrom0 --image "$ISO" --connect >/dev/null
"$PRLCTL" set "$VM" --device-add cdrom --image "$DIR/unattend.iso" --connect >/dev/null
"$PRLCTL" set "$VM" --device-bootorder "hdd0 cdrom0" >/dev/null 2>&1 || true
"$PRLCTL" list -i "$VM" | grep -iE "cpu |memory |cdrom|hdd0" || true

say "Starting; pressing a key for \"Press any key to boot from CD\""
"$PRLCTL" start "$VM"
for _ in $(seq 1 40); do "$PRLCTL" send-key-event "$VM" -s 28 >/dev/null 2>&1 || true; sleep 1.5; done

say "Windows is installing unattended (emulated: expect 1-2 hours). Then run:"
echo "   scripts/windows/connect-vm.sh \"$VM\""
