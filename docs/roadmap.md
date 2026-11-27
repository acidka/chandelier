# Roadmap

Last updated: 2026-11-27 · Legend: ✅ done · 🔄 in progress · ⏳ to do · ❓ needs decision · 🧊 later · ❌ rejected

Current release: **0.6.1** (2026-11-27). What each release added and the dated log of every change:
[CHANGELOG](../CHANGELOG.md). Known bugs and unverified parts: [bugs.md](bugs.md).

This page keeps what is open and what is next; finished phases and milestones are one row each below; their
checklists are in git history (before 2026-11-27 this file held them in full) and in the changelog.

## Open

### Recreation quality and cost (from milestone 0.6)

- [ ] 🔄 `scene` analyze, soft-shaded areas come out as a patchwork (F38): soft band borders can be told from
  outlines, but the bands cross the petals; needs a crease-following segmentation
  ([scene-plan § 10](research/scene-plan.md#10-future-ideas-speed-and-quality-2026-11-27))
- [ ] 🔄 `scene` runs use more calls than the manual method on flat art (F23): 0.6.1 took edits the runs made by hand
  (F52, F25, F39, hints under 0.05 %); measure in the next suite run, and whether the 2026-11-27 changes (grainy ramp
  hints F29, short curved edges F32, curvature-matched joints) help on real jobs
- [ ] ⏳ Suite pairs on the release build: 09, 05 and 07 (manual + scene), 01 and 02 (scene listed)
  ([recreate-testing.md](recreate-testing.md))
- [ ] ⏳ Recreate suite: case 03 waits for a better reference; the owner adds a logo, an illustration, a poster and a
  label (cases live in the git-ignored `tmp/recreate-suite/`)
- [ ] ⏳ Fresh subagent on a second free-form image; target a few minutes in 3–4 rounds (estimate until measured;
  the ribbons job: ~12 min, 67 calls, 202 k tokens, [benchmarks § 2g](research/benchmarks.md))
- [ ] ⏳ Fresh-agent trial on a machine without Pillow (PDF pages in `preview {image}` verified live 2026-11-25)
- [ ] 🧊 Scene speed and quality ideas (analyze is ≤ 2.3 s of 5–11 min runs, so fewer calls first; region-step and
  fitting ideas, ramp hints, render-and-compare) — [scene-plan § 10](research/scene-plan.md#10-future-ideas-speed-and-quality-2026-11-27)

### Platforms and panel

- [ ] ⏳ Windows W1: what a modal dialog (e.g. from `menu_command`) does to the bridge — needs the owner at the VM
  ([windows-plan § 12](windows-plan.md), bug list V2)
- [ ] ⏳ Panel: a test on x64 Windows (V3), the hidden-panel check (V4, owner), a signed ZXP (needs Adobe's
  ZXPSignCmd and a certificate) — [panel plan](panel-plan.md)
- [ ] ⏳ `CHANDELIER_APP` on a machine with two Illustrator versions installed at once (checked against one install
  per platform)
- [ ] 🧊 macOS bridge: a pre-compiled AppleScript handler (~1 ms per call) — not needed while the MCP round trip is
  ~5 ms

### Constraints

- ❓ **Tool-list budget:** 59.96 of 60 KB (unit test, 2026-11-27). A new tool option needs a trimmed description
  elsewhere or an owner decision on the budget; `CHANDELIER_TOOLS=lean` stays the answer for clients that load every
  schema.

## Future 🧊

- [ ] 🧊 UXP plugin transport when Illustrator UXP opens to third parties (~Q2 2027 beta, ~Q4 2027 GA)
- [ ] 🧊 Recording: turn a session's tool calls into a reproducible `.jsx` build script
- [ ] 🧊 Graphs from data; editing symbol contents
- [ ] 🧊 Arm D in the benchmarks: Adobe's official MCP when it ships in the stable app
- [ ] 🧊 **Plan-then-run approval mode** — the agent sends a whole job as one plan, the designer approves it once, it
  runs as one undo step ([proposal](research/plan-then-run.md)). On hold (owner, 2026-11-27): built on branch
  `future/plan-then-run`, not merged; open before a merge: a Windows live run (C31), elicitation in real clients, a
  panel card review, scene build / data_merge in approval mode, fingerprint cost at 5 000 items, bug #27

## Done

| Phase / milestone | Finished | Exit result |
|-------------------|----------|-------------|
| Phase 0 — research and transport spike | 2026-11-22 | Persistent JXA bridge 0.7–5.8 ms per call vs 366 ms for ie3; plan, research, benchmark harness |
| Phase 1 — foundation | 2026-11-22 | MCP round trip p50 5.7 ms; 100 `batch` steps in one call (158 ms); `preview` images; Illustrator restart survived; uuids renumber on reopen, one call = one undo step ([verify-assumptions](../test/verify-assumptions.mjs)) |
| Phase 2 — create and edit | 2026-11-22 | Competitor parity for every core tool ([parity map](research/competitors.md#tool-parity-map)); 12-page calendar in 8 calls, 1.3 s, no `run_script` |
| Phase 3 — print and prepress | 2026-11-22 | PDF/X-4 with exact Trim/Bleed boxes (pdf-lib measured); preflight on a real price list without false spot or non-printing warnings; bleed really set on new documents (C18) |
| Phase 4 — agent efficiency | 2026-11-22 | Calendar macro C2: 2.0 min, 17 calls, 0.78 M tokens; server instructions, agent guide, short build loop, slim schemas |
| 🎯 MVP | 2026-11-22 | M2 (design from an image): C2 1.2 min / 11 calls / 0.42 M / 10 of 10, C1 1.5 min / 10 calls / 10 of 10; a client's desk-calendar page approved by the owner |
| Phase 5 — robustness | 2026-11-27 | MRAP retries, crash and hang detection with hints, `status.last_call`, safe restart, Node version guard, debug log, live suites with a document guard, ru_RU tests, the working document |
| 🎯 0.1 release | 2026-11-23 | v0.1.1: npm, Claude Code plugin (M2 through the plugin: 1.1 min, 10 calls, 10 of 10), Claude Desktop bundle |
| Phase 6 — distribution | 2026-11-27 | npm, plugin + marketplace, `.mcpb`, MCP Registry (0.4.1), brand, the owner's production workflow switched over, `CHANDELIER_APP` |
| Phase 7 — Windows ([plan](windows-plan.md)) | 2026-11-24 | 0.2.0: PowerShell/COM bridge, all live suites green on Windows 11 ARM64 + Illustrator 2027; M2 C2w-1 1.5 min, 11 calls, 10 of 10. Open: W1 modal dialog (above) |
| 🎯 0.2.1 — quick wins | 2026-11-24 | Safe restart, debug log, brand/contrast checks, export variants and screen assets, `symbols`, image trace, recipes |
| 🎯 0.3 — production automation | 2026-11-24 | `data_merge` ([D12](plan.md#d12--data-merge-template-copies-not-illustrator-variables--decided-03)), `batch {files}`, `swatches {recolor, import}`, tool profiles ([D13](plan.md#d13--tool-profiles-full-by-default-lean-on-request--decided-03)) |
| 🎯 0.4 — look and print depth | 2026-11-24 | `effects` ([D14](plan.md#d14--live-effects-through-liveeffect-xml--decided-04)), spread traps, output intents, colour conversion, `preview` `differences` |
| 🎯 0.5 — Chandelier panel ([plan](panel-plan.md)) | 2026-11-24 | Experimental CEP panel: chat, events, channel wake-up; live suite 23/23 through it, fresh agent 3/3. Open: x64 Windows, hidden panel, signing (above) |
| 🎯 0.5.2 — no extra installs | 2026-11-25 | `preview {image}` (no Python/PIL), the recreate method; 0.5.3 added `profile`, `create_path {fit, shade}` |
| 🎯 0.6 — faster free-form recreation | 2026-11-27 | `scene` tool ([D15](plan.md#d15--image--scene-node-side-pipeline-stacked-shapes-batch-build--decided-06-owner-2026-11-26), [scene-plan](research/scene-plan.md)), brief replies by default ([D16](plan.md#d16--smaller-replies-field-projection-brief-by-default--decided-2026-11-27)), fewer turns, the recreate guide split per kind of job; 0.6.1: better `analyze`, working document, reply image budget. Open items above |

## Rejected ❌

- ❌ **Forking the competitor** — its per-call design is the bottleneck; see [plan D8](plan.md#d8--fork-the-competitor-or-build-fresh--decided-build-fresh-borrow-knowledge)
- ❌ **Native C++ plugin** for v1 — too heavy for the gain; ExtendScript covers almost everything
- ❌ **GPU compute via gpu.js** (2026-11-27) — native `gl` dependency (fails on Node 23+), float32 kernels, slower than plain JS for simple per-pixel passes; the scene's analyze is ≤ 2.3 s of a 5–11 min run — [scene-plan § 10](research/scene-plan.md#10-future-ideas-speed-and-quality-2026-11-27)
- ❌ **Temp files for params/results** — inline JSON in the Apple event is faster and leaves nothing behind
- ❌ **TOON reply encoding** (2026-11-27) — can be larger than minified JSON on nested replies and needs a format note in every request; brief replies drop data instead ([plan D16](plan.md#d16--smaller-replies-field-projection-brief-by-default--decided-2026-11-27))
