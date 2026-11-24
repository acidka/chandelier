# Persistent Windows bridge to Adobe Illustrator (phase 7 W2; plan: docs/windows-plan.md section 3).
# Runs as ONE long-lived `powershell.exe -Sta -File bridge-win.ps1` (Windows PowerShell 5.1) per MCP server.
#
# Protocol (newline-delimited JSON), identical to bridge-mac.js:
#   stdin  <- {"id":1,"op":"js","code":"...","timeout":120}   ops: js | running | launch | activate | quit
#   stdout -> {"id":1,"ok":true,"result":"..."}  or  {"id":1,"ok":false,"error":"...","errno":-2147221021}
#   first line: {"id":0,"ok":true,"result":"ready"}
# errno is the COM HRESULT as a signed 32-bit int; src/transport/errors.ts explains it.
#
# - Attach, never launch: Marshal.GetActiveObject (and only after Get-Process sees Illustrator). New-Object -ComObject
#   is never used for Illustrator: it would start it.
# - The COM object is cached; on "disconnected / server died" it is dropped and the next call re-attaches.
# - An OLE message filter retries calls that a busy Illustrator rejects (RETRYLATER) until the request's timeout.
# - A COM call can't be cancelled: past its deadline the Node side kills this process and respawns it.
# - The pipe carries ASCII only (Node escapes non-ASCII; the runtime answers in ASCII JSON); I/O is UTF-8 anyway.
#
# CHANDELIER_FAKE_COM=1 replaces Illustrator with a fake (for CI without Illustrator), js code:
#   "echo:<s>" -> s | "sleep:<ms>" -> "slept" | "hr:<hex>" -> COM error with that HRESULT | "crash" -> exit 3
#   anything else -> "len:<length of code>". CHANDELIER_FAKE_RUNNING=no makes "running" answer "no".

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding $false
$stdin = [System.IO.StreamReader]::new([Console]::OpenStandardInput(), $utf8)
$out = [System.IO.StreamWriter]::new([Console]::OpenStandardOutput(), $utf8)
$out.NewLine = "`n"
$out.AutoFlush = $true

$CS = @'
using System;
using System.Reflection;
using System.Runtime.InteropServices;

namespace Chandelier {
  [ComImport, Guid("00000016-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IOleMessageFilter {
    [PreserveSig] int HandleInComingCall(int dwCallType, IntPtr hTaskCaller, int dwTickCount, IntPtr lpInterfaceInfo);
    [PreserveSig] int RetryRejectedCall(IntPtr hTaskCallee, int dwTickCount, int dwRejectType);
    [PreserveSig] int MessagePending(IntPtr hTaskCallee, int dwTickCount, int dwPendingType);
  }

  public class MessageFilter : IOleMessageFilter {
    // ms a rejected call is retried for; set per request from its timeout
    public static int LimitMs = 300000;
    [DllImport("ole32.dll")]
    static extern int CoRegisterMessageFilter(IOleMessageFilter newFilter, out IOleMessageFilter oldFilter);
    public static int Register() { IOleMessageFilter old; return CoRegisterMessageFilter(new MessageFilter(), out old); }

    int IOleMessageFilter.HandleInComingCall(int t, IntPtr h, int tick, IntPtr info) { return 0; } // SERVERCALL_ISHANDLED
    int IOleMessageFilter.RetryRejectedCall(IntPtr h, int tick, int rejectType) {
      if (rejectType == 2 && tick < LimitMs) return 100; // SERVERCALL_RETRYLATER: retry in 100 ms
      return -1; // give up: the call fails with RPC_E_CALL_REJECTED
    }
    int IOleMessageFilter.MessagePending(IntPtr h, int tick, int pendingType) { return 2; } // PENDINGMSG_WAITDEFPROCESS
  }

  public static class Com {
    // Late-bound IDispatch call; unwraps the reflection wrapper so the caller sees the COMException and its HRESULT.
    public static object Call(object target, string method, object[] args) {
      try { return target.GetType().InvokeMember(method, BindingFlags.InvokeMethod, null, target, args); }
      catch (TargetInvocationException e) { throw e.InnerException; }
    }
  }
}
'@
# Compiling $CS (csc.exe) costs ~2 s per start on a PC and over a minute on an emulated x64 VM: compile once into
# %LOCALAPPDATA%\chandelier\bridge-<hash of the source>.dll and load that afterwards.
$sha = [System.Security.Cryptography.SHA256]::Create()
$hash = -join ($sha.ComputeHash($utf8.GetBytes($CS))[0..7] | ForEach-Object { $_.ToString('x2') })
$dllDir = Join-Path $env:LOCALAPPDATA 'chandelier'
$dll = Join-Path $dllDir "bridge-$hash.dll"
$loaded = $false
if (Test-Path $dll) { try { Add-Type -Path $dll; $loaded = $true } catch { } }
if (-not $loaded) {
  try { # compile to a temp name, then rename: a second bridge starting at the same time never loads a half-written file
    New-Item -ItemType Directory -Force -Path $dllDir | Out-Null
    $tmpDll = Join-Path $dllDir ("bridge-$hash-" + [Guid]::NewGuid().ToString('N') + '.dll')
    Add-Type -TypeDefinition $CS -OutputAssembly $tmpDll -OutputType Library
    try { Move-Item -LiteralPath $tmpDll -Destination $dll -ErrorAction Stop; $tmpDll = $dll } catch { }
    Add-Type -Path $tmpDll
  } catch { Add-Type -TypeDefinition $CS } # no writable LOCALAPPDATA: compile in memory as before
}

$FAKE = $env:CHANDELIER_FAKE_COM -eq '1'
$PROGID = 'Illustrator.Application'
$HR_NOT_RUNNING = [Convert]::ToInt32('800401E3', 16)   # MK_E_UNAVAILABLE
$HR_NOT_INSTALLED = [Convert]::ToInt32('800401F3', 16) # CO_E_CLASSSTRING
# Illustrator quit or crashed; 800706BE (RPC_S_CALL_FAILED) is what the call in flight gets (W1)
$HR_GONE = @('80010108', '800706BA', '800706BE', '80010007', '80010012') | ForEach-Object { [Convert]::ToInt32($_, 16) }
$script:app = $null

if (-not $FAKE) { [void][Chandelier.MessageFilter]::Register() }

function Send($obj) { $out.WriteLine(($obj | ConvertTo-Json -Compress)) }

function Fail([int]$hr, [string]$msg) {
  throw [System.Runtime.InteropServices.COMException]::new($msg, $hr)
}

function Get-IllustratorProcess { Get-Process -Name 'Illustrator' -ErrorAction SilentlyContinue | Select-Object -First 1 }

function Is-Running {
  if ($FAKE) { return $env:CHANDELIER_FAKE_RUNNING -ne 'no' }
  return [bool](Get-IllustratorProcess)
}

function Get-App {
  if (-not (Is-Running)) { $script:app = $null; Fail $HR_NOT_RUNNING 'not running' } # drop a dead object before a relaunch
  if ($script:app) { return $script:app }
  $script:app = [System.Runtime.InteropServices.Marshal]::GetActiveObject($PROGID)
  return $script:app
}

function Invoke-Fake([string]$code) {
  if ($code.StartsWith('echo:')) { return $code.Substring(5) }
  if ($code.StartsWith('sleep:')) { Start-Sleep -Milliseconds ([int]$code.Substring(6)); return 'slept' }
  if ($code.StartsWith('hr:')) { Fail ([Convert]::ToInt32($code.Substring(3), 16)) 'fake COM error' }
  if ($code -eq 'crash') { [Console]::Error.WriteLine('boom'); exit 3 }
  return 'len:' + $code.Length
}

function Invoke-Js($req) {
  $t = 300
  if ($req.timeout) { $t = [Math]::Max(1, [int][Math]::Round([double]$req.timeout)) }
  [Chandelier.MessageFilter]::LimitMs = $t * 1000
  if (-not (Is-Running)) { $script:app = $null; Fail $HR_NOT_RUNNING 'not running' }
  if ($FAKE) { return Invoke-Fake ([string]$req.code) }
  $r = [Chandelier.Com]::Call((Get-App), 'DoJavaScript', @([string]$req.code))
  if ($null -eq $r) { return '' }
  return [string]$r
}

function Find-Illustrator {
  foreach ($k in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\Illustrator.exe',
                   'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\Illustrator.exe')) {
    $p = (Get-ItemProperty -Path $k -ErrorAction SilentlyContinue).'(default)'
    if ($p -and (Test-Path -LiteralPath $p)) { return $p }
  }
  $roots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}) | Where-Object { $_ }
  foreach ($r in $roots) {
    $hit = Get-ChildItem -Path (Join-Path $r 'Adobe') -Filter 'Illustrator.exe' -Recurse -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending | Select-Object -First 1
    if ($hit) { return $hit.FullName }
  }
  return $null
}

