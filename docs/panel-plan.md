# Chandelier panel: events from Illustrator (phase 8, gap item 16)

Status: **MVP on branch `feature/panel`** (2026-11-24) — built and unit-tested; not yet tried in Illustrator.
Not released; the default transport is unchanged.

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
  pause sharing (`paused` / `resumed` events; no state is sent while paused).
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
# restart Illustrator → Window > Extensions > Chandelier
claude mcp add chandelier-panel -e CHANDELIER_TRANSPORT=panel -- node "$PWD/dist/index.js"
```

Then ask the agent: "Call events with wait 60, then tell me what I selected." Undo: `node scripts/cep/install.mjs
--uninstall`.

## 5. Steps

| Step | What | Status |
|------|------|--------|
| P1 | Panel core, snapshot, CEP manifest and UI; `PanelTransport`; `events` tool; dev installer; unit tests (fake panel engine, real socket) | ✅ 2026-11-24 (unit tests 149/149) |
| P2 | First live run in Illustrator 29.1 (macOS): panel loads, Node enabled, runtime loads through `evalScript`, `test/live.mjs` green with `CHANDELIER_TRANSPORT=panel`, events seen; measure per-call latency against the bridge | ⏳ needs the owner (install + restart Illustrator) |
| P3 | Same on Windows (VM) | ⏳ |
| P4 | Agent trial: a pairing task ("fix what I select") with a fresh agent; decide whether events are worth shipping | ⏳ |
| P5 | Ship or stop: if yes, package the panel (signed ZXP or `npx chandelier-mcp install-panel`), README, plugin skill section; if no, keep the branch for UXP | ❓ owner |

## 6. Open questions and risks

- **Same engine?** `evalScript` runs in the panel's own ExtendScript engine, so `AIA` state (call numbers,
  `status.last_call`) is separate from the OS bridge's engine. Fine while all scripts go one way; a mixed session
  (panel opened mid-way) reloads the runtime once. To confirm in P2.
- **Polling cost:** reading `selection` builds an array of every selected item; with thousands selected a tick may
  take tens of ms. Polling only runs while an agent is connected; measure in P2, raise the interval if needed.
- **Does CEP keep running when the panel is hidden or docked closed?** If not, a later version can add an invisible
  extension that starts with Illustrator.
- **Timeouts:** a script running in the panel can't be cancelled; past its deadline the call is reported as timed
  out and the usual ping/`last_call` advice follows.
- **Selection events from Illustrator itself** (C++ notifiers) don't exist in CEP for Illustrator, hence the snapshot
  polling; host events only trigger an immediate look.
