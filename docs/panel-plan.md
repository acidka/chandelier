# Chandelier panel: events from Illustrator (phase 8, gap item 16)

Status: **MVP on branch `feature/panel`** (2026-11-24) — built, unit-tested and **tried in Illustrator 29.1 on
macOS**: the live suite passes through the panel ([§ 7](#7-first-live-run-p2)). Not released; the default transport
is unchanged.

## 1. Why

Today the agent only asks and Illustrator only answers. It can't know that the designer selected something, switched
documents or saved until it calls a tool. A panel inside Illustrator can push those changes, which makes pairing
possible: "select the headline and make it bolder" without the agent guessing what "it" is, or an agent that waits
for the designer and reacts. Faster calls (the panel skips Apple events / COM) are a side effect, not the goal:
agents spend seconds per turn, and `batch` already makes calls few.

## 2. Options

| Option | Pros | Cons |
|--------|------|------|
| **CEP panel now** (chosen for the MVP) | Works in Illustrator 2021+ on macOS and Windows; Node.js inside the panel (sockets, files); host events | Legacy platform (UXP replaces it); unsigned panels need `PlayerDebugMode`; signed ones need a ZXP and an installer; the panel must be open |
| Wait for UXP (beta ~Q2 2027) | Adobe's future platform | Nothing to build or learn from until then |
| Poll from the server through the existing bridge | No install | Every poll is an Apple event / COM call into Illustrator even when nothing happens; still no host events |
| C++ plugin with real notifiers (`kAIArtSelectionChangedNotifier`…) | True selection events, no polling | Per-version builds, signing, notarisation; far too heavy for an experiment |

The MVP keeps the panel small and the protocol identical to the OS bridges, so moving to UXP later means rewriting
the panel side only.

## 3. Design (MVP)

```
agent ──MCP──▶ Chandelier server ── PanelTransport ──TCP 127.0.0.1 (NDJSON)──▶ Chandelier panel (CEP, inside Illustrator)
                     │                    ▲ events (selection, document, saved, edited)        │ evalScript
                     │                    └───────────────────────────────────────────────────┘
                     └── OS bridge (osascript / PowerShell) for running / launch / quit / activate, and for scripts while the panel is closed
```

- **Opt-in:** `CHANDELIER_TRANSPORT=panel`. Without it nothing changes, and the `events` tool isn't listed (tool-list
  budget, [plan D13](plan.md#d13--tool-profiles-full-by-default-lean-on-request--decided-03)).
- **Panel** (`src/cep/`): `panel-core.js` (socket server, handshake, request queue, snapshot diffing; plain CommonJS,
  testable in Node), `panel.js` + `index.html` (UI: connection, a "share my selection" switch, recent events),
  `host/snapshot.jsx` (ES3, linted), `CSXS/manifest.xml` (Illustrator 25+, CSXS 9+, Node enabled).
- **Discovery and auth:** the panel listens on a random port on 127.0.0.1 and writes `{port, token}` to
  `~/.chandelier/panel.json` (mode 0600). A client must send the token first or is dropped. The trust level is the
  same as Apple events: any process of the same user could also drive Illustrator directly.
- **Protocol:** the OS bridges' NDJSON (`{id, op: "js", code, timeout}` → `{id, ok, result}`), plus pushed lines
  `{event: {type, t, …}}`. Scripts run one at a time through `evalScript`; the runtime (`AIA`) loads into the panel's
  engine on first use, as it does after an Illustrator restart.
- **Events:** while a client is connected the panel runs `snapshot.jsx` every 500 ms (and right away on CEP host
  events: document activated/deactivated/saved, application activated) and diffs it: `document`, `saved`, `edited`,
  `selection` (count, first 10 items with uuids — usable as refs — names, a text frame's first 80 characters, the
  text under the cursor). `after_agent: true` marks a change seen right after an agent request. The designer can
  pause sharing (`paused` / `resumed` events; no state is sent while paused). The panel pushes the whole snapshot
  (`{state}`) with its first look after a connect or a resume and before every batch of events, so the server never
  patches state together; a document switch reports a selection only when something is selected in the new document.
- **Server:** `PanelTransport` (`src/transport/panel.ts`) extends `Transport`: scripts through the panel when it is
  connected, else the OS bridge; reconnects every 3 s while the panel is closed; keeps an `EventLog` (200 events,
  sequence numbers, long-poll wait) and the latest state. A panel that closes mid-call fails the call with a clear
  message and logs a `panel` event.
- **Tool `events {since, wait, types}`** → `{events, next, state, panel}`. `wait` (≤ 300 s) blocks until an event
  arrives, so an agent can wait for the designer.

## 4. Try it (developer setup)

```sh
npm run build
node scripts/cep/install.mjs --link     # copies/links dist/cep into Adobe/CEP/extensions, sets PlayerDebugMode=1
                                        # add --debug for Chrome DevTools on the panel: http://localhost:8098
# restart Illustrator → Window > Extensions > Chandelier (the panel doesn't reopen by itself after a restart)
CHANDELIER_TRANSPORT=panel npm run test:live   # the live suite through the panel
claude mcp add chandelier-panel -e CHANDELIER_TRANSPORT=panel -- node "$PWD/dist/index.js"
```

Then ask the agent: "Call events with wait 60, then tell me what I selected." Undo: `node scripts/cep/install.mjs
--uninstall`.

## 5. Steps

| Step | What | Status |
|------|------|--------|
| P1 | Panel core, snapshot, CEP manifest and UI; `PanelTransport`; `events` tool; dev installer; unit tests (fake panel engine, real socket) | ✅ 2026-11-24 (unit tests 149/149) |
| P2 | First live run in Illustrator 29.1 (macOS): panel loads, Node enabled, runtime loads through `evalScript`, `test/live.mjs` green with `CHANDELIER_TRANSPORT=panel`, events seen; measure per-call latency against the bridge | ✅ 2026-11-24 ([§ 7](#7-first-live-run-p2)); fixed: state pushed with the first look, stale `saved` after a document switch, empty selection events on a switch |
| P3 | Same on Windows (VM) | ⛔ 2026-11-24, rechecked: Illustrator 2027 **native ARM64** blocks every third-party CEP extension by design (built-in list of Adobe ids in `Services.aip`, "not supported on your device") — [§ 8](#8-windows-arm64-p3). CEP on Windows needs x64 Illustrator; Windows ARM needs a UXP panel |
| P4 | Agent trial: a pairing task ("fix what I select") with a fresh agent; decide whether events are worth shipping | ⏳ |
| P5 | Ship or stop: if yes, package the panel (signed ZXP or `npx chandelier-mcp install-panel`), README, plugin skill section; if no, keep the branch for UXP | ❓ owner |

## 6. Open questions and risks

- **Same engine? No (confirmed in P2).** The panel's scripts run in an engine named `transient`, the OS bridge's in
  `main`; a global set through one is `undefined` in the other. Globals do persist between panel calls, so `AIA`
  loads once per engine: a mixed session (panel opened mid-way) loads the runtime once more, and `AIA` state (call
  numbers, `status.last_call`) is per engine.
- **Polling cost: small (measured in P2).** One look takes ~1 ms with nothing selected and 1–34 ms with 1 000 items
  selected (§ 7). Polling only runs while an agent is connected and skips a tick while an agent script runs; under a
  burst of agent calls a look can wait until the burst ends (seen in P2: events arrived after 20 back-to-back calls).
- **Does CEP keep running when the panel is hidden or docked closed?** If not, a later version can add an invisible
  extension that starts with Illustrator.
- **Timeouts:** a script running in the panel can't be cancelled; past its deadline the call is reported as timed
  out and the usual ping/`last_call` advice follows.
- **Selection events from Illustrator itself** (C++ notifiers) don't exist in CEP for Illustrator, hence the snapshot
  polling; host events only trigger an immediate look.

## 7. First live run (P2)

2026-11-24 · Illustrator 29.1.0 (CEP 11, PlugPlug 11.5.3), macOS 27.2.1, Node 22.23.3 · one run per arm.

- **Loads:** with `PlayerDebugMode=1` the unsigned panel registers and shows under Window > Extensions (Illustrator
  29.1 reads CSXS.11); Node and the local socket work; `~/.chandelier/panel.json` is written with mode 0600.
- **Live suite:** `CHANDELIER_TRANSPORT=panel npm run test:live` — all 23 checks pass (the same 23 pass over the OS bridge).
- **Events:** creating a document, selecting an item from a script and closing the document produce `document` and
  `selection` events (uuid, name, type) with `after_agent: true`; the panel shows them and the agent count.
- **Latency:** `run_script {code: "app.documents.length"}` ×20 (MCP round trip, warm): panel median **1.6 ms** (min 1.1),
  OS bridge median **7.0 ms** (min 4.5). Per-tool calls of the live suite are a few ms faster through the panel for
  small calls; heavy calls (save/export, preview) take as long or longer, as Illustrator's own work dominates. The first
  script through the panel took ~0.5 s: the runtime loading into the panel's engine.
- **Snapshot cost:** one look (`host/snapshot.jsx` through `evalScript`), 5 runs each: nothing selected 0.7–1.5 ms;
  100 selected 1.7–5.5 ms; 1 000 selected 1.1–34 ms. (5 000 not measured: the setup script was too slow.)
- **Fixed during the run:** `state` was `null` until something changed (the first look is now pushed); after
  switching to a document with unsaved changes `state.saved` read `true` (the panel now sends the whole snapshot); a
  switch between documents with nothing selected sent an empty `selection` event.
- **Still open:** whether the panel keeps polling while it is hidden behind another panel tab or collapsed; designer
  (not script) selection in a real pairing session (P4).

## 8. Windows ARM64 (P3)

2026-11-24 · Windows 11 Pro ARM64 VM (Parallels 27.1, macOS 27.2.1), Illustrator 2027 (31.0.0, native ARM64, CEP 12),
Node 26.13 ARM64.

- **Unit tests** on the panel branch: 158/158 in the VM (panel tests included; the 0600 mode check is skipped on Windows).
- **Install:** `node scripts/cep/install.mjs --link --debug` works (junction into `%APPDATA%\Adobe\CEP\extensions`,
  `PlayerDebugMode=1` under `HKCU\Software\Adobe\CSXS.9…14`).
- **Refused:** CEP 12 finds and registers the extension (`Adding extension with id 'io.github.acidka.chandelier.panel'`,
  then `WARN Service: io.github.acidka.chandelier.panel not registered properly`), and Illustrator shows "The following
  extensions are not supported on your device. Contact the provider for more information. Chandelier"; no
  Window > Extensions menu appears. Adobe's own CEP panels (Home, Libraries) do load. **Rechecked: a deliberate block, not
  our manifest.** Adobe's Libraries panel loads with the same `--enable-nodejs` / `--mixed-context` flags and no
  ARM-specific setting. The message lives in `Plug-ins\Extensions\Services.aip` (ARM64 build) as
  `$$$/Services/WinARMCEP/ThirdPartyUnsupported1Str`, raised by `WinARMBlockedCEPExtensionsAlert`, next to a built-in
  list of Adobe's own extension ids (`com.adobe.ccx.start`, `com.adobe.DesignLibraries.angular`, …): on Windows ARM,
  Illustrator 2027 loads only those CEP extensions. No manifest, flag or signing changes it. An Adobe forum thread from
  before the ARM release (Oct 2024) expected users to run the x64 build under emulation (Prism) for CEP; the x64 build
  refused to install in this VM (windows-plan § 11).
- **UXP is there:** Illustrator 2027 ships `Support Files\Required\UXP\extensions` and `Services.aip` names
  `UXPCCLibrariesWinArm` — Adobe moved its own Libraries panel to UXP on Windows ARM. A UXP port of the panel is the
  route for Windows ARM (P5).
- **Side finding:** started directly from a scheduled task (`run-interactive.ps1` → `status {launch}`), Illustrator's
  CEP doesn't start at all (`ERROR PlugPlugSetup:` in `%TEMP%\CEP12-ILST.log`, Adobe's panels missing too); started
  through the Windows shell (`Shell.Application.ShellExecute`, parent explorer) it does. Doesn't affect the OS bridge.
- **Consequence:** on Windows the panel needs x64 Illustrator (real x64 hardware, windows-plan § 9) — or UXP later.
  Windows-on-ARM users would keep the OS bridge (events unavailable).
