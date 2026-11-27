# Bug list

Last updated: 2026-11-27 (bugs #1–#26 fixed or closed; #28–#30 open) · Legend: ⏳ open · 🔍 to verify (not seen failing, not tested either) · ✅ fixed ·
Severity: 🔴 breaks a job · 🟠 wrong result with a workaround · 🟡 annoyance / limitation

Chandelier's own bugs and gaps, to fix later. **Illustrator's** quirks (crashes on certain API calls, renumbered
uuids, MRAP…) are in [research/illustrator-quirks.md](research/illustrator-quirks.md); the tools already work around
them. When a bug is fixed: tick it here, move it to "Fixed", add a [roadmap](roadmap.md) change-log row.

## Open

Illustrator-side issues seen on Windows are quirks C30, C31. (#27 is on branch `future/plan-then-run`.)

| # | Sev. | Found | Where | Bug | Workaround | Fix idea |
|---|---|---|---|---|---|---|
| 28 | 🔴 | 2026-11-27, suite 08 v4 | `preview` with several `region`s, large `max_px` and a `reference` | One reply carried > 16 MB of images; Claude Code disconnects a server that writes 16 MB without a message boundary ("wrote >16MB to stdout…"), so the server dropped mid-run: scenes in its temp folder gone, session units back to pt | Fewer regions or a smaller `max_px` per call | Cap a reply's image bytes (shrink every image of the call to fit ~4 MB in total; say so in the reply) |
| 29 | 🟠 | 2026-11-27, suite 06 v4 (branch `feature/scene-analyze`) | `scene analyze`, own-colour inks (F52) | `colors: 2` came back with 11 inks: the own-colour pass adds inks past the `colors` cap | `cN = c0` merges in the edit | Add own inks only while the scene has fewer than `colors` inks |
| 30 | 🟡 | 2026-11-27, suite 06 v4 (branch `feature/scene-analyze`) | `scene` part crop with margin (F25) | Frame lines crossing the crop were kept whole into the margin; dropped, their area was repainted with the background ink outside the build rect (hidden only because the background was the same navy) | `drop … fill none` | A dropped region's pieces outside the crop are left empty, not filled |

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
| 2026-11-27 | #16 (suite 08) `path_ops` box in a batch step with `artboard` "in the artboard-0 frame": not reproduced — the box comes back in the step's frame (checked live with a pinned `configure {artboard: 0}` as in the run); the misleading frame note (#22) is the likely cause | `test/live-bugs-1127.mjs` |
| 2026-11-27 | #17 (suite 04) `preflight` listed every transparent item: transparency is now one line per layer + blend + opacity with a `count` (30 shade items → 1 line) | `test/live-bugs-1127.mjs` |
| 2026-11-27 | #18 (suite 06) `layers {add/reorder, position: "below:<locked layer>"}` failed: the neighbour is unlocked (and shown) for the move, then restored | `test/live-bugs-1127.mjs` |
| 2026-11-27 | #19 (suite 06) `preview {reference}` `differences` named items the render doesn't show: `items_at` skips items in hidden groups and on hidden or non-printing layers too | unit `bugs-1127.test.ts` + live |
| 2026-11-27 | #20 (suite 06) `grid` and `sample` now work on an artboard / region / items render (labels in the reply's frame); still refused together with `reference` or `more` | `test/live-bugs-1127.mjs` |
| 2026-11-27 | #21 (suite 09) `swatches update` with only `stops` made a radial gradient linear: the type changes only when given; `type` alone keeps the stops | `test/live-bugs-1127.mjs` |
| 2026-11-27 | #22 (case 01) the frame note said "artboard 0" on batch steps with their own `artboard`: it now names them (`frame (mm): steps 0-2: artboard 3; other steps: artboard 0 (session configure…)`), and `preview {artboard}` says that artboard | unit `bugs-1127.test.ts` + live |
| 2026-11-27 | #23 (cases 01, 09) mixed frames: `preview {artboard}` now replies `rect`, `content_box` and `differences` from that artboard's top-left (before: only with `region`). `transform_items` / `modify_items` / `get_items` already reply in the frame of their call — a batch step with `artboard` gives that artboard's frame — and the note (#22) now says which | `test/live-bugs-1127.mjs` |
| 2026-11-27 | #24 (case 01) `document_info` issues were counts only: `issueItems` lists up to 3 items per issue (uuid, name, text start); `create_text {grid}` takes a name pattern (`name: "Day {row}-{col}"`, `{n}`) so calendar cells are named | unit + live |
| 2026-11-27 | #25 (case 01) `documents save` replies `saved` (the document's saved flag) | `test/live-bugs-1127.mjs` |
| 2026-11-27 | #26 (case 09) `preflight {artboard}` / `{refs}` checks only those items; `preview {artboard, preflight: true}` (without `more`) checks only that artboard | `test/live-bugs-1127.mjs` |
| 2026-11-25 | #13 (found in recreate suite 02) creating on a named layer failed with "Target layer cannot be modified" whenever the **active** layer was locked or hidden (Illustrator, [quirk C32](research/illustrator-quirks.md)); every create tool hit it, not only `create_path`. The target's layer now becomes active when the active one is unusable | `test/live-release.mjs` (locked active layer: shape, path, text on new layers) |
| 2026-11-25 | #14 (suite 02) `gradient:` on text rendered black with no error ([quirk C33](research/illustrator-quirks.md): no scripted route renders it). `create_text`, `edit_text` and `styles` now refuse it with a hint (solid colour, or `path_ops outline_text` and fill the outlines); `modify_items` on groups skips the text with a warning | `test/live-release.mjs` |
| 2026-11-25 | #15 (suites 01–03) `preview {image, region, sample}`: points outside the region came back `outside`; samples now read the whole image (rendered PDF/AI pages: still only the region) | unit `image.test.ts` |
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
