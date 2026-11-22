# Roadmap

Last updated: 2026-11-22 · Legend: ✅ done · 🔄 in progress · ⏳ to do · ❓ needs decision · 🧊 later · ❌ rejected

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
| 7 | Windows (PowerShell/COM bridge, same runtime and tools) — [plan](windows-plan.md); after 0.1, ships as 0.2 | ⏳ | ~5 days |
| 8 | Future (CEP/UXP transport, events, effects, data merge) | 🧊 | — |

Estimates are for focused agent-assisted work, live-tested on the owner's Mac.

**Milestone 🎯 MVP** cuts across phases 1–5: the smallest server that rebuilds a design from an image better than
both baselines (ExtendScript files and ie3 MCP). See [MVP](#milestone--mvp-) below. ✅ Exit met 2026-11-22 (M2: C1 10 calls / 1.5 min, C2 11 calls / 1.2 min,
both 10/10); real job approved by the owner the same day. **MVP done.**

**Milestone 🎯 0.1 release** (next) cuts across phases 4–6: someone other than the owner can install Chandelier and
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

## Milestone 🎯 0.1 release 🔄

**Goal:** Chandelier installs in one step for Claude Code and Claude Desktop on a Mac other than the owner's, and an
agent using it recovers from the usual trouble (hangs, timeouts, dialogs) without harming documents.

**Exit criteria:**

