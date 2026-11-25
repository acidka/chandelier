# Bug list

Last updated: 2026-11-25 (bugs #7–#12 fixed) · Legend: ⏳ open · 🔍 to verify (not seen failing, not tested either) · ✅ fixed ·
Severity: 🔴 breaks a job · 🟠 wrong result with a workaround · 🟡 annoyance / limitation

Chandelier's own bugs and gaps, to fix later. **Illustrator's** quirks (crashes on certain API calls, renumbered
uuids, MRAP…) are in [research/illustrator-quirks.md](research/illustrator-quirks.md); the tools already work around
them. When a bug is fixed: tick it here, move it to "Fixed", add a [roadmap](roadmap.md) change-log row.

## Open

None (2026-11-25). Illustrator-side issues seen on Windows are quirks C30, C31. New rows: `| # | Sev. | Found | Where | Bug | Workaround | Fix idea |`.

## To verify

| # | Found | Where | What isn't proven | How to check |
|---|-------|-------|-------------------|--------------|
| V2 | 2026-11-24 | Windows, modal dialogs (W1) | What a modal dialog (e.g. from `menu_command`) does to the bridge on Windows | Needs the owner at the VM ([roadmap W1](roadmap.md)) |
| V3 | 2026-11-24 | Panel on x64 Windows | Not tested (no x64 machine) | A test on an x64 Windows machine |
| V4 | 2026-11-24 | Panel hidden | Whether events and chat keep working while the panel is hidden | Owner check ([panel plan](panel-plan.md)) |

## Fixed

Recent fixes found during work (older ones are in the roadmap change log):

| Fixed | Bug | Where it is recorded |
|-------|-----|----------------------|
| 2026-11-25 | #5 Windows late-run crash: reproduced twice (access violations inside `Illustrator.exe` 31.0.0.84 after hundreds of calls in one session; the same steps on a fresh Illustrator pass 3/3) — Illustrator's own, so it moved to [quirk C30](research/illustrator-quirks.md) with its workaround; a related undo merge under load is C31 | `windows-plan.md` § 16 |
| 2026-11-25 | #7 `delete_items` with a ref that finds nothing (`layer:X` missing, `name:` matching nothing, a uuid already gone) failed; it now deletes nothing there and reports `not_found` with a warning, so a re-runnable batch can clear its layer on the first run. Other ref errors still fail | `test/live-release.mjs` (re-runnable batch, runs 1 and 2), unit `bugs-1125.test.ts` |
| 2026-11-25 | #8 `preview {reference}` `content_box` took "pixels darker than 150" as content, so a photo's whole box (and its side face) set a wrong shift/scale every round; content is now measured against each image's own background (median of its border), and boxes whose aspect differs by more than 15 % give a `note` instead of a shift/scale. On the box photo: v2's artboard shift −0.2 mm, scale [1, 1] | unit `bugs-1125.test.ts`; live check on the recreate job |
| 2026-11-25 | #9 one shared server per session: a subagent's `configure {artboard: 2}` moved everyone's frame silently. Positional tool results now say a pinned frame (`frame: artboard 2, mm (session configure, shared …)`); none in the default frame | unit `bugs-1125.test.ts` |
| 2026-11-25 | #10 `layers {add}` of an existing layer failed; it now applies the props and returns `existed: true` (like `swatches add`) | `test/live-release.mjs` |
| 2026-11-25 | #11 `preview {reference, save_to}` wrote the comparison to `save_to` and the render to `preview_saved_to`; `save_to` is now the render (as without a reference), the comparison goes to `<name>.compare.png` (`compare_saved_to`) | `test/live-layout.mjs` |
| 2026-11-25 | #12 "no clip groups from batch steps" was a docs gap: `arrange_items {action: "clip", refs, mask}` works in batches; recreate.md § 1 now says so | — |
| 2026-11-25 | #1 `gradient:Name@a` ignored the angle: Illustrator reads `GradientColor.angle` as 0 and a new gradient fill keeps the old rotation (in the gradient's matrix). Fills are now turned to the asked angle from the matrix (`A.setFill`); `get_items` reads the angle from the matrix; no angle = 0° | `test/live-release.mjs` (set, change, read back) |
| 2026-11-25 | #2 `preview {reference}` with `region` or `refs` compared against the whole reference; the runtime now reports the page, and the same part of the reference is cut (white outside the page) | `test/live-release.mjs` (region vs page: rmse 0.04), unit test `cropPad` |
| 2026-11-25 | #3 `preview {image}` zoomed only in whole steps; any factor up to 8× now | unit test |
| 2026-11-25 | #4 `status {restart}` could wait on the links dialog at quit; alerts are switched off before the quit. Checked on macOS (Illustrator 29.1) with a saved document whose linked image was deleted: restart in 13.7 s, both documents reopened; Windows not re-run | manual live check 2026-11-25 |
| 2026-11-25 | #6 tool list at 55.5 of 56 KB: 6 descriptions tightened (preview, run_script, swatches, export, batch, preflight) → 54.1 KB | `node scripts/schema-size.mjs`, budget test |
| 2026-11-25 | V1 `preview {image}` of PDF pages verified live: renders through Illustrator, the PDF is closed, the previous document is active again; a `sample` outside the shown region now says `outside` instead of the edge colour | `test/live-release.mjs` |
| 2026-11-24 | A tinted swatch colour (`swatch:Navy@50`) set the tint on the swatch itself, so later uses came out at 50 % | [roadmap 0.2.1](roadmap.md) |
| 2026-11-24 | Panel: a designer's message sent before the agent's first `events` call was lost | [panel plan](panel-plan.md) |
| 2026-11-24 | A batch `@n` saw only the first 100 items of a long step result | [roadmap 0.5](roadmap.md) |
