# Bug list

Last updated: 2026-11-25 · Legend: ⏳ open · 🔍 to verify (not seen failing, not tested either) · ✅ fixed ·
Severity: 🔴 breaks a job · 🟠 wrong result with a workaround · 🟡 annoyance / limitation

Chandelier's own bugs and gaps, to fix later. **Illustrator's** quirks (crashes on certain API calls, renumbered
uuids, MRAP…) are in [research/illustrator-quirks.md](research/illustrator-quirks.md); the tools already work around
them. When a bug is fixed: tick it here, move it to "Fixed", add a [roadmap](roadmap.md) change-log row.

## Open

| # | Sev. | Found | Where | Bug | Workaround | Fix idea |
|---|------|-------|-------|-----|------------|----------|
| 1 | 🟠 | 2026-11-25, real job, macOS, Illustrator 29.1 | `modify_items` / colour parser | `fill: "gradient:Name@-90"` (or `@90`) on an item **ignores the angle**: the gradient comes out at its previous angle (0° on a fresh fill); re-assigning the same gradient keeps the old angle | `run_script`: `item.rotate(angle, false, false, true, false)` rotates only the gradient | Set the angle after assigning the fill (rotate the gradient matrix to the asked angle, from the current one); unit + live test |
| 2 | 🟠 | 2026-11-25, recreate training | `preview {reference, region}` | With `region`, the preview renders only that region but the **whole** reference (after `reference_crop`) is resized onto it, so the comparison doesn't line up; agents can only compare whole pages (~600 px), which hides small errors | Compare whole pages; look at close-ups with `preview {region}` and `preview {image, region}` separately | Map the region into the reference with the page mapping from `reference_crop` and cut the same part (planned in the recreate iteration loop) |
| 3 | 🟡 | 2026-11-25 | `preview {image}` (`src/imageview.ts`) | Zoom only in whole steps: a region that would need 1–2× (e.g. 560 px shown with `max_px: 1400`) is shown at 1× | Ask for a smaller region | Allow fractional zoom (nearest neighbour or bilinear) up to 8× |
| 4 | 🟠 | 2026-11-24, Windows VM, Illustrator 2027 | `status {restart}` | The quit request can bring up "Some files are missing or modified in the Links panel…" (a session that had a missing link), and Illustrator waits; the restart fails after 60 s with "did not quit within 60 s (a dialog may be open)" | The user answers the dialog and retries | Quit with alerts off (`userInteractionLevel = DONTDISPLAYALERTS` before quit); check macOS too ([windows-plan § 15](windows-plan.md)) |
| 5 | 🟡 | 2026-11-24, Windows VM, Illustrator 2027 ARM64 | Illustrator under long live runs | Illustrator crashed twice at a new/opened document **late in full live runs**; a 4× save-close-open loop alone doesn't reproduce it. May be Illustrator's own | Run the live suites by parts (`ONLY=…`); the runtime reloads after a crash | Reproduce with a long mixed run, find the call; report to Adobe if it is theirs |
| 6 | 🟡 | 2026-11-25 | `test/mcp-call.mjs`, tool-list budget | The tool list is at 55.5 of 56 KB: the next option or tool will break the budget test | — | Trim descriptions (preview is the longest growth) or raise the budget with a measured reason |

## To verify

| # | Found | Where | What isn't proven | How to check |
|---|-------|-------|-------------------|--------------|
| V1 | 2026-11-25 | `preview {image}` on .pdf/.ai/.eps/.svg (`render_file`) | Written and type-checked, never run live: opening with alerts off, the page/artboard choice, closing unsaved, re-activating the previous document, an already-open file left open | `preview {image: "box_cut.pdf", grid: true}` and a multi-page PDF with `page: 2`, with and without other documents open; add to `test/live-release.mjs` |
| V2 | 2026-11-24 | Windows, modal dialogs (W1) | What a modal dialog (e.g. from `menu_command`) does to the bridge on Windows | Needs the owner at the VM ([roadmap W1](roadmap.md)) |
| V3 | 2026-11-24 | Panel on x64 Windows | Not tested (no x64 machine) | A test on an x64 Windows machine |
| V4 | 2026-11-24 | Panel hidden | Whether events and chat keep working while the panel is hidden | Owner check ([panel plan](panel-plan.md)) |

## Fixed

Recent fixes found during work (older ones are in the roadmap change log):

| Fixed | Bug | Where it is recorded |
|-------|-----|----------------------|
| 2026-11-24 | A tinted swatch colour (`swatch:Navy@50`) set the tint on the swatch itself, so later uses came out at 50 % | [roadmap 0.2.1](roadmap.md) |
| 2026-11-24 | Panel: a designer's message sent before the agent's first `events` call was lost | [panel plan](panel-plan.md) |
| 2026-11-24 | A batch `@n` saw only the first 100 items of a long step result | [roadmap 0.5](roadmap.md) |
