# Chandelier panel: events from Illustrator (phase 8, gap item 16)

Status: **experimental, shipped in 0.5** (2026-11-24) and in every release since — live-tested in Illustrator 29.1 on
macOS (live suite, pairing trial, fresh agent 3/3, channel wake-up); opt-in (`CHANDELIER_TRANSPORT=panel`), the
default transport is unchanged. Install: `npx chandelier-mcp install-panel`. Open: x64 Windows test, hidden-panel
check, signing ([roadmap](roadmap.md#platforms-and-panel)).

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

## 3. Design

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
- **Chat (2026-11-24, owner's request):** a text box and Send button (⌘/Ctrl+Enter) in the panel. The designer's text
  goes to every connected agent as a `message` event (`{type: "message", text}`; "this"/"it" = the current selection);
  `events {say}` shows the agent's answer in the panel (protocol op `say`, plain UTF-8). The panel list shows both
  sides. Limit: the panel can't wake an idle agent — a message is read when the agent next calls `events`, so to work
  from the panel the agent loops `events {since, wait: 300, types: ["message"]}` (answering with `say` in the same call).
  Send is disabled while no agent is connected; messages are kept in the event log (200) until read.
- **Two tabs (2026-11-24, owner's request):** *Chat* (opens first) holds only the message log (oldest first, scrolled
  to the newest), the text box and Send; *Status* holds the connection, the agent count, the sharing switch and recent
  events, with a connection dot on its tab. The chat history (100 messages) is kept apart from events, so selection
  changes don't push messages out. **One chat per document** (owner's request): keyed by the file path (the name while
  never saved, so two `Poster.ai` files keep separate chats); the Chat tab shows the chat of the document in front
  ("Chat about Poster.ai") and switches with it — the panel looks at the document at start-up and on Illustrator's
  document events even with no agent connected. An agent's answer goes to the chat of the message it answers, even if
  the designer switched documents meanwhile. Saved in `~/.chandelier/chats.json` (0600; 100 messages per document, the
  50 most recently used documents), so chats survive a panel reload or an Illustrator restart. The snapshot now also
  reports `path`.
- **Activity line (2026-11-24, owner's request)** under the chat: "Sent · waiting for the agent to pick it up" (a
  message no agent has read), "Agent is thinking…" (the `events` tool handed the message to the agent; protocol op
  `activity` {state: thinking}), "Agent is working in Illustrator…" (its scripts run through the panel; held 1.5 s
  after the last one so quick calls don't flicker). Cleared by the agent's `say` or when it waits again
  (`events {wait}` sends `listening`). Animated dots for thinking/working.
- **Waking the agent: channel mode (2026-11-24).** Claude Code *channels* (research preview,
  [docs](https://code.claude.com/docs/en/channels-reference)) let an MCP server push messages into a running session.
  With `CHANDELIER_TRANSPORT=panel CHANDELIER_CHANNEL=1` the server declares `experimental: {"claude/channel": {}}`
  and pushes each panel message as `notifications/claude/channel` — `{content: text, meta: {doc, selection,
  selected_text}}` (Claude sees `<channel source="…" doc="…" selection="1: Headline (TextFrame, uuid 683)">make this
  red</channel>`); an idle session wakes up, a busy one gets it on its next turn. Messages then go only to the
  channel, not to `events` (each request arrives once); the agent answers with `events {say}`. Pushes are not
  acknowledged, so the panel shows "thinking" only once the agent makes its next tool call — a session started
  without the channel flag leaves "Sent · waiting for the agent to pick it up". During the preview a custom channel
  needs an interactive session started with `claude --dangerously-load-development-channels server:<name>` (ignored
  with `-p`); Team/Enterprise orgs must enable channels. The panel is the only sender (local socket, token), so no
  sender allowlist is needed; permission relay is not declared.

## 4. Set it up

Users (0.5): see the [README](../README.md#chandelier-panel-experimental) — `npx chandelier-mcp install-panel`, restart
Illustrator, Window > Extensions > Chandelier, then the server with `CHANDELIER_TRANSPORT=panel` in *listening* mode
(the agent loops `events {wait}`) or *wake-up* mode (`CHANDELIER_CHANNEL=1` + `claude
--dangerously-load-development-channels server:<name>`; without that flag such a session never gets panel messages).

From a checkout:

```sh
npm run build
node scripts/cep/install.mjs --link --debug   # symlink dist/cep, PlayerDebugMode=1, DevTools on http://localhost:8098
# restart Illustrator → Window > Extensions > Chandelier (the panel doesn't reopen by itself after a restart)
CHANDELIER_TRANSPORT=panel npm run test:live  # the live suites through the panel
claude mcp add chandelier-panel -s local -e CHANDELIER_TRANSPORT=panel -- node "$PWD/dist/index.js"
```

After `npm run build` reload the panel (close and reopen it, or `location.reload()` in DevTools). Switching branches
leaves `dist/` stale: rebuild first. Undo: `node scripts/cep/install.mjs --uninstall`.

## 5. Steps

| Step | What | Status |
|------|------|--------|
| P1 | Panel core, snapshot, CEP manifest and UI; `PanelTransport`; `events` tool; dev installer; unit tests (fake panel engine, real socket) | ✅ 2026-11-24 (unit tests 149/149) |
| P2 | First live run in Illustrator 29.1 (macOS): panel loads, Node enabled, runtime loads through `evalScript`, `test/live.mjs` green with `CHANDELIER_TRANSPORT=panel`, events seen; measure per-call latency against the bridge | ✅ 2026-11-24 ([§ 7](#7-first-live-run-p2)); fixed: state pushed with the first look, stale `saved` after a document switch, empty selection events on a switch |
| P3 | Same on Windows (VM) | ⛔ 2026-11-24, rechecked: Illustrator 2027 **native ARM64** blocks every third-party CEP extension by design (built-in list of Adobe ids in `Services.aip`, "not supported on your device") — [§ 8](#8-windows-arm64-p3). CEP on Windows needs x64 Illustrator; Windows ARM needs a UXP panel |
| P4 | Agent trial: a pairing task ("fix what I select") with a fresh agent; decide whether events are worth shipping | ✅ 2026-11-24 with the owner on the Mac ([§ 9](#9-pairing-trial-p4)): every hand selection arrives within ~0.5 s with uuids; "change colour" / "change font" applied to exactly the selected item by uuid. Open: a fresh agent on its own (local `chandelier-panel` server added) |
| P4b | Fresh agent on its own (headless `claude -p`, only the panel server, brief: "I'll write to you from the Chandelier panel… handle my requests there"), designer messages played through DevTools | ✅ 2026-11-24 ([§ 10](#10-fresh-agent-trial-p4b)): found the listen → act → `say` loop from the tool description alone; 3/3 requests after a fix (messages written before the agent's first call were skipped) |
| P5 | Ship or stop: package the panel, README, plugin skill section; merge for 0.5 | ✅ 2026-11-24 (owner: "finish all"): shipped as **experimental, unsigned** — `npx chandelier-mcp install-panel [--uninstall]` (copies the panel, sets `PlayerDebugMode`), README section, plugin skill section, merged into `develop` for 0.5. Signing (ZXP) stays open: it needs Adobe's ZXPSignCmd and a certificate |

## 6. Open questions and risks

- **Same engine? No (confirmed in P2).** The panel's scripts run in an engine named `transient`, the OS bridge's in
  `main`; a global set through one is `undefined` in the other. Globals do persist between panel calls, so `AIA`
  loads once per engine: a mixed session (panel opened mid-way) loads the runtime once more, and `AIA` state (call
  numbers, `status.last_call`) is per engine.
- **Polling cost: small (measured in P2).** One look takes ~1 ms with nothing selected and 1–34 ms with 1 000 items
  selected (§ 7). Polling only runs while an agent is connected and skips a tick while an agent script runs; under a
  burst of agent calls a look can wait until the burst ends (seen in P2: events arrived after 20 back-to-back calls).
- **Hidden panel (open, owner check):** the panel keeps working with Illustrator in the background (all trials); not
  yet checked: docked behind another panel tab. Check: dock it, keep another tab in front, select something, bring the
  Chandelier tab forward — Status → Recent events should list the selection. If it doesn't, a later version can add
  an invisible extension that starts with Illustrator.
- **MRAP (fixed for everyone in 0.5):** a busy spell of seconds outlasted the runtime's retries in P4; `A.retry` now
  tries a fourth time after 1 s.
- **An unsaved document closed during the 0.5 release run (unexplained):** the owner-visible trial poster (unsaved,
  ~990 items) was gone after `npm run test:live`; no tool call named it, nothing in the code closes a non-empty
  document unless asked, and `test/live-edit.mjs` alone with a stand-in document did not reproduce it. Watch for it.
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
- **Still open:** whether the panel keeps polling while it is hidden behind another panel tab or collapsed.
  (Designer selection: confirmed in P4, § 9.)

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
  `UXPCCLibrariesWinArm` — Adobe moved its own Libraries panel to UXP on Windows ARM. A UXP port of the panel would
  be the route for Windows ARM, **but (checked 2026-11-24) Illustrator does not offer UXP to third-party developers**,
  not even as a beta — only Adobe's NDA prerelease programme has it (forum threads Feb–Jul 2026, Mapsoft May 2026);
  Photoshop, Premiere and After Effects do. Revisit when Adobe opens Illustrator UXP; until then Windows ARM keeps
  the OS bridge without events.
- **Side finding:** started directly from a scheduled task (`run-interactive.ps1` → `status {launch}`), Illustrator's
  CEP doesn't start at all (`ERROR PlugPlugSetup:` in `%TEMP%\CEP12-ILST.log`, Adobe's panels missing too); started
  through the Windows shell (`Shell.Application.ShellExecute`, parent explorer) it does. Doesn't affect the OS bridge.
- **Consequence:** on Windows the panel needs x64 Illustrator (real x64 hardware, windows-plan § 9) — or UXP later.
  Windows-on-ARM users would keep the OS bridge (events unavailable).

## 9. Pairing trial (P4)

2026-11-24 · Illustrator 29.1.0, macOS 27.2.1, Node 22.23.3 · the owner at Illustrator, the agent (this session)
acting through a panel-mode MCP client; trial poster (A4: Headline, Subtitle, Sun, Button, Button label) left open.

- **Hand selections arrive, each as one event within a poll tick (~0.5 s):** a click on the headline; deselect
  (`count: 0`); Shift-click adding the Button, then the Sun (items in click order); the Type tool's cursor in the
  Headline, then in the Subtitle (`text: {uuid, text: ""}` — no characters highlighted). None carried `after_agent`.
- **Acting on the selection:** "change color" → `modify_items {refs: "681", fill}` on the Sun; "change text font" →
  `edit_text {refs: "683", font: "Georgia-Bold"}` on the Headline — by the uuid from the event, no search call.
- **A first false alarm:** the owner's first selection never reached the Mac's Illustrator (Illustrator itself had
  nothing selected; the Windows VM's Illustrator was also on screen). A selection made by a script through the OS
  bridge arrived at once, which separated "nothing selected" from "panel missed it".
- **MRAP for ~7 s:** the first two `edit_text` calls through the panel failed with MRAP while the text cursor was in
  the frame; the same change then succeeded through the OS bridge, a fresh panel connection and the same client,
  with Illustrator in front or behind. Not a panel gap: the runtime's `A.retry` (3 tries, 40/80 ms) runs in the
  panel's engine too — its counters read `retried 4, failed 2`, i.e. both calls retried fully; Illustrator stayed
  busy longer than the retry window (cause unknown; perhaps the designer working in a menu or panel at that moment).
  Possible follow-up for both transports: one server-side retry after ~1 s before reporting MRAP.
- **Verdict for P5 (owner):** events work as designed on macOS; the pairing loop needs no extra tool calls (the
  selection's uuids are the refs). Remaining before shipping: a fresh agent's unprompted use of `events`, the hidden
  panel question, packaging/signing, and no Windows-ARM support (§ 8).

## 10. Fresh-agent trial (P4b)

2026-11-24 · Claude Code 2.1.331 headless (`claude -p`, `--strict-mcp-config` with only the panel-mode server, empty
working folder: no CLAUDE.md), Illustrator 29.1.0, macOS 27.2.1. A script played the designer through the panel's
DevTools: select the Sun → "make this blue" → "make the headline a bit smaller" → "thanks, that's all for now".

- **Run 1:** the agent loaded `events`, greeted in the panel and looped `events {say, since, wait: 300, types:
  ["message"]}` → act → answer, and stopped when told — from the tool description alone. **Bug:** "make this blue"
  was lost: it arrived before the agent's first `events` call, which (no `since`) started from "now". Fixed: the
  designer's messages are never skipped — every message not yet handed to the agent is returned (`messagesRead`).
- **Run 2 (after the fix):** 3/3. "make this blue" → `modify_items {refs: 681}` — the uuid from the event's
  selection, no search (9.0 s from Send to answer); headline 48 → 41 pt with a clear before/after answer (17.1 s);
  sign-off with "the document isn't saved yet" (1.9 s). 15 turns, 36 s, $0.28. The activity line went
  waiting → thinking → working → idle as designed.
- **Channel mode, live (2026-11-24):** an interactive Claude Code 2.1.331 session (driven through a pty: folder trust,
  the development-channel warning, then left idle, no task given) with only the channel server. "make this green"
  written in the panel with the Button selected was pushed into the idle session (`channel: make this green`); it
  woke up, made 3 tool calls, set the Button to cmyk(80,10,100,0) and answered in the panel — 6 s from Send to work,
  10 s to the answer. Start-up printed "server:chandelier-channel · no MCP server configured with that name" although
  the server (given with `--mcp-config`) worked — harmless here. For the owner (alias `claude-personal`, own config
  dir): local server `chandelier-channel` set up; start with `claude-personal --dangerously-load-development-channels
  server:chandelier-channel`.
