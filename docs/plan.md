# Plan

Last updated: 2026-11-22 · Status legend: see [README](README.md#status-legend-used-in-every-doc)

## 1. Why this project exists

| Problem | Evidence |
|---------|----------|
| The independent MCP (`ie3jp/illustrator-mcp-server`) is **slow per call** | Median **366 ms** for a read-only `get_artboards` (10 runs, 2026-11-22). Our spike bridge: **0.7–6 ms** transport overhead. → [benchmarks](research/benchmarks.md) |
| Building a document through MCP calls is **very expensive for the agent** | Owner's calendar benchmark: MCP-only **365 calls, 21.4 min, 13.3 M input tokens** versus one ExtendScript run: **17 calls, 2.7 min, 0.94 M tokens** |
| **Missing features** that real print work needs | No global swatches, no paragraph/character styles, no bleed on new documents, PDF bleed broken (A1) |
| **Bugs we can't get fixed upstream quickly** | Our PRs #59, #60, #61 have been open since 2026-11-11 with no review. Upstream merges in batches every 2–6 weeks |
| Adobe's official MCP is **beta-only and basic** | Needs Illustrator (Beta); covers documents, inspection, layers, transforms, simple text, export; every change needs approval. → [competitors](research/competitors.md) |

## 2. Goals and non-goals

**Goals**
1. **Speed:** per-call overhead under 10 ms (p50) on macOS, so the agent waits on Illustrator, not on plumbing.
2. **Few calls:** a whole layout in **≤ 20 calls** (target for the calendar benchmark: ≤ 20 calls, ≤ 3 min, ≤ 1.5 M input tokens).
3. **Full power:** anything ExtendScript can do is reachable through `run_script`, with a preloaded helper library so scripts stay short.
4. **Print-ready:** global swatches, styles, bleed, real PDF bleed boxes, preflight that doesn't cry wolf.
5. **Safe:** never touch documents the agent didn't target, never discard unsaved work silently, no orphan objects after errors.
6. **Owned by us:** we merge our own fixes the same day.

**Non-goals (for now)**
- Windows support in v1 (planned later: [roadmap phase 7](roadmap.md#phase-7--windows-), [windows-plan.md](windows-plan.md)).
- Replacing ExtendScript build files for big reproducible builds. We make them easier to run (`run_script` with `file` + `args`), not obsolete.
- A UI panel inside Illustrator (later, CEP/UXP: [phase 8](roadmap.md#phase-8--future-)).

## 3. Design principles

1. **One persistent connection.** Start the bridge once; never spawn a process per call.
2. **Load the helper runtime once** into Illustrator's persistent ExtendScript engine; each call sends only a command name and JSON arguments. Reload automatically if Illustrator restarted.
3. **Batch first.** Every mutating tool can also run as a step inside `batch`, so 100 objects = 1 call.
4. **Compact responses.** Minified JSON, only the fields that matter, `fields` and `limit` options on read tools, counts instead of lists when large.
5. **One coordinate convention everywhere** — in requests *and* responses (fixes A7/A9).
6. **Atomic operations.** A failed create removes what it created (fixes A8); `batch` can roll back created items.
7. **Look, don't guess.** A `preview` tool returns an image straight into the conversation, at a token-friendly size.
8. **Errors that teach.** Every error says what happened, whether something may have been changed, and what to do next.

## 4. Architecture

```
 AI agent (Claude Code, Cursor, …)
        │  MCP (stdio)
 ┌──────▼─────────────────────────────┐
 │ Node/TypeScript MCP server          │  tool schemas (zod), session settings (units, origin),
 │  • tools/*  → command + args        │  batching, queue (Illustrator is single-threaded),
 │  • transport (queue, timeouts)      │  image post-processing, PDF box fixes (pdf-lib)
 └──────┬─────────────────────────────┘
        │  newline-delimited JSON over stdin/stdout (one long-lived child process)
 ┌──────▼─────────────────────────────┐
 │ bridge-mac.js  (osascript -l JS)    │  NSAppleScript in-process: `with timeout of N seconds`
 │                                     │  → tell app id "com.adobe.illustrator" to do javascript
 └──────┬─────────────────────────────┘
        │  Apple Events
 ┌──────▼─────────────────────────────┐
 │ Illustrator ExtendScript engine     │  $.global.AIA = runtime (loaded once, versioned):
 │  core.jsx + modules: JSON, coords,  │  commands registry, dispatch(), helpers for run_script
 │  refs, commands{...}                │
 └────────────────────────────────────┘
```

Per call, Node sends one short ASCII line:

```js
(function(){ if(!$.global.AIA || AIA.v!=="<hash>") return "\u0001RELOAD";
  return AIA.dispatch({cmd, args, settings}); })()
```

On `RELOAD` Node sends the runtime source once (inline, ~30 KB) and repeats the call. Inline instead of
`$.evalFile`: Illustrator never needs read access to the package folder.

Tools that run inside Illustrator are defined as a **runtime step** (`{cmd, args}`); a tool call sends one step, and
`batch` validates all steps in Node and sends them in **one** Apple event (`AIA.cmd.batch`), so `@n` references and
rollback work inside Illustrator.

The runtime answers with a JSON envelope `{ok, data | error, warnings, doc}`, and every exception inside is caught
there, so Illustrator never shows a dialog and the bridge never sees a raw AppleScript error from our code.

## 5. Architecture decisions (pros and cons)

### D1 — Language: TypeScript on Node ✅ decided

| Option | Pros | Cons |
|--------|------|------|
| **TypeScript / Node** (chosen) | Official MCP SDK is first-class; same language as ExtendScript (shared mental model, can unit-test pure runtime helpers in Node); `npx` install; Claude Code plugins ship Node servers easily | Needs a recent Node on the machine (≥ 22.15; documented, and Claude Desktop brings its own) |
| Python | Owner uses Python for PDF tooling (PyMuPDF) | Second language next to ExtendScript; `uvx` install is fine but heavier; no shared code with runtime |
| Go / Swift binary | Single binary, fastest start | MCP SDKs less mature; Swift could replace the JXA bridge but adds a compile/sign step |

### D2 — Transport to Illustrator 🔄 spike done, needs one optimisation

| Option | Per-call overhead (measured / expected) | Pros | Cons |
|--------|------|------|------|
| `osascript` process per call + temp files (competitor) | **~366 ms** (their full tool call) | Simple; no long-lived state | Process spawn + AppleScript compile + dictionary load + 4 temp files + 1220-line helper parse **every call** |
| **Persistent JXA, `app.doJavascript()`** | **0.7 ms** | Fastest Apple Events path; no files | **Fixed ~2 min AppleEvent timeout** — big builds fail with -1712 (B12) |
| **Persistent JXA + NSAppleScript compiled per call** (chosen) | **2.8–5.4 ms** (2026-11-22, raw event code) | Configurable `with timeout`; still one process; errors come back with numbers | A few ms of compile per call; the app id must be a variable or compiling launches Illustrator (C11) |
| Persistent JXA + **pre-compiled AppleScript handler** called with an Apple event (target) | expected ~1 ms | Fast **and** configurable timeout | Building the subroutine Apple event in JXA is fiddly; needs testing |
| CEP panel with WebSocket/HTTP server inside Illustrator | expected < 1 ms | Push events (selection changed, document opened); no Apple Events permission | Must install an extension; unsigned needs `PlayerDebugMode`; CEP is legacy (UXP coming 2027); panel must be open |
| UXP plugin | — | Adobe's future platform, modern JS | **Not available** to third parties in Illustrator until ~Q2 2027 (public beta) |
| C++ plugin (Illustrator SDK) | fastest | Full native API incl. things ExtendScript lacks | Huge effort, per-version builds, signing/notarisation |

**Decision:** ship the persistent JXA bridge; optimise to a pre-compiled handler if the 5 ms matters; keep the
`Transport` interface clean so a CEP/UXP transport can be added later without touching tools.

### D3 — Helper runtime loaded once ✅ decided (verified: `$.global` survives between calls)

| Option | Pros | Cons |
|--------|------|------|
| **Load once into `$.global`, versioned by hash** (chosen) | Calls send ~100 bytes instead of ~50 KB; parse cost paid once | State lives in Illustrator: must detect restarts/version changes (done by the hash check in every call) |
| Send helpers with every call (competitor) | Stateless, always consistent | Parse cost and payload on every call |

### D4 — Tool granularity ✅ decided

| Option | Pros | Cons |
|--------|------|------|
| Many tiny tools (competitor: 66) | Each schema is simple | Big tool list eats context every turn; many calls for real work; overlap/confusion |
| **~30 focused tools + `batch` + `run_script`** (chosen) | Common work in 1 call; tool list stays readable; escape hatch for everything else | Some tools take an `action` parameter, so schemas are a bit richer |
| Only `run_script` | Maximum power, tiny tool list | Agent must write ExtendScript for everything; more errors; no validation |

### D5 — Coordinate system ❓ needs owner confirmation (proposal below)

| Option | Pros | Cons |
|--------|------|------|
| **Artboard-relative, origin top-left, y grows down** (proposed default) | Matches how agents measure screenshots and how designers think (pixels from the top); no sign flips; same in requests and responses | Differs from Illustrator's internal Y-up document coordinates (we convert) |
| Illustrator document coordinates (Y-up) | Matches raw ExtendScript | The source of A7/A9-style confusion; agents must do `top − y` maths |

Plus: a session setting `units` (`pt` default, `mm`, `in`, `px`) and `origin` (`artboard` default or `document`).
Every response states the system it uses (once per response, not per item).

### D6 — Object identity ✅ decided

| Option | Pros | Cons |
|--------|------|------|
| **`pageItem.uuid`** (chosen; verified on 29.1) | Stable while the document is open; fast lookup via `doc.getPageItemFromUuid` | **Renumbered on reopen** (verified 2026-11-22): refs don't survive close/open; use `name:` for that |
| Index paths (`layer 0 / item 3`) | Readable | Break as soon as anything is added or deleted |
| Names | Human-friendly, survive reopen | Not unique; many items unnamed |

References accepted everywhere: `"1375"` (uuid), `"selection"`, `"name:Header"`, `"layer:Grid"`, `"artboard:2"`
(items on artboard 2), and `"@3"` inside `batch` (result of step 3).

### D7 — Colours as short strings ✅ decided

`"#1E2A44"`, `"cmyk(100,88,30,20)"`, `"gray(60)"`, `"swatch:Navy"`, `"swatch:Navy@50"` (tint), `"none"`.
Pros: a few tokens per colour, readable, one parser. Cons: one more mini-syntax to document (in the tool descriptions).

### D8 — Fork the competitor or build fresh ✅ decided: build fresh, borrow knowledge

| Option | Pros | Cons |
|--------|------|------|
| Fork `ie3jp/illustrator-mcp-server` | 66 tools and ~720 tests on day one; Windows support; already in MCP registries | Its slowness is the core design (per-call osascript, per-call helper parse) — changing it touches everything; Japanese comments; every upstream merge conflicts |
| **Fresh build** (chosen) | Architecture built around speed and batching; small codebase we fully understand | Must re-implement features; risk of missing edge cases they already fixed |

Mitigation: their repo is MIT. We study their tools and tests for edge cases and keep a [parity map](research/competitors.md#tool-parity-map).
Any copied code keeps their copyright notice.

### D9 — Preview images ✅ decided (verified 2026-11-22: both, by case)

| Option | Pros | Cons |
|--------|------|------|
| `document.imageCapture(file, bounds, options)` | Any region (an item, a group, part of an artboard) | Behaviour across versions less known |
| `exportFile(PNG24)` with artboard clipping | Well-known | Whole artboard only; touches the active artboard |

**Decision:** `imageCapture` for items, regions and artboards at ≥ 72 ppi (min. resolution is 72: smaller item/region
previews are rendered at 72 and downscaled with macOS `sips`); `exportFile` for artboards below 72 ppi and as a fallback.
Preview returns the PNG as MCP **image content**, scaled to `max_px` (default 1024) so it doesn't waste tokens.

### D10 — Distribution: MCP first, Claude Code plugin second ✅ decided

| Option | Pros | Cons |
|--------|------|------|
| **Standalone MCP (npm/npx)** first | Works in every MCP client (Claude Code, Cursor, Codex, Claude Desktop) | Plain MCP can't ship skills or slash commands |
| Claude Code plugin wrapping the MCP | Bundles the MCP **plus** a skill (the owner's "Illustrator for AI agents" guide), commands like `/ai-preview`, hooks | Claude Code only |

Both: the plugin is a thin wrapper around the npm package.

### D11 — Safety defaults ✅ decided

- Never auto-launch Illustrator (unless `status {launch: true}`).
- Never auto-activate (bring to front), except before **save/export** on macOS, where background hangs were seen (A10). Configurable; off by default on Windows, which saves and exports fine in the background (W1, 2026-11-24).
- `documents close` on an unsaved document requires `discard: true` or `save: true`.
- Writes target an explicit document when given (`doc` argument); otherwise the active one, and every response says which document was used.
- `run_script` is powerful by design; it's documented as such. No sandbox (ExtendScript can't be sandboxed).

## 6. Tool catalogue

Every mutating tool can also be a `batch` step: `{"tool": "create_shape", "args": {...}}`.
Status 2026-11-22: tools 1–32 are built (phases 1–3; crop marks are an `artboards` action); `symbols` is not built yet
(phase 8, with symbol editing).
MVP-0's `inspect` became `document_info`. Create tools also take `items:[…]` for many objects in one call.

| # | Tool | Actions / what it does | Phase |
|---|------|------------------------|-------|
| 1 | `status` | Bridge + Illustrator state, version, open docs, settings, latency; `launch: true` | 1 |
| 2 | `configure` | Session: `units`, `origin`, default `artboard`, timeouts, auto-activate | 1 |
| 3 | `run_script` | Run ExtendScript `code` or a `.jsx` `file` with `args`; helpers available as `AIA.*` (`AIA.at(k, fn)` = coordinates from artboard k); returns JSON | 1 |
| 4 | `batch` | Many tool steps in one call; `@n` refs; per-step `artboard` (coordinates from that artboard); `stop_on_error`; `rollback` of created items | 1 |
| 5 | `documents` | `list`, `new` (preset, size, colour mode, **bleed**, artboard grid; `spacing` = gap between trim edges), `open`, `activate`, `save`, `save_as` (ai/pdf/svg/eps; `export: [...]` + `close: true` finish a build in one call), `close`; `new {units}` sets the session units | 1 |
| 6 | `document_info` | Compact summary: size, colour mode, artboards, layers, counts by type, swatches, fonts, selection | 1 |
| 7 | `find_items` | Query by type, name (pattern), layer, artboard, text, font, size range, fill/stroke colour, bounds, state; `fields`, `limit` | 1 |
| 8 | `get_items` | Full detail by refs: geometry, appearance, text runs and styles, path points (opt-in) | 1 |
| 9 | `get_tree` | Layers → groups → items outline with depth/limit | 1 |
| 10 | `selection` | `get`, `set`, `add`, `clear`, `all` (optionally per artboard/layer) | 1 |
| 11 | `preview` | PNG of an artboard, items or region returned as an image (what prints: non-printing layers hidden); `max_px`, background; `reference` comparison; one check call: `more` (other artboards), `preflight: true`, `info: true` | 1 |
| 12 | `create_shape` | `rect`, `rounded_rect`, `ellipse`, `polygon`, `star`, `line` + style | 2 |
| 13 | `create_path` | Points with handles **or an SVG path `d` string**; open/closed; compound | 2 |
| 14 | `create_text` | Point / area / path text; font (fuzzy name match), size, colour, alignment, leading, tracking, paragraph/character style; atomic | 2 |
| 15 | `edit_text` | Set contents; style ranges (`start/end` or `match`); find & replace across the document | 2 |
| 16 | `modify_items` | Bulk set: position, size (with anchor), rotation, fill, stroke, width, dash, caps/joins, opacity, blend mode, name, hidden, locked, note | 2 |
| 17 | `transform_items` | Move, scale, rotate, reflect about a reference point; `copies` for step-and-repeat | 2 |
| 18 | `duplicate_items` | Offset copies, grids (rows × cols), **copy to other artboards at the same relative position** | 2 |
| 19 | `arrange_items` | Group/ungroup, clipping mask, compound path, z-order, move into layer/group | 2 |
| 20 | `align_items` | Align/distribute relative to selection, artboard or key object; fixed spacing | 2 |
| 21 | `path_ops` | Pathfinder (unite, minus front, intersect, exclude, divide, trim, merge, crop), outline stroke, offset path, expand, create outlines | 2 |
| 22 | `delete_items` | Delete by refs/query; returns count | 2 |
| 23 | `layers` | `list`, `add`, `update` (name, visible, locked, printable, colour), `remove`, `reorder`, sublayers | 2 |
| 24 | `artboards` | `list`, `add`, `update`, `remove`, `activate`, `fit_to_art`, `grid_layout` — **top-left rect everywhere** | 2 |
| 25 | `swatches` | `list`, `add` (global process / spot / plain), `update`, `remove`, gradients, groups, `clean_defaults` | 2 |
| 26 | `styles` | Paragraph, character and graphic styles: `list`, `create`, `update`, `apply`, `remove` | 2 |
| 27 | `fonts` | Search installed fonts (family/style/PostScript name) | 2 |
| 28 | `place` | Place/embed raster, PDF, AI; import **SVG markup** as editable art | 2 |
| 29 | `history` | `undo` / `redo` with count | 2 |
| 30 | `export` | PNG/JPG/SVG/PDF/WebP per artboard, items or document; scale/DPI; **PDF bleed with real Trim/Bleed boxes** | 3 |
| 31 | `preflight` | RGB in CMYK, missing fonts, broken links, low-res images, overset text, default-12 pt orphans, items off artboard, real spot colours only, non-printing layers skipped | 3 |
| 32 | `menu_command` | `app.executeMenuCommand` on refs (escape hatch for effects and anything without an API) | 2 |
| 33 | `symbols` | `list`, `create` from items, `place` | 8 |

Tool descriptions are kept short; the conventions (refs, colours, coordinates) live in the MCP server
`instructions`, sent once per session instead of being repeated in 32 schemas.

## 7. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Illustrator modal dialog blocks all calls | Medium | High | `userInteractionLevel = DONTDISPLAYALERTS` during every call; catch all errors in the runtime; hang detection + "check Illustrator for a dialog" hint |
| `MRAP` errors in long sessions (B3) | High | Medium | ✅ Retry inside the runtime for known-flaky operations (swatches, styles, text styling, read-only commands); `status.mrap` reports retries and failures; restart routine in the agent guide |
| Illustrator crash on certain reads (B1) | Low | High | Runtime never reads `ParagraphStyle.characterAttributes`; crash detected (`-609`) → clear message, runtime reload after restart |
| Apple Events permission prompt on first run | High (first run) | Low | Documented; `status` explains the System Settings path on `-1743` |
| Background hang on save/export (A10) | Medium | Medium | Auto-activate before save/export (configurable) |
| JXA/NSAppleScript deprecated in a future macOS | Low | High | `Transport` interface; Swift helper or CEP transport as fallbacks |
| Runtime state lost when Illustrator restarts | Certain | Low | Hash check in every call reloads automatically |
| Localised UI strings (Russian here) | Certain | Medium | Never match by localised names (swatches by colour type, menu commands by internal ID); test in ru_RU |
| Illustrator 2026 behaves differently | Medium | Medium | Live test suite runs on every installed version; `status` reports version |
| Scope creep (32 tools) | Medium | Medium | Phases with exit criteria; `run_script` covers gaps meanwhile |

## 8. Testing strategy

| Layer | How | When |
|-------|-----|------|
| TypeScript (schemas, queue, protocol, PDF boxes) | `vitest` unit tests, no Illustrator needed | Every commit (CI on GitHub Actions, macOS and Windows runners; the Windows job also drives `bridge-win.ps1` in fake-COM mode) |
| Runtime pure helpers (colour parse, coords, SVG `d` parser, JSON) | Load `src/runtime/*.jsx` in Node with a tiny shim and test functions | Every commit |
| ES3 compatibility of the runtime | Lint rule set that forbids ES5+ (`let`, arrows, `Array#map`, `JSON`, trailing commas) | Every commit |
| Live integration | `npm run test:live` creates **scratch documents**, runs every tool, checks results, closes without saving; a guard aborts if another document becomes active | Before each release, on the owner's Mac |
| Benchmarks | `npm run bench` against the competitor and the calendar scenario | Each phase exit; results in [benchmarks](research/benchmarks.md) |

## 9. Open questions for the owner ❓

1. **Coordinates (D5):** OK with top-left / y-down artboard coordinates as the default?
2. ~~**Name**~~ ✅ decided 2026-11-22: **Chandelier** (npm `chandelier-mcp`, MCP server `chandelier`) — see the README.
3. **Public or private repo?** Private for now (<https://github.com/acidka/chandelier>, made private again 2026-11-22; MIT licence kept for when it opens).
4. **Windows:** needed at all, and when? → yes: roadmap phase 7, after the 0.1 release (as 0.2), tested on a Windows 11 ARM64 VM ([windows-plan.md](windows-plan.md)) ✅
5. **Migration of the maintainer's production workflow:** switch it from `illustrator-mcp` to this server once phase 3 is done?
