# Roadmap

Last updated: 2026-11-24 · Legend: ✅ done · 🔄 in progress · ⏳ to do · ❓ needs decision · 🧊 later · ❌ rejected

Each phase has **exit criteria**. A phase is done only when they are met and the docs are updated.

## Overview

| Phase | Goal | Status | Est. effort |
|-------|------|--------|-------------|
| 0 | Research and transport spike | ✅ Done | — |
| 1 | Foundation: fast bridge, runtime, batch, script, inspect, preview | ✅ Done (2026-11-22) | — |
| 2 | Create and edit (parity with the competitor's core) | ✅ Done (2026-11-22) | — |
| 3 | Print and prepress (bleed, preflight, export) | ✅ Done (2026-11-22) | — |
| 4 | Agent efficiency (instructions, skill, script library, benchmarks) | ✅ Done (2026-11-22) | — |
| 5 | Robustness (MRAP, crashes, hangs, live test suite) | 🔄 MVP part done (2026-11-22); hangs and idempotency in 0.1 | ongoing |
| 6 | Distribution (npm, Claude Code plugin, `.mcpb`, brand) | 🔄 brand done; packaging in 0.1 | 1–2 days |
| 7 | Windows (PowerShell/COM bridge, same runtime and tools) — [plan](windows-plan.md); after 0.1, ships as 0.2 | ✅ Released as 0.2.0 (2026-11-24): W0, W2–W8 done; W1 done except the modal-dialog check | — |
| 8 | Future (CEP/UXP transport, events, effects, data merge) | 🧊 | — |

Estimates are for focused agent-assisted work, live-tested on the owner's Mac.

**Milestone 🎯 MVP** cuts across phases 1–5: the smallest server that rebuilds a design from an image better than
both baselines (ExtendScript files and ie3 MCP). See [MVP](#milestone--mvp-) below. ✅ Exit met 2026-11-22 (M2: C1 10 calls / 1.5 min, C2 11 calls / 1.2 min,
both 10/10); real job approved by the owner the same day. **MVP done.**

**Milestone 🎯 0.1 release** ✅ (2026-11-23, released as v0.1.1) cut across phases 4–6: someone other than the owner can install Chandelier and
use it safely. See [0.1 release](#milestone--01-release-) below. Est. effort: 2–3 days.

---

## Phase 0 — Research and spike ✅

- [x] ✅ Read the competitor's architecture (`src/executor/jsx-runner.ts`): per-call osascript + 4 temp files + 1220-line helper parse
- [x] ✅ Benchmark the competitor: `get_artboards` median **366 ms** (2026-11-22)
- [x] ✅ Spike: persistent JXA `doJavascript` → **0.7 ms**/call; `$.global` persists between calls; `pageItem.uuid` works on 29.1
- [x] ✅ Spike: persistent JXA + NSAppleScript with `with timeout` → **5.8 ms**/call (`src/bridge/bridge-mac.js`)
- [x] ✅ Found and fixed: reading NSAppleScript's error via JXA `Ref()` segfaults `osascript` → errors now caught inside the AppleScript ([C1](research/illustrator-quirks.md#bridge-findings-our-spike-2026-11-22))
- [x] ✅ Found and fixed: stale `NSRunningApplication` → false "not running"; check moved into AppleScript (C2)
- [x] ✅ Found and fixed (phase 1): compiling a literal `tell application id "…"` **launched Illustrator** even inside `if … is running` → app id in a variable + raw event `«event miscDjxM»` (C11); per call now 2.8–5.4 ms
- [x] ✅ Benchmark harness: `bench/micro.mjs` (A ExtendScript vs B ie3 MCP vs C ours, scratch document, auto-cleanup) and `bench/macro-metrics.mjs` (agent metrics from transcripts) → [benchmarks](research/benchmarks.md)
- [x] ✅ First micro results: per call A 150–158 ms · B 320–333 ms · **C 5–9 ms**; 200 objects: B 66 s (200 calls) · A 0.23 s · **C 0.10 s**
- [x] ✅ Research: Adobe official MCP (beta only), UXP for Illustrator (public beta ~Q2 2027), CEP still works
- [x] ✅ Collected the owner's field notes (calendar benchmark, issues A1–A10, B1–B12) → [quirks](research/illustrator-quirks.md)
- [x] ✅ Plan, roadmap, research docs (this folder)
- [ ] ❓ Owner answers the [open questions](plan.md#9-open-questions-for-the-owner-)

## Milestone 🎯 MVP ✅

**Goal:** an agent recreates a one-page design from an image (benchmark [M2](research/benchmarks.md#macro-scenario-m2--recreate-design-by-image))
with our server only, beats both baselines on cost, and leaves a file a designer can restyle (global swatches, paragraph styles).

**Exit criteria** (M2, one run per arm; baselines from 2026-11-22, medians of 3):

| Metric | A ExtendScript (baseline) | B ie3 MCP (baseline) | **MVP target C2** (all tools) | **MVP target C1** (no `run_script`) |
|--------|--------------------------:|---------------------:|------------------------------:|------------------------------------:|
| Quality (of 10) | 10 | 10 | **10** | **10** |
| Wall time | 2.5 min | 5.0 min | **≤ 2.5 min** | ≤ 4 min |
| Tool calls (goal, not an exit criterion) | 16 | 103 | ≤ 12 | ≤ 30 |
| Input tokens | 0.81 M | 3.21 M | **≤ 0.8 M** | ≤ 1.6 M |
| Tool errors | 1 | 1 | **0** | 0 |
| Global swatches + paragraph styles | yes | no | **yes** | **yes** |
| Leftover documents after the run | 1 of 3 runs | 0 | **0** | **0** |

The call counts are goals to aim for, not requirements (owner, 2026-11-22).

**Result (2026-11-22, one run per arm on the MVP build):** C1 1.5 min / 10 calls / 0.48 M / 0 errors / 10; C2 1.2 min /
11 calls / 0.42 M / 0 errors / 10; both with global swatches, a paragraph style on every text, no leftover documents →
every exit criterion and both call goals met ([benchmarks](research/benchmarks.md)). MCP p50 5.7 ms ✅; live suites
green ✅. **Real job (2026-11-22):** a client's desk-calendar page (240 × 130 mm, dark fact panel + month grid) rebuilt
from the owner's PNG by Claude through Chandelier: one re-runnable builder (`{year, month}` args), 14 global swatches,
16 paragraph styles, area text that re-flows to the reference's line breaks, PDF/X-4 with bleed; 16 Illustrator calls
including one Illustrator crash and one script error (quirk C24) → ✅ file approved by the owner (2026-11-22). **MVP done.**

Plus: MCP round trip p50 < 10 ms (micro S1–S3 with runner C-mcp); live test suite green; owner uses it on one real job (❓ which).

**In scope** (items from the phases below; tick them there):
- **Phase 1 — all of it:** scaffold, bridge with respawn, runtime (incl. ASCII-safe Cyrillic, which 2 of 3 A runs tripped on),
  `status`, `configure`, `run_script`, `batch`, `documents`, `document_info`, `find_items`, `get_items`, `get_tree`, `preview`;
  verify `uuid` stability and undo granularity (1.6)
- **Phase 2 — the subset M2 needs:** `create_shape`, `create_text` (atomic, fuzzy font), `edit_text`, `modify_items`,
  `duplicate_items`, `arrange_items` (group, z-order, move into), `delete_items`, `layers`, `artboards`, `swatches`
  (global process), `styles` (paragraph/character), `fonts`
- **Phase 3 — basic output:** `export` PNG/PDF (no bleed boxes yet); `preflight` for RGB in CMYK, missing fonts, 12 pt orphans
- **Phase 4:** server `instructions`, response budget, minimal `AIA.*` helpers, runner C-mcp, M2 arms C1/C2 × 3 recorded
- **Phase 5:** MRAP retry, crash → respawn, `documents close` on failure of a build (no orphan "Untitled" — M2 run A3), live suite on a scratch document
- **Install:** local `.mcp.json` for Claude Code (no npm/plugin yet)

**Out of scope (after MVP):** `path_ops`, `place`, `menu_command`, `history`, `transform_items`, `align_items`, PDF/X bleed
boxes, overprint/separations, crop marks, the 12-page calendar macro, npm/plugin/`.mcpb`, Windows, phase 8.

## Milestone 🎯 0.1 release ✅

**Goal:** Chandelier installs in one step for Claude Code and Claude Desktop on a Mac other than the owner's, and an
agent using it recovers from the usual trouble (hangs, timeouts, dialogs) without harming documents.

**Exit criteria:**

| Area | Pass when |
|------|-----------|
| npm | ✅ `npx -y chandelier-mcp` from the registry starts in a clean folder with a fresh npm cache (2026-11-23) |
| Claude Code plugin | ✅ Installed from the marketplace; skill and commands load; M2 run C2p-2 through the plugin: 1.1 min, 10 calls, 0.44 M, 0 errors, 10/10 (2026-11-23) |
| Claude Desktop | ✅ `chandelier-0.1.0.mcpb` installed in Claude Desktop and works (owner, 2026-11-23) |
| Robustness | ✅ Live tests cover a timeout while Illustrator is busy: the agent gets a clear hint, and `status.last_call` shows whether the call finished and the ids it created (a modal dialog takes the same path; not automated) |
| Tool fixes from the logo job | ✅ `preview {region}` relative to a chosen artboard, SVG export clip to artboard, colour-contrast check for RGB documents — each with unit and live tests |
| Languages | ✅ ru_RU: live suites green; en_US moved to 0.2 (Windows VM, owner 2026-11-23) |
| Docs | ✅ README install routes; docs current; released as **v0.1.1** (npm `chandelier-mcp@0.1.1`, plugin 0.1.2, GitHub Release with the `.mcpb`) — 0.1.0 on npm lacks the Node guard |

**In scope** (tick them in the phases below):
- **Phase 4:** the three tool fixes from the logo job
- **Phase 5:** hang detection with hints, idempotency hints (created uuids), ru_RU tests (en_US → 0.2)
- **Phase 6:** npm package + `npx`, Claude Code plugin (config, Illustrator skill, commands), `.mcpb` bundle

**Out of scope (after 0.1):** MCP registry listing (needs the public repo), switching the maintainer's production workflow (❓ owner),
Windows (phase 7), multiple Illustrator versions, `status {restart}`, structured logs, phase 8.

## Phase 1 — Foundation ✅

**Exit criteria:** p50 overhead < 10 ms; `batch` of 100 `run_script`-free steps in one call; `preview` returns an
image; Illustrator restart is survived without restarting the MCP; live tests green.

**Met 2026-11-22:** MCP round trip p50 5.7 ms (bridge alone 2.8–5.4 ms) · 100 `document_info` steps in one `batch` call,
158 ms · `preview` returns artboards, items and regions as images · `test/live-restart.mjs` passes (quit → clear errors →
`status {launch:true}` → runtime reloads, same server) · `npm run test:live` and 57 unit tests green.
Open: GitHub repo (❓ public/private) so CI can run.

### 1.1 Project scaffold
- [x] ✅ `package.json` (Node ≥ 20, ESM), TypeScript 7, `@modelcontextprotocol/sdk` 1.32, `zod` 4, `vitest` 5; MVP-0 server ported to `src/*.ts` → `dist/` (2026-11-22)
- [x] ✅ `npm run build | test | test:live | bench | lint:jsx | typecheck`; ES3 lint = acorn `ecmaVersion: 3` + ES5-API rules + bracketed nested `?:` (B9) + no reserved words as property names
- [x] ✅ `.mcp.json` example for Claude Code; README quick start
- [x] ✅ `AGENTS.md` / `CLAUDE.md` with repo rules (docs always current, ES3 rules for runtime)
- [x] ✅ CI workflow `.github/workflows/ci.yml` (typecheck, build, ES3 lint, unit tests)
- [x] ✅ GitHub repo <https://github.com/acidka/chandelier> (2026-11-22), **private for now**; CI runs on push

### 1.2 Bridge (macOS)
- [x] ✅ Spike: long-lived `osascript -l JavaScript` process, NDJSON protocol, configurable timeout
- [x] ✅ Fix the error path (segfault on JXA `Ref()`, C1) and the running check (C2)
- [x] ✅ Map error numbers to clear messages (`src/transport/errors.ts`): `-600` not running, `-609` crashed, `-1712` timeout (may still be running), `-1743` permission, `5001` script error, plus `-903`, `-1708`, `-1728`, `-10810`, MRAP
- [x] ✅ Node `Transport` class: spawn, readiness handshake (15 s), request queue (one at a time), per-request deadline (timeout + 10 s grace → kill stuck bridge), **reject pending calls and respawn if the bridge dies**, clean shutdown; unit-tested with a fake bridge
- [ ] 🧊 Optimisation: pre-compiled AppleScript handler (target ~1 ms) — not needed now: full MCP round trip p50 is 5.7 ms (2026-11-22), under the 10 ms goal
- [x] ✅ `activate` before save/export (A10), configurable (`settings.activate`, default on)

### 1.3 Runtime (`src/runtime/*.jsx`, ES3)
- [x] ✅ Loader: version hash checked in every call; runtime sent inline (not `$.evalFile`: no file-access dependency) on first call or after Illustrator restart
- [x] ✅ JSON for ExtendScript: `AIA.json` (ASCII-only output) and `AIA.parse` (validated)
- [x] ✅ `dispatch(cmd, args, settings)` → `{ok, data|error, warnings, doc}`; catch-all; `userInteractionLevel` guard; scripts compiled inside the runtime so syntax errors also return a line
- [x] ✅ Helpers: units, coordinate conversion (artboard top-left ⇄ document), colour parser + `colorStr` (same syntax back), ref resolver (`uuid`, `selection`, `name:` glob, `layer:`, `artboard:`, `@n`), item summary serializer; unit-tested in Node with a DOM shim
- [x] ✅ Non-ASCII safety: Node sends ASCII-only (`\uXXXX`), runtime returns ASCII-escaped JSON; runtime source is ASCII

### 1.4 Core tools
- [x] ✅ `status` (+ `launch`): documents, settings, latency, runtime loads, bridge spawns; `launch:true` verified by `test/live-restart.mjs` (relaunch in 7 s)
- [x] ✅ `configure` (units, origin, default artboard, timeouts, auto-activate)
- [x] ✅ `run_script` (`code` or `file` + `args`, helpers as `AIA.*`, JSON result, timeout override, session units/origin)
- [x] ✅ `batch` (steps validated in Node, all run in ONE Apple event; `@n` refs, `stop_on_error`, `rollback` of items created by AIA helpers, `results:"errors"`); 100 `document_info` steps = 158 ms live
- [x] ✅ `documents` (list, new via `DocumentPreset` incl. bleed + artboard grid + names, open (or activate if already open), activate, save, save_as .ai/.pdf/.eps/.svg, close with `discard`)
- [x] ✅ `document_info` (replaces MVP-0 `inspect`: artboards, layers, counts, global/spot swatches, styles, fonts, selection, issues)

### 1.5 Inspect
- [x] ✅ `find_items` with filters (type, name glob, text, font, size, fill/stroke colour, layer, in, artboard, within, top_level, hidden/locked/selected), `fields`, `limit`/`offset`, `count_only`, `by_type` counts
- [x] ✅ `get_items` (detail, merged text runs, paragraph style name, optional path points with handles)
- [x] ✅ `get_tree` (layers → sublayers → groups, depth/limit, optional boxes)
- [x] ✅ `selection` (get, set, add, remove, clear, all by layer/artboard; skips locked/hidden with a warning)

### 1.6 Verify assumptions
- [x] ✅ Is `uuid` stable after save → close → reopen? **No**: uuids are renumbered on reopen, and looking up a stale one raises MRAP (caught: "No item with uuid …"). Refs are valid while the document stays open; names survive (`name:`)
- [x] ✅ Does one `do javascript` call = one undo step? **Yes**: one tool call, and one whole `batch`, undo as one step; `app.undo()` inside a call does not undo that call's own changes → `history undo` counts calls
- [x] ✅ Speed of `doc.pageItems` scans on a 5 000-object document: indexing `doc.pageItems` costs ~0.35 ms per item (1.9 s per scan). Switched every scan to a recursive layer → group walk (`AIA.walk`, 9 ms raw): `find_items` 49–122 ms, `document_info` 243 ms, `get_tree` 25 ms — no cache needed. `get_tree` got a `max_nodes` budget (default 300). Script: `test/verify-assumptions.mjs`

### 1.7 Preview
- [x] ✅ `preview` artboard / items (with pad) / region → MCP image, `max_px`, white or transparent background, saved flag kept. Tested: `imageCapture` renders any rectangle (also off the artboard) in ~25 ms but has a 72 ppi minimum → items/regions below that are downscaled with `sips`; artboards below 72 ppi use `exportFile` (5000 pt artboard → 512 px in 79 ms)

## Phase 2 — Create and edit ✅

**Exit criteria:** every core competitor tool has an equivalent ([parity map](research/competitors.md#tool-parity-map));
the calendar benchmark can be built with ≤ 20 MCP calls and no `run_script`.

**Met 2026-11-22:** parity map all ✅ for the core tools (prepress is phase 3) · `test/calendar-tools.mjs` builds the
12-page A4 calendar for 2027 (global swatches, paragraph styles, 365 day numbers, weekend colour, frame copied to all
artboards) in **8 MCP calls, 1.3 s, no `run_script`**, then verifies day counts per month, weekend colour, no 12 pt
orphans → [benchmarks](research/benchmarks.md) · 30 tools · `npm run test:live` (both suites) and 68 unit tests green.

- [x] ✅ `create_shape` (rect, rounded rect, ellipse, polygon, star, line; `items[]` for many in one call, all-or-nothing; shared appearance props)
- [x] ✅ `create_path` (points + handles in the `get_items` format, **SVG `d` parser** M L H V C S Q T A Z incl. arcs and packed flags, compound paths, `fill_rule`, `scale` + offset; parser unit-tested)
- [x] ✅ `create_text` (point/area/path; fuzzy font match; paragraph/character styles + attributes; `y_ref:"top"`; overset report; `items[]`; **atomic**: the frame is removed if styling fails — A8)
- [x] ✅ `edit_text` (contents, document-wide or per-frame find/replace keeping styling, range styling by index (negative = from end) or match/nth)
- [x] ✅ `modify_items` (bulk or per-item `items[]`: x/y/w/h with anchor, keep_ratio, geometric or visible bounds; all appearance/state props)
- [x] ✅ `transform_items` (move/scale/rotate/reflect about an anchor or any point, as_group, step-and-repeat `copies`; never depends on the ruler origin)
- [x] ✅ `duplicate_items` (offset × count, grid rows × cols, **to other artboards at the same relative position**, into layer/parent)
- [x] ✅ `arrange_items` (group/ungroup keeping stacking order, clip, compound/release, z-order, move into layer/group, move above/below)
- [x] ✅ `align_items` (align, distribute with equal gaps or fixed spacing; to selection/artboard/key object; geometric or visible bounds)
- [x] ✅ `path_ops` (9 Pathfinder ops, outline stroke, offset path with joins, expand appearance, text to outlines; ~100 ms each)
- [x] ✅ `delete_items` (dedupes groups + children; locked skipped unless `force`)
- [x] ✅ `layers` (list tree, add/update/remove/reorder/activate; sublayers by "Parent/Child" path or any-depth name; printable, template, colour; locked/hidden layers handled)
- [x] ✅ `artboards` (top-left rect in **both** directions, in a stable artboard-0 frame — fixes A7; add/update/remove/activate, fit_to_art, grid_layout moving art along)
- [x] ✅ `swatches` (global process with MRAP retry, spot, plain process, gradients (`gradient:Name@angle`), groups, `clean_defaults` by colour type — B5)
- [x] ✅ `styles` (paragraph/character list/create/update/apply/remove, character style on matched text; graphic styles list/apply; **never reads style attributes** — B1; our spec is kept in document XMP via AdobeXMPScript, survives save/reopen; `AIA.metaGet/metaSet` reusable for bleed in P3)
- [x] ✅ `fonts` (search by query/family, families_only, `resolve` shows the fuzzy match; 1 185 fonts scanned in 4 ms)
- [x] ✅ `place` (images linked or embedded, PDF page / AI / EPS linked or editable, SVG file or markup → editable via `groupItems.createFromFile`; fit w/h, centred by default)
- [x] ✅ `menu_command` (internal command names, refs selected first; dialog warning)
- [x] ✅ `history` (undo/redo × count; one step = one earlier tool call or batch)

## Phase 3 — Print and prepress ✅

**Exit criteria:** a PDF/X-4 export with 3 mm and 0.125 in bleed measures correct Trim/Bleed boxes on every page
(checked with a PDF library); preflight on the owner's price-list file shows no false spot-colour or non-printing warnings.

**Met 2026-11-22** (`test/live-print.mjs`): 3-artboard document (A4, A4, 100×50 mm) → PDF/X-4 with 3 mm (document bleed) and
0.125 in bleed: every page measured with pdf-lib — MediaBox = BleedBox = artboard + bleed, TrimBox = artboard, `GTS_PDFXVersion`
PDF/X-4; the document stays bound to its own file. Preflight on a copy of a real production price list: no spot colours
reported (5 global process swatches), Guides/Instructions (non-printing) skipped (10 items), 0 errors, live text as one info
line. Found on the way: that file — like every document built by the owner's scripts and by our `documents new` before
this phase — has **no bleed** (C18). 33 tools; 78 unit tests and three live suites green.

- [x] ✅ `export` PNG/JPG/SVG/WebP per artboard (and items → PNG); scale, DPI or width; transparent or white background — all via `exportForScreens`, which never rebinds the document (unlike saveAs/exportFile, C6)
- [x] ✅ `export` PDF: any preset (default `[PDF/X-4:2008]`), one file (subsets merged with pdf-lib) or per artboard, **bleed** = document / number / per side: artboards grown → export → restored; boxes normalised with pdf-lib from Illustrator's TrimBox (MediaBox = BleedBox = artboard + bleed, TrimBox = artboard), correct whatever document bleed the preset adds
- [x] ✅ `export` PDF variable-font check (B10): fonts with a non-empty `TextFont.axisVector` → warning
- [x] ✅ `preflight`: 18 categories in one walk — RGB in CMYK (linked images by file header: vector fills and embedded images are converted by Illustrator), missing fonts, broken links, low-res (matrix ppi), overset, default-12 pt orphans (A8), off-artboard, registration colour, white overprint, hairlines, small text, no bleed with art at the edge, **real** spot colours only (A2), non-printing/hidden skipped (A3), `ignore` (A4), live text as one info line. Owner's price list (copy): 0 errors, no spot or non-printing noise, 10 skipped; the one warning is real (bleed 0, C18)
- [x] ✅ Document bleed readback (A6/B4): `documents new` stores it in XMP; for other documents `document_info` reads it from the saved .ai file (AI private data, zstd/zlib, `BleedLeftValue`…: 4–9 ms). Found on the way: the property is `documentBleedOffset` — `documentBleedOffsetRect` (used until now, also in the owner's earlier build scripts) is silently ignored, so those documents have **no bleed** (C18)
- [x] ✅ Overprint / separation info (competitor parity): `preflight` returns `inks` (process plates and spot inks used/defined) and overprint / white-overprint checks
- [x] ✅ Crop marks (competitor parity): `artboards {action:"crop_marks"}` draws trim marks in [Registration] around artboards or items (offset = document bleed, min 3 mm)

## Phase 4 — Agent efficiency ✅

**Exit criteria:** calendar benchmark ≤ 20 calls, ≤ 3 min, ≤ 1.5 M input tokens; results recorded in [benchmarks](research/benchmarks.md).

- [x] ✅ MCP server `instructions`: conventions (refs, colours, coordinates, units), load only the needed tools, a 5-step build (global swatches + one paragraph style per text role, batches or one builder, `preview {reference}` compare-and-fix, preflight, save/export/close)
- [x] ✅ Response budget: minified JSON, default `limit`s (find_items 50, get_items 100, selection 50, get_tree 300 nodes), "more" notes, 20 KB clip with a hint; tool list under 50 KB
- [x] ✅ `run_script` helper library documented in the tool description and [agent-guide.md](agent-guide.md#reference-aia-helpers-in-run_script)
- [x] ✅ Run project `.jsx` builders with args and retry on `RETRY`/MRAP: `run_script {file, args, retries}` (replaces the owner's `run.sh`); `AIA.fresh(layer)` makes builders re-runnable
- [x] ✅ MCP prompts: `recreate_design {image, output, notes}`, `print_export {output, bleed}`
- [x] ✅ Agent guide in docs: [agent-guide.md](agent-guide.md) (adapted from the owner's `illustrator-for-ai-agents.md`)
- [x] ✅ Micro benchmark A/B/C (`bench/micro.mjs`) — phase 0
- [x] ✅ Micro benchmark runner **M** (the full Chandelier MCP server over stdio, like B); re-measured 2026-11-22: 4.9–7.2 ms per call vs 267–287 ms for ie3 → [benchmarks](research/benchmarks.md)
- [x] ✅ Micro scenarios S5 `batch` of 200 typed steps (154 ms, 1 call) and S6 `preview` image round trip (68 ms vs ie3 export 172 ms)
- [x] ✅ Macro scenario file `bench/scenarios/calendar.md` (exact prompt, reference `calendar-reference.png` with the product photo removed, 10-point checklist K1–K10)
- [x] ✅ Macro scenario M2 "recreate design in Illustrator by image": `bench/scenarios/design-from-image.md` + reference image (2026-11-22)
- [x] ✅ Run M2 arms A and B × 3 (2026-11-22): A 2.5 min / 16 calls / 0.81 M input; B 5.0 min / 103 calls / 3.21 M; both 10/10 → [benchmarks](research/benchmarks.md)
- [x] ✅ MVP-0 server (`src/server/`: `status`, `documents`, `run_script` + `AIA.*`, `preview`, `inspect`; no deps) + `test/live-smoke.mjs` (2026-11-22)
- [x] ✅ Run M2 arm C2 × 3 on MVP-0: **1.0 min / 13 calls / 0.38 M input / 0 errors**, quality 10, 10, 9 → [benchmarks](research/benchmarks.md)
- [x] ✅ `preview {reference, reference_crop}`: one image [reference | preview | difference], rmse, content box in both (shift/scale) and the 3 most different regions in document coordinates; PNG codec on Node's zlib + macOS `sips` for JPEG/resize (`src/image.ts`, unit-tested). Also from that feedback: `documents new {title}` (phase 1), missing fonts in `preflight`, unstyled text in `document_info`
- [x] ✅ From M2 C2 feedback: instructions ask for paragraph styles + a compare-and-fix round; re-run pattern = `AIA.fresh`
- [x] ✅ Run M2 arm C1 × 3 (2026-11-22): 2.1 min / 15 calls / 1.01 M input / 10, 10, 10 — no `run_script`; and C2 re-run on Chandelier: 1.2 min / 16 calls / 0.85 M / 10, 10, 10 → [benchmarks](research/benchmarks.md)
- [x] ✅ Slim tool schemas: 61.6 KB → 48.9 KB (≈18 k → 14 k tokens per request): `items[]`/`ranges[]` no longer repeat every prop, no `$schema`/`execution`/int bounds; budget test in `test/unit/server.test.ts`; `scripts/schema-size.mjs`
- [x] ✅ From the Chandelier M2 runs: `document_info` fonts = text frames per font (was characters) + `unstyledText` issue; new documents always record their bleed (0 too) and the "unknown" wording is fixed; layer refs `@active`, `@first`, and "Layer 1" finds the localised default layer; `batch {steps_file}`; `swatches add` updates an existing swatch; `create_text {grid}` (cells, dx/dy, `col_props`); `preview {width}`; clearer `run_script` helper docs
- [x] ✅ From the calendar runs' feedback: `documents new {spacing}` = gap between trim edges (C23); per-step `artboard` in `batch` and `AIA.at(k, fn)` (every run added artboard offsets by hand); `preview`/raster `export` hide non-printing layers (C22); `AIA.pstyle/text {hscale}`; `preview {reference, save_to}` also saves the plain render; `batch` lists `export` as not batchable; `test/live-layout.mjs`
- [x] ✅ Run the calendar macro, arms C1 (tools + batch) and C2 (all) × 3 (2026-11-22; A and B are the owner's runs of 2026-11-21): C1 2.6 min / 25 calls / 1.20 M / 10, 10, 10; C2 2.8 min / 23 calls / 1.05 M / 10, 9, 9 → time, tokens, errors ✅, **calls ❌** → [benchmarks](research/benchmarks.md)
- [x] ✅ M2 C2 re-run on the phase 4 build (1 run): 1.5 min / 19 calls / 0.70 M / 10, 13 paragraph styles
- [x] ✅ Shorter build loop (set-up and check rounds were ~10 of the ~19 Illustrator calls): `documents new {units}` sets the session units; `documents save {export: [...], close: true}` finishes in one call; `preview {more, preflight, info}` is one check call; instructions: no `status`/`fonts` first, aim for ~8 Illustrator calls; `test/live-finish.mjs`
- [x] ✅ Re-run the calendar C1/C2 once each on the shorter loop (2026-11-22): C1 2.8 min / 19 calls (12 to Illustrator) / 0.95 M / 9; C2 2.0 min / 17 (8) / 0.78 M / 9 → **phase 4 exit met** → [benchmarks](research/benchmarks.md)
- [x] ✅ From that feedback: export keys in the `documents` description and in a bad export entry's error; `document_info` `unnamedText` counts only text outside named groups
- [x] ✅ From the logo job (0.1): `preview {region, artboard}` measures the region from that artboard; SVG export is always clipped to the artboard (`clipPath` = viewBox); preflight `low_contrast` for RGB documents (text vs the opaque shape under it, WCAG AA 4.5:1 / 3:1 from 18 pt); unit tests + `test/live-release.mjs` (2026-11-22)
- [ ] 🧊 Arm D: Adobe's official MCP when it ships in the stable app

## Phase 5 — Robustness ⏳ (alongside phases 1–4)

- [x] ✅ MRAP: retry known-flaky operations inside the runtime (B3): swatch create/name (a new spot whose naming fails is removed), paragraph-style create/update, style and text attribute application (tools and `AIA.swatch/pstyle/text`), and read-only commands whole; `status.mrap {retried, failed}`
- [x] ✅ Crash detection (`-609`) → clear message; auto-reload runtime after restart (version check on every call; `test/live-restart.mjs`)
- [x] ✅ Hang detection (0.1): after a timeout the server pings Illustrator and the error says either "answers again: call #n probably finished" or "not answering: a modal dialog may be open or it is still busy", with a do-not-repeat warning; unit test (fake Illustrator) + live test (busy Illustrator). A real modal dialog takes the same path but isn't automated (dismissing it needs accessibility rights)
- [x] ✅ `status {restart: true}`: safe restart (0.2.1, 2026-11-24) — refused while any document is unsaved or never saved (names them; stricter than "documents the agent didn't create": a restart must never lose work), else quits (bridge op `quit`: AppleScript / COM `Quit()`), relaunches and reopens the documents, re-activating the active one; unit test + `test/live-safe-restart.mjs` (Windows VM: 37.9 s)
- [x] ✅ Idempotency hints (0.1): every call that may change something is numbered and recorded in Illustrator; `status.last_call` = {call, cmd, finished, ok, created uuids, error, ms}, so after a timeout the agent checks instead of repeating (create tools already return their uuids)
- [x] ✅ Node version guard (0.1.1): MCP clients start the server with the first `node` on their PATH; on Node < 22.15 it now answers with one `status` tool that explains the problem and the fix, instead of failing later (`performance is not defined`, invalid preview images — seen in the plugin benchmark run C2p-1, 2026-11-23)
- [x] ✅ Structured logs (0.2.1): `CHANDELIER_LOG=debug` → one JSON line per tool call on stderr (tool, ms, ok, error); `CHANDELIER_LOG_FILE=<path>` appends to a file; unit test
- [x] ✅ Live integration suite (`npm run test:live`) on scratch documents; a guard (`test/live-lib.mjs`) checks before every call that the active document is one the suite made and aborts otherwise
- [x] ✅ A failed call leaves no empty new document (M2 run A3): documents it created with no items and no file are closed with a warning (in `batch` only with `rollback`); warnings now also come with errors
- [x] ✅ Test in the ru_RU UI (owner's setup); en_US moved to phase 7 (Windows VM, W6) — owner 2026-11-23

## Phase 6 — Distribution and platforms ⏳

- [x] ✅ Brand: logo + GitHub hero image, designed through Chandelier (2026-11-22): [brand.md](brand.md), files in `docs/assets/brand/`, README hero; [how it went](logo-plan.md#10-how-it-went-2026-11-22)
- [x] ✅ npm package + `npx chandelier-mcp` (0.1): `package.json` ready (not private, `os: darwin`, `prepublishOnly`, no source maps); the packed tarball installed in a clean folder with a fresh npm cache runs through `npx` (32 tools, live status). **Published 2026-11-23:** `chandelier-mcp@0.1.0` on npm (npm's staged publishing: upload, then approval on npmjs.com); `npx -y chandelier-mcp` from the registry in a clean folder with a fresh cache: started in 3.3 s, 32 tools, live round trip
- [x] ✅ Claude Code plugin (0.1): `plugin/` (`plugin.json` with the MCP server via `npx chandelier-mcp`, **Illustrator skill**, `/ai-preview`, `/ai-preflight`, icon) and `.claude-plugin/marketplace.json`; `claude plugin validate` passes. Installed from the public marketplace (`acidka/chandelier`) by the owner and loaded in Claude Code (2026-11-23)
- [x] ✅ `.mcpb` bundle for Claude Desktop (0.1): `npm run build:mcpb` (manifest 0.2, darwin, Node ≥ 22.15 — Claude Desktop 6.28 embeds Node 24.22; 6.6 MB); the unpacked bundle ran a live round trip. Installed and working in Claude Desktop (owner, 2026-11-23)
- [x] ✅ MCP registry listing (0.4.1, 2026-11-24): `server.json` (name `io.github.acidka/chandelier`, schema 2025-12-11; `mcp-publisher validate` passes against the live registry) and `mcpName` in `package.json`; unit test `release-meta` keeps the name and every manifest version in step. Published by the owner (`mcp-publisher login github && mcp-publisher publish`): [registry entry](https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.acidka/chandelier), status active. Each release: bump `server.json` with the other manifests, `npm publish`, then `mcp-publisher publish`
- [x] ✅ Switch the maintainer's production workflow from `illustrator-mcp` to this server (2026-11-24, owner asked): its Illustrator skill and agent guide rewritten around Chandelier (existing product builders keep running through their own runner; checks through `preview`/`preflight`), its MCP-only recipe for the old server removed, issue log gets a Chandelier section; the user-level `illustrator-mcp` server removed (Chandelier comes from the plugin)
- [ ] ⏳ Multiple installed Illustrator versions (target a specific app path)

## Phase 7 — Windows 🔄

Plan, options with pros and cons, risks: [windows-plan.md](windows-plan.md). Starts after the 0.1 release; ships as
**0.2**. Test machine: a Parallels VM with Windows 11 **ARM64** (owner, 2026-11-22); x64 via CI until a machine exists.

**Exit criteria:** on Windows 11 (ARM64 VM) with Illustrator 2025+ the live suites (`test:live`, layout, finish,
restart, verify-assumptions) are green ✅; one M2 run (C2) meets the MVP targets ✅ (C2w-1: 1.5 min, 11 calls, 0.35 M,
quality 10); Illustrator is never launched unasked ✅; unit tests green on macOS and Windows ✅ (115/115 in the VM;
CI runs once `develop` is pushed); `npx chandelier-mcp` works on Windows ✅ (packed 0.2.0 in a clean folder with an empty
npm cache — a second Windows account would need its own desktop session); README has a Windows quick start ✅.
MCP round trip p50 < 10 ms is a **goal, not a requirement** (owner, 2026-11-24): a VM can't judge it
([benchmarks § 1b](research/benchmarks.md#1b-windows-02-phase-7-w7--2026-11-24)).

- [x] ✅ W0 Parallels VM (Windows, SSH, Node, Git 2026-11-23; Illustrator 2026 wouldn't install on ARM64 and an emulated x64 VM was dropped as too slow; **2026-11-24: Illustrator 2027 (31.0.0) installs as a native ARM64 build**): Windows 11 ARM64, Illustrator 2027 native ARM64, Node 22 ARM64, Git; set up for agent access over SSH (owner once: [windows-plan § 11](windows-plan.md#11-agent-access-to-the-vm-w0), `scripts/windows/connect-vm.sh` on the Mac); live runs through `scripts/windows/run-interactive.ps1`
- [ ] 🔄 W1 Spike: persistent `powershell.exe` bridge, `GetActiveObject` + `DoJavaScript` loop; measure latency, runtime load size, a 5-min call, a modal dialog, a crash, Unicode, whether activation is needed; choose PowerShell (A) or a .NET helper (E; owner: fine if needed) — 2026-11-24: Illustrator 2027 native ARM64 in the VM; **A kept** (8 ms median), 1 MB scripts, Unicode, errors, 70 s call, `test/live.mjs` green; crash during a call + relaunch ✅ (`test/live-restart.mjs` on Windows); 5-min call ✅; save/export need no activation on Windows → `activate` defaults to false there ✅ (`test/live-w1-activate.mjs`); open: modal dialog (windows-plan § 12)
- [x] ✅ W2 Platform layer (`src/platform.ts`: bridge command, script paths), `src/bridge/bridge-win.ps1` (same NDJSON protocol, cached COM object, OLE message filter, fake-COM mode), `Transport` picks by platform — written 2026-11-23; first live run 2026-11-24: `test/live-w1-bridge.mjs` and `test/live.mjs` green through the full MCP server
- [x] ✅ W3 Pure-JS image pipeline (2026-11-23): PNG 8/16-bit with alpha, JPEG via `jpeg-js` (pure JS), crop and area-average resize in `src/image.ts`; `preview` (shrink, reference crop/resize) and `export {refs}` no longer call `sips`; on macOS `sips` remains only as a converter for other formats (HEIC, TIFF, WebP, interlaced PNG); unit tests + live suites green
- [x] ✅ W4 Paths into ExtendScript (forward slashes for `path`/`dir` args: done 2026-11-23; drive letters ✅ live 2026-11-24); runtime checks on Windows: exports, PDF presets, Pathfinder menu commands (needed a redraw after selecting, `A.syncSelection`), fonts ✅ via the live suites (windows-plan § 13); long paths: exports work, Illustrator's save/open would open a dialog → refused at 260+ chars on Windows ✅; localised names: shared code, tested in ru_RU on macOS ✅
- [x] ✅ W5 HRESULT error map (✅ 2026-11-23, unit-tested; + 0x80041389, 0x800706BE from live runs), hints (busy/timeout messages name the links dialog ✅), launch from the registered install path (✅ live 2026-11-24), activation via `AppActivate` (works; off by default on Windows), Windows `live-restart` (✅ 2026-11-24: kill during a call, relaunch, runtime reload)
- [x] ✅ W6 CI matrix (macOS + Windows) ✅, fake-COM bridge protocol test ✅ (`test/unit/bridge-win.test.ts`, 2026-11-23), live suites green on Windows ✅ 2026-11-24 (all nine, windows-plan § 13; transport grace 1 s on Windows so call timeouts hold)
- [x] ✅ W7 Benchmarks on Windows (micro M, one M2 C2 run) → [benchmarks § 1b and M2 on Windows](research/benchmarks.md#1b-windows-02-phase-7-w7--2026-11-24) — 2026-11-24, VM: M2 C2w-1 1.5 min, 11 calls (6 to Illustrator), 0.35 M input, quality 10; per call 8–10 ms (bridge) / ~20 ms (MCP) when the VM is in its fast state, 100–140 ms in its slow one (Parallels adaptive hypervisor); `bench/micro.mjs` runs on Windows
- [x] ✅ W8 Windows install and troubleshooting in README and agent guide; `.mcpb` and plugin checked on Windows — 2026-11-24: version 0.2.0; plugin starts the server through `plugin/launch.mjs` (Windows has no bare `npx`); packed package, plugin launcher and unpacked `.mcpb` answer a live `status` in the VM (windows-plan § 14)

## Phase 8 — Future 🧊

- [ ] 🔄 CEP panel transport: **events** (selection changed, document saved) pushed to the agent, scripts through the panel — [panel plan](panel-plan.md). MVP on branch `feature/panel` (2026-11-24): panel (local socket, token, snapshot polling, pause switch), `PanelTransport` (opt-in `CHANDELIER_TRANSPORT=panel`, falls back to the OS bridge), `events` tool (long poll), dev installer; unit tests 151/151. **First live run (P2, 2026-11-24, Illustrator 29.1 macOS): live suite 23/23 through the panel; `run_script` median 1.6 ms vs 7.0 ms over the OS bridge; events seen.** Windows P3 blocked: native ARM64 Illustrator 2027 refuses third-party CEP panels ("not supported on your device"); needs x64 Windows. Next: agent pairing trial (P4)
- [ ] 🧊 UXP plugin transport when Illustrator UXP is public (~Q2 2027 beta, ~Q4 2027 GA)
- [x] ✅ Live effects via LiveEffect XML (drop shadow, round corners, feather, blur) — done in 0.4 (`effects`)
- [ ] 🧊 Variables/datasets (data merge), graphs, symbols editing
- [x] ✅ Visual diff: compare a preview with a reference image and report misaligned regions — done in 0.4 (`preview` `differences`)
- [ ] 🧊 Recording: turn a session's tool calls into a reproducible `.jsx` build script

## Milestone 🎯 0.2.1 — quick wins ✅ (released 2026-11-24)

The 0.1.x / quick-win items of the [gap review](research/feature-gaps.md#recommended-order) plus the two 0.2 extras that
didn't make 0.2.0 (owner, 2026-11-24: "finish all 0.2.x"). New features go in as options on existing tools where they
fit, to keep the tool list under its 50 KB budget.

- [x] ✅ Safe restart `status {restart}` + `CHANDELIER_LOG` debug log (phase 5 items, below)
- [x] ✅ Brand and accessibility checks as `preflight` options: `contrast: true` (WCAG AA in CMYK documents too), `tokens {colors, fonts, sizes}` → `off_token` warnings (one per item, all its off-token colours/fonts/sizes in the detail); `test/live-checks.mjs`
- [x] ✅ Bug found on the way: a tinted swatch colour (`swatch:Navy@50`) set the tint on the **swatch itself**, so every later `swatch:Navy` came out at 50 % (both platforms, since phase 2). `A.color` now returns a new SpotColor per use; regression check in `test/live-checks.mjs`
- [x] ✅ `export` options: `variants: [{name, show, hide}]` → one file per layer set (`<stem>-<name>`, or a subfolder), hidden layers also non-printing, every layer restored in a `finally` (the document counts as changed), a wrong layer name fails before anything changes; screen assets `{refs, each: true, scales: [1, 2, 3]}` → one PNG per item named after it, `@2x`/`@3x` copies; `test/live-checks.mjs`
- [x] ✅ Symbols: new tool `symbols` — `list` (instances per symbol), `create` (items → symbol, replaced by one instance in place, `keep` leaves them; a taken name is refused), `place` (x, y, w/h, layer), `replace`, `expand` (break link), `remove` (refused while instances exist, `force` deletes them); `test/live-checks.mjs`
- [x] ✅ Image trace: `path_ops {op: "trace", refs, preset}` — placed or embedded images → Image Trace + expand → a group named like the image, the image removed; non-images refused; `test/live-checks.mjs` (a generated PNG). Preset names follow the UI language
- [x] ✅ Recipe library: `run_script {recipe, args}` runs ready builders shipped in `src/recipes/` (→ `dist/recipes/`, linted as ES3): `calendar-month` (en/uk, Monday/Sunday first, ISO weeks, paragraph styles per role), `labels-sheet`, `business-card` (band into the bleed), `color-chips`, `style-guide` (measures each style sample: a style's size can't be read, B1); `recipe: "list"` reads each file's header; unit test + `test/live-checks.mjs` (renders checked by eye)
- [ ] ➡️ W1 modal-dialog check on Windows (needs the owner at the VM); seen in the wild: the links dialog during a restart's quit (windows-plan § 15, known issue) — carried over to phase 7 (W1); not a release blocker: listed as a known issue in the 0.2.1 notes
- [x] ✅ Regression pass in the Windows VM: all live suites green, unit tests 118/118 (2026-11-24)
- [x] ✅ macOS live pass (Illustrator 29.1 ru_RU, macOS, Node 22.23, 2026-11-24): all seven suites green (`live`, `live-edit`, `live-release`, `live-layout`, `live-finish`, `live-checks`, `live-print`); the earlier `live-print` failure (preflight missed `rgb_in_cmyk` **and** `low_res` for the linked `LowRes` image, so the image itself wasn't seen as a linked raster) didn't reproduce in 10 runs, alone and after the other suites. The test now records how Illustrator sees `LowRes` and prints it if the check fails again
- [x] ✅ Release 0.2.1 (2026-11-24): npm `chandelier-mcp@0.2.1` (owner; checked from the registry with a live `status`), plugin and marketplace 0.2.1 (launcher `^0.2.0` picks it up), `main` fast-forwarded, tag `v0.2.1`, GitHub release with `chandelier-0.2.1.mcpb`

## Milestone 🎯 0.3 — production automation ✅ (released 2026-11-24)

Items 2–4 of the [gap review](research/feature-gaps.md#recommended-order): the jobs print shops and production teams
repeat, done in one call each. Owner, 2026-11-24: "finish 0.3"; the tool-list size problem solved with profiles
(owner suggested a search-and-call pattern; [plan D13](plan.md#d13--tool-profiles-full-by-default-lean-on-request--decided-03)).

- [x] ✅ `data_merge` (new tool): template on an artboard (or refs) with `{{field}}` in any text (keeps the placeholder's style) and items named `{{field}}` (text, linked image fit in its box, symbol, colour) or `{{?field}}` (shown when set); data from CSV/TSV/JSON (BOM, quotes, `;`/tab) or inline rows, `offset`/`limit`; modes `artboards` (one per row), `grid` (n-up per artboard), `files` (one export per row, `{field}`/`{n}` in the path, document unchanged); `name` pattern, `remove_template`, `dry_run` (template fields vs data columns); problems per row (missing image) don't stop a run; [plan D12](plan.md#d12--data-merge-template-copies-not-illustrator-variables--decided-03)
- [x] ✅ Multi-file jobs: `batch {files}` (paths, folders, `*.ai` globs) — open → steps → save a copy into `out_dir` (default; refused when it is the originals' folder) / `in_place` / `none` → `export` (`{name}` = file stem) → close without saving; files already open are skipped; `dry_run` runs and reports without saving or exporting; per-file results
- [x] ✅ Recolor: `swatches {action: "recolor"}` — fills, strokes, text runs (merged into spans) and gradient stops → nearest target swatch (`to`: names or `group:Name`, default all global/spot) within `tolerance` (CIE76 ΔE, default 20), or an explicit `map`; tints of a swatch match by the swatch colour and stay tints; locked content counted, not touched; `dry_run`. `swatches {action: "import"}` reads an `.ase` swatch library (CMYK, RGB, Lab, gray; groups; global/spot/process); colour spec `lab(l,a,b)`
- [x] ✅ Tool profiles: `CHANDELIER_TOOLS=lean` (8 tools + `tools` meta-tool: catalog, query, schema, call; 15.4 KB ≈ 4.9 k tokens) or a list of names; `full` stays the default (53.6 KB; budget raised to 55 KB)
- [x] ✅ Tests: unit (CSV, patterns, ASE round trip, file lists, profiles, lean server) and `test/live-production.mjs` (macOS, Illustrator 29.1 ru_RU, 2026-11-24: green)
- [x] ✅ Windows (VM, Illustrator 2027 ARM64, 2026-11-24): unit tests 127/127; `live-production` green by parts — merge and recolor in a full run, files on a fresh Illustrator (`ONLY=files`); Illustrator crashed twice at a new/opened document late in full runs (the 0.2.1 known issue; a 4× save-close-open loop alone doesn't reproduce it)
- [x] ✅ Release 0.3.0 (2026-11-24): npm `chandelier-mcp@0.3.0` (owner), plugin and marketplace 0.3.0 (launcher `^0.3.0`), `main` fast-forwarded, tag `v0.3.0`, GitHub release with `chandelier-0.3.0.mcpb`

## Milestone 🎯 0.4 — look and print depth ✅ (released 2026-11-24)

Items 8, 10 and 12 of the [gap review](research/feature-gaps.md#recommended-order). Owner, 2026-11-24: "finish 0.4".

- [x] ✅ Live effects: new tool `effects` — drop shadow, outer / inner glow (with colours), round corners, feather, Gaussian blur, offset path, roughen, zigzag, pucker & bloat, transform (copies), raw `{xml}`; lengths in session units, colours as everywhere; `clear` ([plan D14](plan.md#d14--live-effects-through-liveeffect-xml--decided-04); quirks C26, C27). The XML forms come from the art styles Illustrator writes into uncompressed .ai files and from MIT-licensed community work; each type checked live by render and bounds
- [x] ✅ Prepress: `path_ops {op: "trap"}` (spread: overprinting stroke of the item's own fill, 2 × width; paths and text; stroked / gradient fills skipped with a warning; not counted as "created", so a batch rollback keeps the items); `export {output_intent}` (installed CMYK profile by name — "FOGRA39", "GRACoL" — or an .icc → the PDF/X OutputIntent with the profile embedded; `output_intent` read back per PDF; quirk C29); `swatches {action: "convert", mode: cmyk|rgb|gray}` (Edit Colors through the document's profiles; without refs cmyk/rgb also switch the document mode; quirk C28)
- [x] ✅ Visual diff: `preview {reference}` → `differences` (up to 6): difference blobs classified `shifted` (with the measured shift in session units) / `missing` / `extra` / `changed`, with the items in each; rendering noise (< 3 % mean difference) ignored; replaces the 4 × 4 grid `regions`
- [x] ✅ Tool list: full 55.0 KB (budget 56 KB: duplicated colour syntax trimmed from `run_script` and `find_items`), lean unchanged at 15.4 KB
- [x] ✅ Tests: unit (effect XML, diff on synthetic pages, ICC profiles, output intent round trip) and `test/live-look.mjs` (macOS, Illustrator 29.1 ru_RU, 2026-11-24: green); all 10 macOS live suites green
- [x] ✅ Windows (VM, Illustrator 2027 ARM64, 2026-11-24): unit tests 134/134; `live-look` green by parts (effects, print, diff), `live` and `live-print` green. Found and fixed there: ICC folders when the Program Files variables are missing (a scheduled task's environment), and the diff counting only dark pixels as content (a mid green rendered at grey 152 came out `changed` instead of `extra`)
- [x] ✅ Release 0.4.0 (2026-11-24): npm `chandelier-mcp@0.4.0` (owner), plugin and marketplace 0.4.0 (launcher `^0.4.0`), `main` fast-forwarded, tag `v0.4.0`, GitHub release with `chandelier-0.4.0.mcpb`

## Candidates from the 2026-11-23 gap review 🧊

Full analysis, pros and cons: [research/feature-gaps.md](research/feature-gaps.md). Proposed order, not yet decided (❓ owner: data merge before or after Windows):

- [x] ✅ 0.1.x → shipped in 0.2.1: safe restart + logs, recipe library, contrast/token checks as `preflight` options, layer-variant and screen-asset `export` options
- [x] ✅ 0.2: Windows (phase 7, 0.2.0) + `symbols` + image trace (0.2.1)
- [x] ✅ 0.3: `data_merge` (CSV/JSON rows → variations), multi-file jobs with dry run, recolor to a swatch library
- [x] ✅ 0.4: live effects, prepress extras (trap stroke, PDF/X output intents, colour conversion), visual diff

## Rejected ❌

- ❌ **Forking the competitor** — its per-call design is the bottleneck; see [plan D8](plan.md#d8--fork-the-competitor-or-build-fresh--decided-build-fresh-borrow-knowledge)
- ❌ **Native C++ plugin** for v1 — too heavy for the gain; ExtendScript covers almost everything
- ❌ **Temp files for params/results** — inline JSON in the Apple event is faster and leaves nothing behind

## Change log

| Date | Change |
|------|--------|
| 2026-11-22 | Phase 0 done; plan, roadmap and research written |
| 2026-11-22 | Benchmark harness (micro A/B/C + macro metrics) and first results; bridge fixes C1, C2 |
| 2026-11-22 | Macro scenario M2 (recreate design by image), arms A and B × 3; MVP milestone defined with M2-based exit criteria |
| 2026-11-22 | MVP-0 server built; M2 arm C2 × 3: 2.5× faster and half the tokens of ExtendScript files, 5× / 8× vs ie3 |
| 2026-11-22 | Phase 1.1: TypeScript scaffold on the MCP SDK, unit tests, ES3 lint, CI, AGENTS.md |
| 2026-11-22 | Phase 1.2: transport with deadlines, respawn, error map; activate before save |
| 2026-11-22 | Phase 1.3: runtime `dispatch` envelope, settings-aware coordinates/units, refs, colour strings, JSON parse |
| 2026-11-22 | Phase 1.4: `status` (launch, settings, latency) and `configure` |
| 2026-11-22 | Phase 1.4: `documents` (preset-based new with bleed/grid, save_as formats) and `document_info`; quirk C6 (SVG export rebinds the document) |
| 2026-11-22 | Phase 1.4: `batch` (one Apple event, `@n`, rollback); full-stack unit tests with a vm-based fake Illustrator |
| 2026-11-22 | Phase 1.5: `find_items`, `get_items`, `get_tree`, `selection` |
| 2026-11-22 | Phase 1.7: `preview` of artboards, items and regions (`imageCapture` + `exportFile`); quirk C7 |
| 2026-11-22 | Phase 1.6: uuids renumber on reopen; one call = one undo step; scans switched to a recursive walk (find_items 1.9 s → 0.05–0.12 s on 5 000 objects) |
| 2026-11-22 | Bridge fix C11 (no accidental launch, calls 2.8–5.4 ms); restart test: server survives an Illustrator restart |
| 2026-11-22 | **Phase 1 done**: all exit criteria met; server instructions updated for the new tools |
| 2026-11-22 | Phase 2 started: runtime split into `core.jsx` + modules; shared appearance props; `create_shape`; live suite `test/live-edit.mjs` |
| 2026-11-22 | Phase 2: `create_path` with SVG path data (fill rules behave as in SVG) |
| 2026-11-22 | Phase 2: `create_text` (atomic, point/area/path) and `edit_text` (replace, ranges); quirk C12 |
| 2026-11-22 | Phase 2: `modify_items`, `delete_items` |
| 2026-11-22 | Phase 2: `transform_items`, `duplicate_items`; quirk C13 (built-in `.reflect` on every ExtendScript object) |
| 2026-11-22 | Phase 2: `arrange_items`, `align_items`; quirk C14 (clipping-group bounds) |
| 2026-11-22 | Phase 2: `path_ops`; quirk C15 (Pathfinder via menu commands on a group) |
| 2026-11-22 | Phase 2: `layers`, `artboards`; quirks C16, C17; ES3 lint enforces ASCII-only runtime files |
| 2026-11-22 | Phase 2: `swatches` (global/spot/process/gradient, groups, clean_defaults), `fonts` |
| 2026-11-22 | Phase 2: `styles` with specs stored in document XMP |
| 2026-11-22 | Phase 2: `place`, `menu_command`, `history` |
| 2026-11-22 | **Phase 2 done**: calendar in 8 calls without `run_script`; parity map complete for core tools |
| 2026-11-22 | Phase 3 started: bleed really set on new documents (C18) and read back (XMP or .ai file); `test/live-print.mjs` |
| 2026-11-22 | Phase 3: `export` (PDF/X-4 with exact bleed boxes, PNG/JPG/SVG/WebP, items PNG); quirk C19 |
| 2026-11-22 | Phase 3: `preflight` (18 categories, inks, linked-image colour mode); quirks C20, C21 |
| 2026-11-22 | Phase 3: crop marks |
| 2026-11-22 | **Phase 3 done**: PDF/X-4 bleed boxes verified per page; price-list preflight clean of false warnings |
| 2026-11-22 | Renamed to **Chandelier** (npm `chandelier-mcp`, MCP server `chandelier`); public repo github.com/acidka/chandelier |
| 2026-11-22 | MIT licence |
| 2026-11-22 | M2 on Chandelier: C1 (no scripting) and C2 × 3, all 10/10; C2 misses MVP calls/input targets (schema size), no run made paragraph styles |
| 2026-11-22 | Repo made private for now (owner) |
| 2026-11-22 | Phase 4 started: tool schemas 61.6 → 48.9 KB |
| 2026-11-22 | Phase 4: fixes from the M2 agents' feedback (font counts, bleed wording, layer refs, steps_file, swatch upsert, text grid, preview width) |
| 2026-11-22 | Phase 4: `preview` compares with a reference image (side-by-side + diff + offsets) |
| 2026-11-22 | Phase 4: server instructions, MCP prompts, `run_script {retries}`, `AIA.fresh` |
| 2026-11-22 | Phase 4: agent guide with `AIA.*` reference |
| 2026-11-22 | Phase 4: micro benchmark through the full MCP server (runner M) + S5/S6 |
| 2026-11-22 | Phase 4: calendar macro scenario + reference |
| 2026-11-22 | Phase 4: fixes from the calendar agents' feedback (trim-edge spacing C23, batch step `artboard`, `AIA.at`, renders hide non-printing layers C22, `hscale`) |
| 2026-11-22 | Phase 4: calendar macro C1/C2 × 3 + M2 C2 × 1 recorded; exit met on time, tokens, errors and quality, missed on calls (23–25 vs ≤ 20) |
| 2026-11-22 | Benchmarks run once per arm from now on (owner) |
| 2026-11-22 | Phase 4: shorter build loop — `documents new {units}`, `documents save {export, close}`, `preview {more, preflight, info}`; instructions aim for ~8 Illustrator calls |
| 2026-11-22 | MVP: tool-call counts are goals, not exit criteria (owner) |
| 2026-11-23 | W3 done: pure-JS image pipeline, no `sips` for PNG/JPEG (ships in the next release) |
| 2026-11-23 | **0.1 release done:** clean plugin benchmark (C2p-2: 1.1 min, 10 calls, 0.44 M, 0 errors, 10/10); tag v0.1.1 + GitHub Release |
| 2026-11-23 | Plugin 0.1.2: server started with `npx --prefix ${CLAUDE_PLUGIN_ROOT}` — inside a folder whose `package.json` is named `chandelier-mcp` (this repo, a clone) npm 10's npx looked for the bin in the local project and failed with `chandelier-mcp: command not found` |
| 2026-11-23 | 0.1.1: Node version check at startup — on Node < 22.15 the server answers with one `status` tool explaining the fix (found by the plugin benchmark: the user's nvm default is Node 15) |
| 2026-11-23 | Repo public with history collapsed into one commit; CI on macOS; plugin installed from the marketplace and the `.mcpb` working in Claude Desktop |
| 2026-11-23 | `chandelier-mcp@0.1.0` published on npm; verified from the registry with npx |
| 2026-11-23 | Version 0.1.0 (package, server, plugin, marketplace); `npm publish --dry-run` passes |
| 2026-11-23 | Public-repo cleanup: other projects and local paths removed from docs and tests; en_US UI test moved to 0.2 |
| 2026-11-23 | 0.1: npm package, Claude Code plugin + marketplace, Claude Desktop bundle; README install routes |
| 2026-11-22 | 0.1: hang hints after timeouts and `status.last_call` (idempotency) |
| 2026-11-22 | 0.1 started: logo-job tool fixes (region from an artboard, SVG clipped to the artboard, preflight low_contrast) |
| 2026-11-22 | Docs refined: README rewritten (why + benchmark table, features, example requests, tools, quick start, how it works, status); docs index grouped; plan catalogue/risks current; agent guide MVP numbers and real-job lessons; AGENTS.md rules (README, client files, C24) |
| 2026-11-22 | README: Ko-fi button and Support section; `.github/FUNDING.yml` (Buy Me a Coffee doesn't support Ukraine) |
| 2026-11-22 | Windows decisions: ARM64 VM, after 0.1 (as 0.2), .NET helper allowed if needed |
| 2026-11-22 | Phase 7 — Windows planned ([windows-plan.md](windows-plan.md)); Future becomes phase 8 |
| 2026-11-22 | Milestone 0.1 release defined (install for others + robustness + logo-job tool fixes) |
| 2026-11-22 | Logo, lockups and GitHub hero designed through Chandelier; brand.md, README hero |
| 2026-11-22 | Plan for the logo and GitHub hero image ([logo-plan.md](logo-plan.md)); README status → MVP done |
| 2026-11-22 | MVP done: the owner approved the real-job file |
| 2026-11-22 | MVP real job: a client calendar page rebuilt through Chandelier (files kept out of the repo); new quirk C24 |
| 2026-11-22 | MVP exit met: M2 C1 1.5 min / 10 calls / 0.48 M / 10; C2 1.2 min / 11 calls / 0.42 M / 10; owner's real job open |
| 2026-11-22 | Phase 5 (MVP scope): MRAP retry in the runtime + `status.mrap`, failed calls close their empty new document, live-suite document guard; crash/reload ticked |
| 2026-11-22 | Phase 4 done: calendar C1/C2 re-run once each — 19 / 17 calls (≤ 20), 2.8 / 2.0 min, 0.95 / 0.78 M input |
| 2026-11-23 | Feature-gap and competitor review ([research/feature-gaps.md](research/feature-gaps.md)): 4 more community Illustrator MCPs, Adobe AI Assistant and local MCP preview; candidate order for 0.1.x–0.4 |
| 2026-11-23 | Phase 7 (0.2) macOS-side work: `src/platform.ts`, `bridge-win.ps1` (PowerShell 5.1 + COM, message filter, fake-COM mode), HRESULT error map, forward-slash script paths, CI matrix macOS + Windows, `.gitattributes` (LF); agent-driven VM plan (windows-plan § 11, `scripts/windows/`) |
| 2026-11-23 | W0: Windows 11 ARM64 VM reachable over SSH via `connect-vm.sh`; unit tests incl. fake-COM `bridge-win.ps1` green in the VM (113/113) |
| 2026-11-23 | W0 blocker: Illustrator (release x64 and Windows-on-ARM beta) won't install in the Parallels ARM64 VM; live Windows steps need an x64 machine |
| 2026-11-23 | W0 x64 route: ARM VM removed; unattended Windows 10 x64 VM under Parallels x86_64 emulation (`make-x86-vm.sh`, `install-tools.ps1`; `connect-vm.sh` finds the IP via DHCP leases) |
| 2026-11-23 | W2/W6: bridge caches its compiled C# helper DLL; `CHANDELIER_TEST_SLOW` / `CHANDELIER_BRIDGE_START_MS` for slow machines (emulated VM) |
| 2026-11-23 | W0 back to ARM64: x64 VM deleted (too slow); Windows 11 ARM64 VM via `connect-vm.sh` + ngen; unit tests green (112 + 1 skipped), bridge ready in ~2.5 s; owner installs the Illustrator trial |
| 2026-11-24 | W1: Illustrator 2027 installs natively in the ARM64 VM; `test/live-w1-bridge.mjs`; PowerShell bridge kept (8 ms median idle); error map knows 0x80041389 (ExtendScript error); `test/live.mjs` passes on Windows |
| 2026-11-24 | Roadmap: W0 and W2 ticked (Illustrator 2027 native ARM64 in the VM; Windows bridge and platform layer ran live); phase 7 estimate ~3 days left |
| 2026-11-24 | W1/W5 crash test: `test/live-restart.mjs` runs on Windows (kill during a call, relaunch, runtime reload); 0x800706BE = "quit or crashed", bridge drops a dead COM object; relaunch 24 s → 19 s |
| 2026-11-24 | W1: 5-min call passes; save/export work in the background on Windows (`test/live-w1-activate.mjs`) → `activate` defaults to false on Windows; only the modal-dialog check is left |
| 2026-11-24 | W4/W6: all live suites green on Windows. Fixes: menu commands on Windows need a redraw after the script changes the selection (`A.syncSelection`); transport grace 1 s on Windows so call timeouts hold. MCP round trip p50 42 ms on Windows (W7; corrected below) |
| 2026-11-24 | Windows runs stop cluttering the owner's desktop: `run-interactive.ps1` runs headless (no terminal window); `live-w1-activate.mjs` opens no Notepad. Illustrator's links dialog (missing/modified link) noted as a script-blocking modal |
| 2026-11-24 | Windows round trip by layer (VM): bridge 9 ms, runtime wrapper +6, server +1–5 → MCP ~20 ms p50; the 42 ms was `live.mjs`' guard adding a status call per timed call (loop now unguarded); runs vary 21–48 ms in the VM → target needs real hardware (W7) |
| 2026-11-24 | W4/W5 done: Illustrator's saveAs to a 260+ char path opens the Save As dialog and hangs → save/open/place refuse such paths on Windows; busy/timeout hints name the links dialog |
| 2026-11-24 | W8: version 0.2.0; plugin runs `node launch.mjs` (npx.cmd on Windows); README/agent guide for Windows; package, plugin launcher and `.mcpb` checked live in the VM |
| 2026-11-24 | W7: Windows benchmarks in the VM — M2 C2w-1 meets every MVP target (1.5 min, 11 calls, 0.35 M, quality 10); micro M ≈ C (server adds nothing), per-call speed depends on the VM's state; < 10 ms round trip reworded as a goal (owner); all 115 unit tests pass on Windows. Phase 7 done except W1's modal-dialog check; 0.2.0 ready to release |
| 2026-11-24 | **0.2.0 released**: npm `chandelier-mcp@0.2.0` (darwin + win32; registry install checked on macOS and in the Windows VM through the plugin launcher), plugin 0.2.0, GitHub Release v0.2.0 with `chandelier-0.2.0.mcpb`; CI green on macOS and Windows |
| 2026-11-24 | 0.2.1 (1/6): `status {restart}` safe restart (refused while unsaved; quit + relaunch + reopen) and `CHANDELIER_LOG` per-call debug log |
| 2026-11-24 | Tool list 49.96 → 48.13 KB to make room for 0.2.1: `refs` has no per-tool description (the server instructions list the forms; it repeated 15×), `blend` is a checked string instead of a 16-name enum, shorter `layer`/`parent` hints |
| 2026-11-24 | 0.2.1 (2/6): `preflight {contrast, tokens}` → `off_token`; fixed: a tinted swatch colour changed the swatch's own tint (every later plain use came out tinted) |
| 2026-11-24 | 0.2.1 (3/6): `export {variants}` (layer sets) and screen assets `{each, scales}` |
| 2026-11-24 | 0.2.1 (4–5/6): `symbols` tool, `path_ops {op: "trace"}`; Windows: an `Illustrator.exe` without a COM object (a crash clone Windows Error Reporting holds) now gets its own message (0x80080005) instead of "not running"; tool list 49.8 KB |
| 2026-11-24 | 0.2.1 (6/6): recipe library — `run_script {recipe}` with calendar-month, labels-sheet, business-card, color-chips, style-guide; Illustrator crashed twice in the VM late in long live runs (new document after many operations), not reproduced in isolation; the "process exists but does not answer" message now unwraps PowerShell's exception |
| 2026-11-24 | 0.2.1 regression pass in the VM (all live suites green); known issue: the links dialog can block `status {restart}`'s quit; live tests can set a per-call client timeout |
| 2026-11-24 | 0.2.1 macOS live pass: 6 of 7 suites green; `live-print` fails (`rgb_in_cmyk` not reported) — blocks the 0.2.1 release |
| 2026-11-24 | 0.2.1 macOS live pass green: `live-print` failure not reproduced in 10 runs (alone and after all suites); the test now prints how Illustrator sees the linked image if it recurs — release unblocked |
| 2026-11-24 | **0.2.1 released**: npm, plugin 0.2.1, tag `v0.2.1`, GitHub release with the `.mcpb`; W1 modal-dialog check carried over to phase 7 |
| 2026-11-24 | 0.3 features: `data_merge`, `batch {files}`, `swatches {recolor, import}`, tool profiles (`CHANDELIER_TOOLS=lean`, `tools` meta-tool); plan D12, D13; `test/live-production.mjs` green on macOS |
| 2026-11-24 | 0.3 Windows check (live-production by parts; Illustrator 2027 VM crashes late in long runs, as in 0.2.1); version 0.3.0, plugin launcher `^0.3.0` |
| 2026-11-24 | **0.3.0 released**: npm, plugin 0.3.0, tag `v0.3.0`, GitHub release with the `.mcpb` |
| 2026-11-24 | 0.4 features: `effects` tool (11 live effects + raw XML, clear), `path_ops {trap}`, `export {output_intent}`, `swatches {convert}`, `preview` `differences`; plan D14; quirks C26–C29; `test/live-look.mjs` green on macOS |
| 2026-11-24 | 0.4 Windows check (two fixes: ICC folders without env vars, light colours count as content in the diff); version 0.4.0, plugin launcher `^0.4.0` |
| 2026-11-24 | **0.4.0 released**: npm, plugin 0.4.0, tag `v0.4.0`, GitHub release with the `.mcpb` |
| 2026-11-24 | M2 benchmark with the lean tool profile (C2L-1): quality 10, 1.3 min, 11 calls, 0.36 M input; fixed context 40.8 k tokens per request (~11 k less than the full list) — [benchmarks](research/benchmarks.md#m2-with-the-lean-tool-profile--2026-11-24-arm-c2-1-run-040) |
| 2026-11-24 | Distribution: registry listing prepared (`server.json`, `mcpName`, version 0.4.1, `release-meta` unit test; owner publishes); maintainer's production workflow switched from `illustrator-mcp` to Chandelier |
| 2026-11-24 | README refined: quick start moved up (setup notes folded), features regrouped, release history as a table, npm badge; per-call overhead of the ie3 MCP corrected to ~330 ms (benchmarks § micro) |
| 2026-11-24 | **0.4.1 released** (registry metadata, README): plugin 0.4.1, tag `v0.4.1`, GitHub release with the `.mcpb`; npm and the registry entry are published by the owner |
| 2026-11-24 | `chandelier-mcp@0.4.1` on npm (owner; `npx` from the registry starts, 35 tools, `status` answers — Illustrator was not running, so no live round trip) and **listed in the MCP Registry** as `io.github.acidka/chandelier` |
| 2026-11-24 | Panel MVP (gap item 16) started on branch `feature/panel`: CEP panel, `PanelTransport`, `events` tool, installer, unit tests; [panel plan](panel-plan.md) |
| 2026-11-24 | Panel P2 live run (Illustrator 29.1, macOS): panel loads unsigned, live suite 23/23 through it, events arrive; fixed initial/stale `state` and empty selection events on a document switch; installer `--debug` (DevTools, never shipped); `CHANDELIER_TRANSPORT=panel npm run test:live` |
| 2026-11-24 | Agents leave a finished document open (owner's request): server instructions, plugin skill, agent guide, README, `recreate_design` prompt; close only when asked or for many-file jobs (`batch {files}` closes each itself) |
| 2026-11-24 | Panel P3 (Windows 11 ARM64 VM, Illustrator 2027 native ARM64): unit tests 158/158, installer works, but Illustrator refuses the panel as "not supported on your device" (Adobe's own CEP panels load); needs x64 Windows; [panel plan § 8](panel-plan.md#8-windows-arm64-p3) |
| 2026-11-24 | Panel P3 rechecked: the Windows ARM block is deliberate — `Services.aip` allows only a built-in list of Adobe CEP extension ids (`WinARMBlockedCEPExtensionsAlert`); Illustrator 2027 ships UXP, the route for Windows ARM |
