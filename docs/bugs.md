# Bug list

Last updated: 2026-11-25 (subagent test) · Legend: ⏳ open · 🔍 to verify (not seen failing, not tested either) · ✅ fixed ·
Severity: 🔴 breaks a job · 🟠 wrong result with a workaround · 🟡 annoyance / limitation

Chandelier's own bugs and gaps, to fix later. **Illustrator's** quirks (crashes on certain API calls, renumbered
uuids, MRAP…) are in [research/illustrator-quirks.md](research/illustrator-quirks.md); the tools already work around
them. When a bug is fixed: tick it here, move it to "Fixed", add a [roadmap](roadmap.md) change-log row.

## Open

| # | Sev. | Found | Where | Bug | Workaround | Fix idea |
|---|------|-------|-------|-----|------------|----------|
| 5 | 🟡 | 2026-11-24, Windows VM, Illustrator 2027 ARM64 | Illustrator under long live runs | Illustrator crashed twice at a new/opened document **late in full live runs**; a 4× save-close-open loop alone doesn't reproduce it. May be Illustrator's own | Run the live suites by parts (`ONLY=…`); the runtime reloads after a crash | Reproduce with a long mixed run, find the call; report to Adobe if it is theirs. Not fixed 2026-11-25: needs a long run in the VM to reproduce first |
| 7 | 🟡 | 2026-11-25, subagent recreate test | `delete_items {refs: "layer:X"}` | Fails with "No layer named …" when the layer doesn't exist, so a re-runnable batch that starts by clearing its layer breaks on the first run | `stop_on_error: false`, or `run_script` with `AIA.fresh(name)` | A missing layer (or a name pattern matching nothing) deletes nothing: `{deleted: 0}` plus a warning, not an error; unit test |
| 8 | 🟡 | 2026-11-25, subagent recreate test | `preview {reference}` `content_box` | Content is "pixels darker than 150" in both images; in a photo with a background or margin (a box on a table) that finds the whole photo box, while the render's content is the artwork — the reported scale/shift (e.g. [0.96, 0.6], shift 36 mm) stays wrong every round and misleads | Ignore `content_box` for photos; compare tone profiles and close-ups ([recreate.md § 6](../plugin/skills/illustrator/recreate.md)) | Find content against each image's own background (median of the border, as `preview {image}` does), and report `content_box: null` with a note when the two disagree wildly in aspect; unit test with a photo-like fixture |

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
| 2026-11-25 | #1 `gradient:Name@a` ignored the angle: Illustrator reads `GradientColor.angle` as 0 and a new gradient fill keeps the old rotation (in the gradient's matrix). Fills are now turned to the asked angle from the matrix (`A.setFill`); `get_items` reads the angle from the matrix; no angle = 0° | `test/live-release.mjs` (set, change, read back) |
| 2026-11-25 | #2 `preview {reference}` with `region` or `refs` compared against the whole reference; the runtime now reports the page, and the same part of the reference is cut (white outside the page) | `test/live-release.mjs` (region vs page: rmse 0.04), unit test `cropPad` |
| 2026-11-25 | #3 `preview {image}` zoomed only in whole steps; any factor up to 8× now | unit test |
| 2026-11-25 | #4 `status {restart}` could wait on the links dialog at quit; alerts are switched off before the quit. Checked on macOS (Illustrator 29.1) with a saved document whose linked image was deleted: restart in 13.7 s, both documents reopened; Windows not re-run | manual live check 2026-11-25 |
| 2026-11-25 | #6 tool list at 55.5 of 56 KB: 6 descriptions tightened (preview, run_script, swatches, export, batch, preflight) → 54.1 KB | `node scripts/schema-size.mjs`, budget test |
| 2026-11-25 | V1 `preview {image}` of PDF pages verified live: renders through Illustrator, the PDF is closed, the previous document is active again; a `sample` outside the shown region now says `outside` instead of the edge colour | `test/live-release.mjs` |
| 2026-11-24 | A tinted swatch colour (`swatch:Navy@50`) set the tint on the swatch itself, so later uses came out at 50 % | [roadmap 0.2.1](roadmap.md) |
| 2026-11-24 | Panel: a designer's message sent before the agent's first `events` call was lost | [panel plan](panel-plan.md) |
| 2026-11-24 | A batch `@n` saw only the first 100 items of a long step result | [roadmap 0.5](roadmap.md) |