| Area | Pass when |
|------|-----------|
| npm | ✅ `npx -y chandelier-mcp` from the registry starts in a clean folder with a fresh npm cache (2026-11-23) |
| Claude Code plugin | `claude plugin install` works; the Illustrator skill and `/ai-preview`, `/ai-preflight` load; one M2 run (arm C2) through the plugin meets the MVP targets |
| Claude Desktop | The `.mcpb` bundle installs; `status` and a `documents new` → `preview` round trip work |
| Robustness | ✅ Live tests cover a timeout while Illustrator is busy: the agent gets a clear hint, and `status.last_call` shows whether the call finished and the ids it created (a modal dialog takes the same path; not automated) |
| Tool fixes from the logo job | ✅ `preview {region}` relative to a chosen artboard, SVG export clip to artboard, colour-contrast check for RGB documents — each with unit and live tests |
| Languages | ✅ ru_RU: live suites green; en_US moved to 0.2 (Windows VM, owner 2026-11-23) |
| Docs | README install section for all three routes; `docs/` current; change log row; version 0.1.0 tagged on `main` |

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
- [ ] ⏳ `status {restart: true}`: safe restart — refuses if any document has unsaved changes the agent didn't create (owner's Part 2.2 routine)
- [x] ✅ Idempotency hints (0.1): every call that may change something is numbered and recorded in Illustrator; `status.last_call` = {call, cmd, finished, ok, created uuids, error, ms}, so after a timeout the agent checks instead of repeating (create tools already return their uuids)
- [ ] ⏳ Structured logs (`CHANDELIER_LOG=debug`) with per-call timings
- [x] ✅ Live integration suite (`npm run test:live`) on scratch documents; a guard (`test/live-lib.mjs`) checks before every call that the active document is one the suite made and aborts otherwise
- [x] ✅ A failed call leaves no empty new document (M2 run A3): documents it created with no items and no file are closed with a warning (in `batch` only with `rollback`); warnings now also come with errors
- [x] ✅ Test in the ru_RU UI (owner's setup); en_US moved to phase 7 (Windows VM, W6) — owner 2026-11-23

## Phase 6 — Distribution and platforms ⏳

- [x] ✅ Brand: logo + GitHub hero image, designed through Chandelier (2026-11-22): [brand.md](brand.md), files in `docs/assets/brand/`, README hero; [how it went](logo-plan.md#10-how-it-went-2026-11-22)
- [x] ✅ npm package + `npx chandelier-mcp` (0.1): `package.json` ready (not private, `os: darwin`, `prepublishOnly`, no source maps); the packed tarball installed in a clean folder with a fresh npm cache runs through `npx` (32 tools, live status). **Published 2026-11-23:** `chandelier-mcp@0.1.0` on npm (npm's staged publishing: upload, then approval on npmjs.com); `npx -y chandelier-mcp` from the registry in a clean folder with a fresh cache: started in 3.3 s, 32 tools, live round trip
- [x] ✅ Claude Code plugin (0.1): `plugin/` (`plugin.json` with the MCP server via `npx chandelier-mcp`, **Illustrator skill**, `/ai-preview`, `/ai-preflight`, icon) and `.claude-plugin/marketplace.json`; `claude plugin validate` passes. Install test + one M2 run through the plugin after `npm publish`
- [x] ✅ `.mcpb` bundle for Claude Desktop (0.1): `npm run build:mcpb` (manifest 0.2, darwin, Node ≥ 22.15 — Claude Desktop 6.28 embeds Node 24.22; 6.6 MB); the unpacked bundle ran a live round trip. Install in Claude Desktop: owner's step
- [ ] ⏳ MCP registry listing (once the repo is public again)
- [ ] ⏳ Switch the maintainer's production workflow from `illustrator-mcp` to this server; update its agent docs and skill (❓ owner)
- [ ] ⏳ Multiple installed Illustrator versions (target a specific app path)

## Phase 7 — Windows ⏳

Plan, options with pros and cons, risks: [windows-plan.md](windows-plan.md). Starts after the 0.1 release; ships as
**0.2**. Test machine: a Parallels VM with Windows 11 **ARM64** (owner, 2026-11-22); x64 via CI until a machine exists.

**Exit criteria:** on Windows 11 (ARM64 VM) with Illustrator 2025+ the live suites (`test:live`, layout, finish,
restart, verify-assumptions) are green; MCP round trip p50 < 10 ms (micro runner M); one M2 run (C2) meets the MVP
targets; Illustrator is never launched unasked; unit tests green on a macOS + Windows CI matrix; `npx chandelier-mcp`
works on a fresh Windows account; README has a Windows quick start.

- [ ] ⏳ W0 Parallels VM: Windows 11 ARM64, Illustrator (native ARM64 or x64 emulation — record which), Node 22 ARM64, Git
- [ ] ⏳ W1 Spike: persistent `powershell.exe` bridge, `GetActiveObject` + `DoJavaScript` loop; measure latency, runtime load size, a 5-min call, a modal dialog, a crash, Unicode, whether activation is needed; choose PowerShell (A) or a .NET helper (E; owner: fine if needed)
- [ ] ⏳ W2 Platform layer (`src/platform/{mac,win}.ts`), `src/bridge/bridge-win.ps1` (same NDJSON protocol, cached COM object, OLE message filter), `Transport` picks by platform
- [ ] ⏳ W3 Pure-JS image pipeline (JPEG decode, resize, crop) replacing macOS `sips` on both platforms — can start now on macOS
- [ ] ⏳ W4 Paths into ExtendScript (forward slashes, drive letters); runtime checks on Windows (exports, PDF presets, Pathfinder menu commands, fonts, localised layer names, long paths)
- [ ] ⏳ W5 HRESULT error map, `status` hints, launch from the registered install path, activation via `AppActivate`, Windows `live-restart`
- [ ] ⏳ W6 CI matrix (macOS + Windows), fake-COM bridge protocol test, live suites green on Windows
- [ ] ⏳ W7 Benchmarks on Windows (micro M, one M2 C2 run) → [benchmarks](research/benchmarks.md)
- [ ] ⏳ W8 Windows install and troubleshooting in README and agent guide; `.mcpb` and plugin checked on Windows

## Phase 8 — Future 🧊

- [ ] 🧊 CEP panel transport (WebSocket inside Illustrator): sub-millisecond calls, **events** (selection changed, document saved) pushed to the agent
- [ ] 🧊 UXP plugin transport when Illustrator UXP is public (~Q2 2027 beta, ~Q4 2027 GA)
- [ ] 🧊 Live effects via LiveEffect XML (drop shadow, round corners, feather, blur)
- [ ] 🧊 Variables/datasets (data merge), graphs, symbols editing
- [ ] 🧊 Visual diff: compare a preview with a reference image and report misaligned regions
- [ ] 🧊 Recording: turn a session's tool calls into a reproducible `.jsx` build script

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
