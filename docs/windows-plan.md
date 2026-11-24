# Windows version — plan

Status: ✅ done as 0.2.0, release pending ([roadmap phase 7](roadmap.md#phase-7--windows-)): W0, W2–W8 done (2026-11-24); W1 done except the modal-dialog check (needs someone at the VM). Results: § 12–14 and [benchmarks § 1b](research/benchmarks.md#1b-windows-02-phase-7-w7--2026-11-24).

**Goal:** the same server, the same 32 tools and the same ExtendScript runtime on Windows 10/11 with Illustrator
2025+ (29.x), with the same guarantees: one persistent connection (target < 10 ms per call), never launching
Illustrator unasked, clear errors on hangs and crashes, print output identical to macOS.

The runtime (`src/runtime/*.jsx`, `$.global.AIA`) is plain ExtendScript and already platform-neutral. What changes is
the thin layer that carries a script into Illustrator and back, plus a few macOS tools the server calls.

## 1. What is macOS-specific today

| Area | Where | macOS today | Windows plan |
|------|-------|-------------|--------------|
| **Bridge** | `src/bridge/bridge-mac.js` | Persistent `osascript -l JavaScript`; NSAppleScript `with timeout` + `«event miscDjxM»` (do javascript) | ✅ written (2026-11-23, not yet run against Illustrator): `src/bridge/bridge-win.ps1`, persistent `powershell.exe -Sta`, COM `Illustrator.Application.DoJavaScript` (§ 3) |
| **Transport default** | `src/transport/transport.ts` | `command: 'osascript'` | ✅ `src/platform.ts` picks by `process.platform`: `powershell.exe -NoLogo -NoProfile -NonInteractive -Sta -ExecutionPolicy Bypass -File bridge-win.ps1` |
| **Error map** | `src/transport/errors.ts` | AppleEvent errnos (-600, -609, -1712, -1743 …) | ✅ COM HRESULTs in the same map, keyed `0xXXXXXXXX` (§ 3.5); busy-until-timeout counts as a timeout |
| **App lifecycle** | bridge ops `running` / `launch` / `activate`; `status {launch}` | AppleScript by bundle id, never resolved at compile time (C11) | Process check (no COM), launch from the registered install path, `WScript.Shell.AppActivate` |
| **Image work** | `preview` (resize, reference crop/convert), `export {refs}` resize | ✅ done (W3, 2026-11-23): pure JS on both platforms | `sips` kept on macOS only to convert other formats (HEIC, TIFF…) (§ 4) |
| **Paths** | runtime `File` / `Folder`, Node temp dirs | POSIX paths | ✅ `path` / `dir` args get forward slashes before they reach ExtendScript (`Runtime.cmd` and batch steps); live check in W4 (§ 5) |
| **Live tests** | `test/live-restart.mjs` (quits Illustrator via AppleScript), bench runner A (`osascript`) | macOS only | Windows variants or skips (§ 6) |
| **Docs** | README quick start, agent guide § 7 | macOS steps | Windows install and troubleshooting |

## 2. Requirements

- Windows 11 on **ARM64 first** (the owner's test machine is a Parallels VM on Apple Silicon, § 10); x64 covered by
  CI unit tests and the fake-COM bridge test until an x64 machine is available; Windows 10 22H2 best effort.
- Illustrator 2025 (29.x) and 2026; Node ≥ 22.15; **Windows PowerShell 5.1** (built into every Windows 10/11).
  PowerShell 7 is not enough on its own: .NET (Core) dropped `Marshal.GetActiveObject`, which § 3.2 needs.
- No admin rights, no native Node addons, no build tools: `npx chandelier-mcp` must work on a fresh machine.

## 3. The bridge

### 3.1 Options

| Option | Per call | Pros | Cons |
|--------|---------:|------|------|
| **A. Persistent PowerShell 5.1 + COM (recommended)** | ~2–5 ms (to measure) | Built into Windows; same NDJSON protocol as the macOS bridge; `GetActiveObject` attaches without launching; C# via `Add-Type` for a COM message filter | Start-up ~0.5–1.5 s once per session (Add-Type compiles); execution-policy / AMSI edge cases (§ 9) |
| B. PowerShell per call (ie3's way) | ~300–600 ms | Simplest | The latency this project exists to remove |
| C. Persistent WSH JScript (`cscript`) | ~2 ms | Starts in ~50 ms | No way to attach without launching except WMI tricks; no message filter; WSH is being phased out by Microsoft |
| D. Node native COM addon (`winax`, `edge-js`) | < 1 ms | Fastest, no child process | Native build per Node ABI or prebuilt binaries; breaks `npx` simplicity; crashes take the server down |
| E. Small .NET helper `.exe` shipped prebuilt | ~1 ms | Full control (STA thread, message filter, timeouts), no execution policy | Build pipeline + code signing (SmartScreen warnings); a binary in an npm package |

Decision path: **spike A** first (step W1); its code is already written as `bridge-win.ps1`, so W1 measures it rather than starting from scratch. If it misses the 10 ms target or the message filter proves fragile,
spike E with the same protocol; the Node side does not change either way.

### 3.2 How bridge A works

```
node (Transport) ──NDJSON over stdin/stdout──▶ powershell.exe -File bridge-win.ps1   (STA, one process per server)
                                                  │ [Marshal]::GetActiveObject("Illustrator.Application")  (cached)
                                                  ▼
                                               Illustrator.exe  ── DoJavaScript(code) → result string
```

- **Protocol:** identical to `bridge-mac.js` — `{id, op: js|running|launch|activate, code?, timeout?}` in,
  `{id, ok, result | error, errno}` out, readiness line `{id:0, ok:true, result:"ready"}`. `Transport`, the runtime
  loader and every tool stay as they are.
- **Encoding:** the Node side already escapes non-ASCII (`ascii.ts`) and the runtime answers in ASCII JSON, so the
  pipe carries ASCII only; the bridge still sets `[Console]::InputEncoding/OutputEncoding` to UTF-8.
- **Attach, never launch:** `GetActiveObject` fails with `MK_E_UNAVAILABLE` when Illustrator is not running →
  answer `not running` (like errno -600 on macOS). `New-Object -ComObject` is never used: it would start Illustrator.
- **The COM object is cached** for the session; on `RPC_E_DISCONNECTED` / `RPC_S_SERVER_UNAVAILABLE` (Illustrator quit
  or crashed) the cache is dropped and the error maps to "quit or crashed"; the next call re-attaches and the runtime
  reloads itself (its version check already does this).
- **`running`:** `Get-Process -Name Illustrator` — no COM, so it can't start anything.
- **`launch`:** install path from `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\Illustrator.exe` (or the
  Adobe keys), `Start-Process`, then the existing `status {launch}` wait loop.
- **`activate`:** `WScript.Shell.AppActivate(<process id>)` — COM `Visible` is read-only since Illustrator 2026.
  Windows doesn't need activation before save/export (macOS quirk A10): checked in W1 (§ 12), so `activate` defaults
  to false there; the op stays for an explicit `configure {activate:true}`.

### 3.3 Busy Illustrator and modal dialogs

Out-of-process COM calls that hit a busy Illustrator fail with `RPC_E_SERVERCALL_RETRYLATER` / `RPC_E_CALL_REJECTED`.
The bridge registers an OLE **message filter** (`IMessageFilter`, a few lines of C# through `Add-Type`) that retries
until the request's own timeout, then answers with a hint ("a dialog may be open in Illustrator"). This is the
Windows half of the phase 5 hang-detection item.

### 3.4 Timeouts

A COM call cannot be cancelled. As on macOS, `Transport` gives every request a deadline (its timeout + grace); past
it, it kills the bridge process, reports "may still be running — check before repeating", and respawns on the next
call. Same semantics, same messages.

### 3.5 Errors (HRESULT → message)

| HRESULT | Meaning | Message (same wording as macOS where it maps) |
|---------|---------|-----------------------------------------------|
| `0x800401E3` MK_E_UNAVAILABLE | Not running | "Illustrator is not running. Start it, or call status with launch:true." |
| `0x800401F3` CO_E_CLASSSTRING | Not installed / not registered | "Illustrator is not installed or its COM server is not registered (run it once as the user)." |
| `0x80010108` RPC_E_DISCONNECTED · `0x800706BA` RPC_S_SERVER_UNAVAILABLE | Quit or crashed during the call | "Illustrator quit or crashed during the call. Restart it; the runtime reloads by itself." |
| `0x8001010A` RPC_E_SERVERCALL_RETRYLATER · `0x80010001` RPC_E_CALL_REJECTED | Busy after all retries | "Illustrator stayed busy (a modal dialog?)…" |
| `0x80020009` DISP_E_EXCEPTION | ExtendScript error outside the runtime's own try/catch | The script message |
| `0x80070005` E_ACCESSDENIED | Different user / elevation level (one side "Run as administrator") | "Illustrator runs as another user or elevated; run both at the same level." |

## 4. Image pipeline without `sips` (both platforms)

`preview` and `export {refs}` call macOS `sips` to resize, crop and convert JPEG references. Replace it with one
pure-JS pipeline used on both platforms: PNG decode/encode already exists (`src/image.ts`, Node's zlib); add a JPEG
decoder (`jpeg-js`, pure JS, no native code) and box/bilinear resize + crop in JS. One code path, unit-tested on CI,
and a macOS dependency removed. Can be done on macOS before any Windows work (step W3).

## 5. Paths and the runtime

- Node resolves user paths with `path.resolve` (backslashes, drive letters). Before a path enters ExtendScript, convert
  it to forward slashes (`C:/Users/…`), which ExtendScript's `File` accepts on Windows; results come back via `fsName`
  (native form) — fine for the agent.
- Check every runtime use of `File` / `Folder` (documents open/save, export folders, place, preview, run_script
  `file`, XMP bleed reading of saved `.ai` files) on Windows in the live suites.
- Things to verify in W4, expected identical: `imageCapture` and `exportFile` output, PDF presets, menu commands used
  by `path_ops` (Pathfinder names), `app.userInteractionLevel`, fonts' PostScript names, localised default layer names
  (C-quirks), long paths (> 260 chars) in export folders.

## 6. Tests

- **Unit, CI:** add a GitHub Actions matrix `macos-latest` + `windows-latest` for `npm test`, `typecheck`, `lint:jsx`
  (all Node, already cross-platform; the fake bridge is a Node script).
- **Bridge protocol test without Illustrator:** ✅ `bridge-win.ps1` accepts `CHANDELIER_FAKE_COM=1` (code `echo:` /
  `sleep:` / `hr:<hex>` / `crash`; `CHANDELIER_FAKE_RUNNING=no`); `test/unit/bridge-win.test.ts` drives it through
  the real `Transport` — framing, escaping, a 200 KB script, HRESULT messages, crash and stuck-call respawn. Runs
  where `powershell.exe` exists (the `windows-latest` CI job), skipped on macOS.
- **Slow machines:** `CHANDELIER_TEST_SLOW=<factor>` stretches the unit tests' time limits (the emulated x64 VM
  uses 8); `CHANDELIER_BRIDGE_START_MS` raises the server's 15 s limit for the bridge's ready line.
- **Bridge start:** the C# helper (message filter, COM call) is compiled once into
  `%LOCALAPPDATA%\chandelier\bridge-<hash>.dll` and loaded from there afterwards (2026-11-23, emulated Windows 10
  x64 VM on Parallels 27.1: first start 136 s, cached 107 s; a bare `powershell.exe` alone takes 51 s there).
- **Live, on a Windows machine with Illustrator:** `npm run test:live`, `live-layout`, `live-finish`,
  `verify-assumptions`; a Windows `live-restart` (quit through COM `Quit()`, refuses if documents are open); the
  live-suite document guard works unchanged.
- **Benchmarks:** micro runner M on Windows (p50 per call vs macOS 5.7 ms); one M2 run, arm C2 (owner's rule: one run).

## 7. Distribution on Windows

- `npx chandelier-mcp`: npm creates the `.cmd` shim for the `bin`; `bridge-win.ps1` ships in `dist/` like the macOS
  bridge.
- Claude Code plugin and `.mcpb` (Claude Desktop for Windows) reuse the phase 6 packaging; the MCP config needs no
  platform switch (the server picks its bridge from `process.platform`).
- README: Windows quick start (Node, Illustrator running, first call), troubleshooting (execution policy, elevation,
  dialogs).

## 8. Steps

| Step | What | Est. | Needs Windows? |
|------|------|-----:|:--------------:|
| **W0** | Parallels VM with Windows 11 ARM64 on the owner's Mac, set up for agent access over SSH (§ 11); Illustrator (Creative Cloud second activation; native ARM64 build or x64 emulation — check which), Node 22 ARM64, Git | ~1 h owner | yes |
| **W1** 🔄 | Spike: persistent PowerShell bridge — attach, `DoJavaScript` loop; measure per-call latency, the ~30 KB runtime load, a 5-min call, a modal dialog, a crash, Unicode; check whether activation is needed (A10). Decide A or E — **A kept** (2026-11-24, § 12); crash ✅, 5-min call ✅, activation not needed ✅; modal dialog still open | 0.5 d | yes |
| **W2** ✅ | Platform layer `src/platform.ts` (bridge command, script paths); `bridge-win.ps1` with message filter; `Transport` picks by `process.platform` — written 2026-11-23, ran live 2026-11-24 (§ 12) | 1 d | partly |
| **W3** ✅ | Pure-JS image pipeline (JPEG decode, resize, crop) replacing `sips` on both platforms; unit tests — done 2026-11-23 | 0.5 d | no |
| **W4** ✅ | Paths into ExtendScript; runtime checks from § 5 on Windows — drive letters, exports, PDF presets, menu commands, fonts, long paths (save/open refuse 260+ chars), localised names (shared code, tested on macOS) (§ 13) | 0.5 d | yes |
| **W5** ✅ | HRESULT error map, hints (links dialog named in busy/timeout messages), launch from the registry path, activation (off by default), Windows `live-restart` — all live-checked 2026-11-24 | 0.5 d | yes |
| **W6** ✅ | CI matrix (macOS + Windows) ✅, fake-COM bridge test ✅, live suites green on Windows ✅ 2026-11-24 (§ 13) — in an **en_US** Illustrator UI (moved from 0.1) | 1 d | yes |
| **W7** ✅ | Benchmarks on Windows (micro M, one M2 C2 run), results in `benchmarks.md` | 0.5 d | yes |
| **W8** ✅ | Windows install in README, agent guide troubleshooting; `.mcpb` / plugin checked on Windows (§ 14) | 0.5 d | yes |

Total ≈ 5 days once a Windows machine exists. W3 (and the platform split of W2) can start on macOS now.

## 9. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| No Windows machine with Illustrator (resolved 2026-11-24) | Blocked W1, W4–W8 | Illustrator 2027 in the Windows 11 ARM64 VM (§ 12) |
| COM busy / modal dialogs block calls | Hangs | Message filter with retry until the request timeout; hint in the error (§ 3.3) |
| PowerShell execution policy (GPO `AllSigned`) or AMSI flags the bridge | Bridge won't start on managed PCs | `-ExecutionPolicy Bypass` (process scope, no admin) covers defaults; signed script or option E for locked-down machines |
| `DoJavaScript` string-size limit | Runtime (~30 KB) won't load in one call | Measure in W1; fall back to `$.evalFile` of the runtime file written once per session |
| Per-call latency above 10 ms | Slower agents | Option E (.NET helper) behind the same protocol |
| Elevation mismatch (one side "Run as administrator") | `E_ACCESSDENIED` | Clear message (§ 3.5) |
| One COM ProgID for all installed versions | Can't pick a version when two run | Document; version choice by launch path only (phase 6 item) |
| Illustrator won't install on Windows ARM64 in Parallels (happened 2026-11-23; **Illustrator 2027 installs natively, 2026-11-24**) | No live Windows tests on the owner's Mac | x64 cloud VM (Azure/AWS, Creative Cloud second activation) or a PC; same SSH setup (`setup-vm.ps1` is hypervisor-neutral) |
| Only an ARM64 VM to test on | x64-specific problems (COM registration, paths of the x64 build) found late | CI `windows-latest` (x64) runs unit + fake-COM tests; live x64 run when a machine or cloud VM is available; VM timings may differ from real PCs — benchmarks say so |

## 10. Decisions (owner, 2026-11-22)

1. **Test machine:** a VM — Parallels on the owner's Apple Silicon Mac, so **Windows 11 ARM64** is the first live
   target (no PC available). W0 checks whether Illustrator runs as a native ARM64 build or under x64 emulation.
2. **When:** after the 0.1 release — Windows ships as **0.2**.
3. **.NET helper (option E):** acceptable if PowerShell turns out too slow or blocked and it can be built and signed
   reasonably; decided after the W1 spike.
4. **Agent-driven VM (2026-11-23):** the owner asked for the most "agentic" setup, needing the least of their time:
   the agent works in the VM over SSH from the Mac (§ 11); the owner only installs the VM, runs one setup script and
   installs Illustrator.

## 11. Agent access to the VM (W0)

Goal: after about an hour of the owner's time, once, the agent runs W1–W8 itself from the Mac.

| Option | Agent can do alone | Owner does | Verdict |
|--------|--------------------|------------|---------|
| **Parallels VM + OpenSSH + desktop-session runner (chosen)** | `git pull`, `npm ci`, unit and live tests, benchmarks, reading logs — all over `ssh`; live tests run in the desktop session through a scheduled task | Install Parallels (Windows 11 via its one-click download), run `setup-vm.ps1`, install Illustrator from Creative Cloud, stay logged in | Works with any hypervisor; nothing Parallels-specific in the agent's loop |
| Parallels `prlctl exec` only | Same, without SSH | Same, plus a Pro/Business licence for `prlctl` | Runs as SYSTEM in session 0 by default: can't see Illustrator's COM object; no gain over SSH |
| GitHub Actions `windows-latest` | Unit + fake-COM tests on every push (done) | Nothing | No Illustrator (needs an Adobe sign-in): can't replace live tests |
| Cloud Windows VM (Azure/AWS) with Illustrator | Everything, x64 | Account, billing, Creative Cloud sign-in | Later, for the x64 live run (§ 9) |

**Owner, once:**
1. Parallels Desktop → New → "Get Windows 11 from Microsoft"; log in.
2. On the Mac: `scripts/windows/connect-vm.sh` ([source](../scripts/windows/connect-vm.sh)). It makes an SSH key in
   the git-ignored `tmp/windows-vm/` (with an `ssh_config`; `~/.ssh` untouched), starts the VM, runs
   [setup-vm.ps1](../scripts/windows/setup-vm.ps1) in it through `prlctl exec` (OpenSSH server + the key, no sleep) —
   or, if Parallels refuses exec, puts a one-line elevated PowerShell command on the clipboard to paste in the VM —
   then installs Node LTS and Git over SSH (winget) and clones the repo (`develop`) to `C:\src\chandelier`.
3. Creative Cloud → install Illustrator (en_US UI), start it once, close the first-run dialogs. Stay logged in to Windows.

**The agent, from then on:** `ssh -F tmp/windows-vm/ssh_config win`, clone/pull the repo, `npm ci && npm test`; anything that needs Illustrator
goes through [scripts/windows/run-interactive.ps1](../scripts/windows/run-interactive.ps1), which runs the command as
a scheduled task with an Interactive logon in the owner's desktop session and returns its output and exit code. Why:
an SSH session is a separate logon session; COM's running-object table is per session, so `GetActiveObject` from SSH
would not find the Illustrator on the desktop, and anything launched from it is invisible. The scripts were written
on 2026-11-23 without a Windows machine and are checked in W0.

**W0 status (2026-11-23):** Windows 11 ARM64 in Parallels 27.1; `connect-vm.sh` ran end to end after two fixes
(`prlctl exec` refuses command lines over ~4 KB and forwards the caller's stdin → upload in chunks with stdin from
`/dev/null`; the SSH firewall rule covered Private networks only, the Parallels network is Public → `-Profile Any`).
Node 26.13 ARM64 and Git 2.56 via winget over SSH. Over SSH call `npm.cmd` / `npx.cmd`: the default execution policy
blocks the `npm.ps1` shims (the bridge is unaffected: it runs with `-ExecutionPolicy Bypass`). **All 113 unit tests
pass in the VM, including `bridge-win.ps1` in fake-COM mode**; a bridge start takes ~2.4 s, most likely `Add-Type`
compiling its C# (W1: measure, cache the compiled type if it matters).

**Blocker (2026-11-23, resolved 2026-11-24 — see § 12): Illustrator does not install in the ARM64 VM.** Creative Cloud 6.11 installs, but the x64
release of Illustrator fails its system check on Windows 11 ARM64, and Illustrator (Beta), Adobe's only Windows-on-ARM
build (minimum hardware: Snapdragon X Elite), would not install either (VM: 4 vCPU "Apple Silicon", 6 GB RAM,
Parallels display adapter). The VM stays useful for unit tests and the fake-COM bridge; live steps (W1, W4–W8) need an
**x64 Windows** machine with Illustrator — see § 9 and the open decision in § 10.

**x64 route (2026-11-23, owner's choice): Parallels' x86_64 emulation on the same Mac.** The ARM VM and its ISOs were
deleted. `scripts/windows/make-x86-vm.sh <iso>` builds "Windows 10 x64" with the hidden `--cpu-type x86` (1 vCPU,
6 GB; Windows 11 24H2+ is not supported by the emulator) from the Windows 10 Enterprise 22H2 **evaluation** ISO
(Microsoft's direct link, 90 days, no key) and an unattended-setup disc (`Autounattend.xml`: disk, local admin
account with auto-logon, `setup-vm.ps1` at first logon → SSH with the agent key; password in git-ignored
`tmp/windows-vm/`). `connect-vm.sh` then finds the VM's IP from the Parallels DHCP leases (no Parallels Tools needed)
and installs Node and Git from their official downloads (`install-tools.ps1`; no winget on a fresh Windows 10).
Emulated, so slow: fine for correctness (W1, W4–W6), not for benchmarks (W7 needs real x64 hardware).
Measured 2026-11-23 (Parallels 27.1, macOS 27.2, Apple Silicon): the unattended install took 57 min to SSH; right
after it, one SSH command took 60–80 s (Defender and Windows Update busy on the single emulated CPU), so
`connect-vm.sh` retries its SSH check.
Fresh Windows has not built its .NET native images yet, so every PowerShell start JIT-compiles: run
`ngen.exe executeQueuedItems` (Framework64 and Framework, v4.0.30319) once over SSH — 2 h emulated, then a bare
`powershell.exe` starts in 12 s instead of 50 s and the bridge in 21 s instead of 81 s (Defender off; 2026-11-23).

**Back to ARM64 (2026-11-23, evening, owner's choice):** the emulated x64 VM was too slow (SSH copies ~100 KB/s,
PowerShell start 12–50 s) and was deleted. New VM "Windows 11" from Parallels' "Get Windows 11 from Microsoft"
(Windows 11 Pro ARM64 build 26300, 4 vCPU, 6 GB, Parallels Tools 27.1); the owner installs the **Illustrator trial**
there (the Creative Cloud release refused ARM64 earlier — the trial is the next attempt). `connect-vm.sh` set it up
unchanged — but run it only after Windows' first-run screens: run during them, it found the temporary
`defaultuser0` account. `ngen executeQueuedItems` took 6 min. Measured over SSH, warm (Parallels 27.1, macOS 27.2,
Apple Silicon, Node 26.13 ARM64): bare `powershell.exe` 1.7 s, bridge ready (fake COM, cached helper DLL) 2.3–2.6 s;
unit tests 112 passed + 1 skipped in 47 s (one timing test failed once while ngen ran alongside).
Big files go into the VM over plain HTTP from the Mac (`python3 -m http.server --bind 10.211.55.2`, `curl.exe` in the
VM), not `scp`.

## 12. W1 results (2026-11-24)

**Illustrator 2027 (31.0.0) installs in the Windows 11 ARM64 VM and is a native ARM64 build** (`Illustrator.exe`
machine type 0xAA64), from Creative Cloud 6.11, registered as `Illustrator.Application` / `Illustrator.Application.31`;
install path from the App Paths key. (Illustrator 2026 had refused this VM, § 11.) It runs as two `Illustrator.exe`
processes started together; `GetActiveObject` finds the right one. Buying the plan inside the VM failed for the owner
(cards declined); signing in to an account that already has the plan avoids checkout there.

[test/live-w1-bridge.mjs](../test/live-w1-bridge.mjs) drives `bridge-win.ps1` directly (desktop session via
`run-interactive.ps1`). Windows 11 Pro ARM64 26300 VM, 4 vCPU, 6 GB, Parallels 27.1, macOS 27.2, Apple Silicon,
Node 26.13 ARM64, Illustrator 31.0.0, no document open:

| Check | Idle VM (first run) | Same VM ~1 h later, loaded |
|---|---|---|
| Bridge ready (cached helper DLL) | 2.5 s | 4.4 s |
| `running` (process list only) | 88 ms | 431 ms |
| First `js` (attach) | 102 ms | 491 ms |
| 200 × `1+1`: median / p95 / max | **8.1 / 32 / 137 ms** | 127 / 247 / 537 ms |
| Script 30 KB / 100 KB / 300 KB / 1 MB | 21 / 38 / 40 / 148 ms | 201 / 196 / 127 / 232 ms |
| `activate` | 1.3 s | 164 ms |

- **Option A (PowerShell + COM) kept:** 8 ms median on an idle VM meets the 10 ms target; no `DoJavaScript` size limit
  up to 1 MB, so the runtime loads in one call (no `$.evalFile` fallback).
- **Unicode:** non-ASCII arrives intact both as `\uXXXX` escapes (what the transport sends) and raw.
- **Errors:** an ExtendScript error (throw or syntax error) comes back as HRESULT **0x80041389** (FACILITY_ITF + 5001,
  the same 5001 as on macOS) with message and line; added to the error map. A 70 s call completes (the message filter
  keeps the call alive); measured 82 s.
- **Full MCP server:** `node test/live.mjs` passes unchanged on Windows (23 checks: documents new/save/close, text,
  batch of 100, selection, preview by export and by image capture, run_script errors). Its run_script round trip
  measured p50 269 ms — taken while the VM was in the loaded state above, not comparable with macOS 5.7 ms.
- **Noise:** the slowdown hit everything equally, including `running`, which never touches Illustrator — so the VM,
  not the bridge: 0.9 GB of 6 GB free (Illustrator ~1.8 GB) while the Mac was indexing (Spotlight) and throttled.
  Latency numbers for Windows need an idle VM, or real hardware (W7).
- **Crash (2026-11-24):** `test/live-restart.mjs` now runs on Windows: it kills Illustrator (`taskkill /F`) during a
  20 s call. The call in flight fails 1.15 s after the kill with **0x800706BE** (RPC_S_CALL_FAILED) — not in the first
  error map, so the bridge kept the dead COM object and the first call after a relaunch failed before re-attaching.
  Fixed: 0x800706BE counts as "quit or crashed" in the bridge and the error map, and the bridge drops its cached
  object whenever Illustrator isn't running. Then: `status` / calls say "not running" (42 / 33 ms), `status
  {launch:true}` relaunches and answers in 19.3 s (24 s before the fix), the runtime reloads by itself (228 ms), one
  bridge process throughout. The test now counts runtime loads from its own start (another session may have loaded the
  runtime already).
- **5-min call:** `$.sleep(300000)` completes and returns through the bridge (364 s: ExtendScript's sleep runs ~20 %
  long on Windows — 70 s took 82 s too). Same run on the idle VM: 9.6 ms median per call, 1 MB script 74 ms.
- **Activation (macOS A10) is not needed on Windows:** [test/live-w1-activate.mjs](../test/live-w1-activate.mjs) runs
  with `configure {activate:false}`, Illustrator visible but not in front, then minimized: PNG, PDF/X-4, SVG and
  `save_as .ai` all write valid files, and Illustrator stays in the background. (The first version put Notepad in
  front; Windows 11's Notepad hands off to an existing window, so the test left Notepad tabs on the owner's desktop.
  The test now opens no windows: it minimizes Illustrator and shows it again without activating it.) So `activate` now defaults to **false on Windows** (true on
  macOS): activating would only steal the user's focus and cost 0.2–1.3 s per save/export.
- **Still open in W1:** a modal dialog in Illustrator (needs someone to dismiss it in the VM).

## 13. W4 / W6: live suites on Windows (2026-11-24)

Same VM and versions as § 12. All live suites pass on Windows: `live`, `live-edit`, `live-print`, `live-release`,
`live-layout`, `live-finish`, `verify-assumptions`, `live-restart` and `live-w1-activate`. That covers on Windows: file
paths with drive letters (`C:\Users\…\AppData\Local\Temp`), exports (PNG, JPG, SVG, WebP, PDF/X-4 with presets and
bleed), save/close, Pathfinder and other menu commands, fonts, styles, swatches, layers, artboards, preview by export
and by image capture, the 5 000-item scan. The first run found three problems:

| Problem | Cause | Fix |
|---|---|---|
| `path_ops` unite / minus front returned the untouched group; `menu_command group` returned the old selection | On Windows a menu command acts on the selection Illustrator last **drew**, not the one the script just set: Live Pathfinder on a fresh selection failed 10/10 without a redraw, worked 10/10 with `app.redraw()` after selecting. The first run passed only because the VM was slow | `A.syncSelection()` (runtime): `app.redraw()` on Windows after a selection change, before every menu command (`path_ops`, `menu_command`); no-op on macOS |
| A `run_script` with `timeout: 2` ran its 7 s to the end | macOS' bridge times out inside the Apple event; Windows' can't cancel a COM call, so the only deadline was the transport's: timeout + **10 s** grace | Transport grace 1 s on Windows: 1 s after the timeout the bridge is killed and the call returns the timeout error with its hint; Illustrator finishes the script, the next call starts a new bridge |
| `styles list` once showed a paragraph style's old size right after an update (`live-edit`, first run, slow VM) | Not reproduced in 3 later runs nor in a replay of the same steps with pauses | Watch; if it returns, re-read the XMP after writing it |

**Illustrator's links dialog blocks scripts.** With a document open that links a missing or changed file
(`live-print` places a broken link on purpose), Illustrator asks "Some files are missing or modified in the Links
panel. Would you like to update them now?" whenever its window is activated — by the user clicking into it, or by a
test moving windows — and every call waits until someone answers. A real-world modal-dialog case for the open W1 check
and the hang hint (phase 5). The owner saw several during these runs (screenshot in the git-ignored `tmp/`).

**Desktop noise from test runs:** `run-interactive.ps1` ran each command as a visible `cmd.exe`, so every live run
opened a terminal window on the owner's desktop; it now starts `conhost.exe --headless`, and output still comes back.

**Long paths (W4):** exports (PNG, PDF, SVG, JPG) and `preview` work in a folder whose path is over 260 characters
(322 tested), but Illustrator's own save does not: `saveAs` to such a path opens the interactive **Save As dialog**
and the call hangs until someone cancels it — even with alerts off. Fix: on Windows `documents save/save_as/open` and
`place` refuse paths of 260+ characters before they reach Illustrator, with a clear message
(`longPathProblem` in `src/platform.ts`); verified live.

**Localised layer names (W4):** the VM's Illustrator is en_US and the suites pass with "Layer 1"; the localised case
(ru_RU) was tested on macOS in 0.1, and the runtime code is shared, so no Windows-only check.

**Hints (W5):** the busy and "not answering" messages now name the links dialog as an example of a dialog that blocks
scripts; "not running", "not installed", elevation and crash have their own messages (§ 3.5, § 12).

**Round trip, layer by layer (2026-11-24, same VM, 60 calls each, p50):** bare bridge `1+1` 9.2 ms; a runtime command
through the dispatch wrapper 15.0 ms; runtime `script "return 1"` 15.1 ms; MCP `run_script "return 1"` 20.0 ms; MCP
`configure` (no Illustrator call) 0.7 ms. So: COM in this VM ~9 ms, the runtime's per-call wrapper in Illustrator
~6 ms, the server ~1–5 ms. The **42 ms** first reported by `live.mjs` was mostly the test: its safety guard sent a
`status` call before every call of the latency loop. The loop now uses an unguarded call (`client.callToolUnguarded`
from `test/live-lib.mjs`; our document is closed by then). Corrected `live.mjs` runs back to back: p50 21 ms and
48 ms, p95 ~100–120 ms — the run-to-run spread is the VM (6 GB, Illustrator ~1.8 GB, emulated graphics), as the
owner suspected. macOS on hardware: 5.7 ms. Whether Windows meets the 10 ms target needs real hardware (W7);
if it doesn't, the dispatch wrapper's ~6 ms is the first thing to trim.

## 14. W8: packaging on Windows (2026-11-24)

Version 0.2.0 (package, server, plugin, marketplace). Checked in the VM (§ 12), Node 26.13 ARM64, Illustrator 31.0:

- **npm package:** `os` already lists `win32`. The packed `chandelier-mcp-0.2.0.tgz`, installed by npx into an empty
  npm cache, starts and answers a live `status` (below).
- **Claude Code plugin:** it started the server with a bare `npx`, which Windows doesn't have (only `npx.cmd`, which
  needs a shell — why Claude Code's docs wrap npx servers in `cmd /c` on Windows), and a plugin's `mcpServers` entry
  can't differ per OS. Now the plugin runs `node ${CLAUDE_PLUGIN_ROOT}/launch.mjs`, which runs
  `npx -y --prefix <plugin> --package chandelier-mcp@^0.2.0 chandelier-mcp` (`npx.cmd` through cmd on Windows, as one
  command line: arguments quoted so cmd keeps the `^` of the range, the command name not — a batch file started by a
  quoted bare name takes the current folder as its own and npx then can't find npm). Verified: macOS 1.6–3.5 s;
  Windows with an empty npm cache 20.9 s to a live `status` (the first install); a `^` range resolves on Windows
  (checked with `^0.1.1`, which npm then refuses as macOS-only — correctly). `CHANDELIER_MCP_SPEC` overrides the
  package for tests. Not checked inside Claude Code on Windows (not installed in the VM).
- **Claude Desktop bundle:** manifest `compatibility.platforms` = darwin, win32. The unpacked
  `chandelier-0.2.0.mcpb` runs `node dist/index.js` on Windows: 1.0 s to a live `status`. Not checked inside Claude
  Desktop for Windows (not installed in the VM).
- **"Fresh Windows account":** replaced by a clean folder and an empty npm cache in the VM's account, as on macOS in
  0.1 — Illustrator's COM object is per desktop session, so a second account would need its own logged-in desktop.
- **Docs:** README (requirements, `cmd /c npx` for the server-only route, Windows notes, how it works, status),
  agent guide § 7 (path too long, links dialog, elevation).