function Handle($req) {
  switch ([string]$req.op) {
    'running' { if (Is-Running) { return 'yes' } else { return 'no' } }
    'activate' {
      if (-not (Is-Running)) { Fail $HR_NOT_RUNNING 'not running' }
      if (-not $FAKE) {
        # COM Visible is read-only since Illustrator 2026; bring the window forward by process id.
        $ws = New-Object -ComObject WScript.Shell
        [void]$ws.AppActivate((Get-IllustratorProcess).Id)
      }
      return 'ok'
    }
    'launch' {
      if ($FAKE -or (Is-Running)) { return 'ok' }
      $exe = Find-Illustrator
      if (-not $exe) { Fail $HR_NOT_INSTALLED 'Illustrator.exe not found (App Paths registry key or Program Files\Adobe)' }
      Start-Process -FilePath $exe | Out-Null
      return 'ok'
    }
    'quit' {
      # status {restart}: sent only when no document has unsaved changes, so Illustrator asks nothing
      if ($FAKE -or -not (Is-Running)) { return 'ok' }
      try { [void][Chandelier.Com]::Call((Get-App), 'Quit', @()) } catch { } # the call may die with the server: fine
      $script:app = $null
      return 'ok'
    }
    'js' { return Invoke-Js $req }
    default { throw ('unknown op ' + $req.op) }
  }
}

Send ([ordered]@{ id = 0; ok = $true; result = 'ready' })
while ($true) {
  $line = $stdin.ReadLine()
  if ($null -eq $line) { break } # parent closed stdin -> exit
  if (-not $line.Trim()) { continue }
  try { $req = $line | ConvertFrom-Json } catch { Send ([ordered]@{ id = -1; ok = $false; error = 'bad json: ' + $_.Exception.Message }); continue }
  try {
    $res = Handle $req
    Send ([ordered]@{ id = $req.id; ok = $true; result = [string]$res })
  } catch {
    $e = $_.Exception
    while ($e.InnerException -and -not ($e -is [System.Runtime.InteropServices.COMException])) { $e = $e.InnerException }
    $hr = $null
    if ($e -is [System.Runtime.InteropServices.COMException]) {
      $hr = $e.HResult
      if ($HR_GONE -contains $hr) { $script:app = $null } # Illustrator quit or crashed: re-attach next time
    }
    Send ([ordered]@{ id = $req.id; ok = $false; error = [string]$e.Message; errno = $hr })
  }
}
