# Illustrator quirks and how we handle them

Sources: the maintainer's issue log from production work (A1–A10, B1–B12, 2026-11-10…21),
the owner's agent guide (`illustrator-for-ai-agents.md`), and our own spike (C1–C3, 2026-11-22).
Environment: Illustrator 29.1.0 (build 142), **ru_RU UI**, macOS 27.2.

Each row is a **design requirement**. Status: ✅ handled in code · 🔄 spike/partial · ⏳ planned (phase).

## Illustrator scripting engine

| # | Quirk | Our rule | Status |
|---|-------|----------|--------|
| B1 | Reading `ParagraphStyle.characterAttributes.*` **crashes Illustrator** (SIGSEGV) | Runtime never reads style attributes. `styles` stores our own spec of each style we create (document XMP, namespace `http://ns.chandelier/1.0/`) and returns that | ✅ |
| B2 | `PDFSaveOptions.bleedOffsetRect` ignored from scripts | PDF bleed = enlarge artboards → export (`exportForScreens` + preset) → restore → normalise Trim/Bleed boxes with `pdf-lib` | ✅ |
| B3 | Random `MRAP` (1346458189) in long sessions, esp. swatches and text styling | Retry inside the runtime (swatches, styles, text styling, read-only commands; up to 3 tries); `status.mrap {retried, failed}`; restart routine in the agent guide | ✅ |
| B4/A6 | Document bleed write-only (via `DocumentPreset`) | `documents new` stores the bleed in document XMP; for other documents it is read from the saved .ai file's private data (`%_<v> /Real (BleedLeftValue)`…, zstd since AI24) — exact when there are no unsaved changes | ✅ |
| B5 | Swatch names localised (`[Совмещение]` = Registration) | Match special swatches by colour type, never by name; `clean_defaults` by type | ✅ |
| B6 | Non-ASCII in regex literals doesn't match | Runtime regexes ASCII-only; name filters use a hand-written glob (`AIA.glob`), not regex | ✅ |
| B7 | Artboard edits act on the **active** document | Runtime calls `doc.activate()` before artboard work on a non-active doc | ⏳ P2 |
| B8 | `textFrame.anchor` read-only | Create point text with `textFrames.pointText([x, y])`; move with `translate` | ✅ |
| B9 | Unbracketed chained ternary evaluates wrongly | ES3 lint rule: nested `?:` must be bracketed | ✅ |
| B10 | PDF names variable-font instances after the default instance | `export` warns when variable fonts (`TextFont.axisVector` non-empty) are used | ✅ |
| B11 | Setting `artboardRect` + `rulerOrigin` right after creating a doc → art off the artboard | `documents new` uses `addDocument(preset)` and never touches `rulerOrigin` | ✅ |
| B12 | Large scripts: AppleEvent timeout (-1712) after ~2 min while Illustrator keeps working | Bridge uses `with timeout of N seconds` (default 300, per-call override); timeout errors say "may still be running, check before retrying"; a bridge silent past timeout + 10 s is killed and respawned | ✅ |
| — | Point-text `y` is the **baseline** | Documented in `create_text`; `y_ref:"top"` places by the frame top; responses give the box | ✅ |
| — | `app.userInteractionLevel` dialogs block automation | Set `DONTDISPLAYALERTS` around every call (`AIA.dispatch`) | ✅ |

## Competitor MCP bugs (avoid by design)

| # | Bug in ie3 server | Our rule | Status |
|---|-------------------|----------|--------|
| A1/A5 | PDF bleed not applied; fixed 3 mm | See B2; `bleed` = document, number or per side, in session units | ✅ |
| A2 | Global *process* swatches reported as spot; Registration reported; index 0 skipped | Loop over all; report only `ColorModel.SPOT` | ✅ |
| A3/A4 | Preflight checks non-printing layers; live-text noise | Skip hidden/non-printing (count them); `ignore` categories; live text = one info line | ✅ |
| A7 | Artboard `rect.y` means bottom on write, top on read | One convention for rects everywhere: `[x, y, w, h]` with `y` = top, read and write; artboard rects in an artboard-0 frame | ✅ |
| A8 | Text frame created, styling fails → error + orphan frame | Create-and-style is atomic: on error the frame is removed; multi-item calls are all-or-nothing; batch `rollback` | ✅ |
| A9 | One tool answers in a different coordinate system | Coordinates converted in one runtime function used by every command (`AIA.P` / `fromDoc` / `rectOut` / `rectIn`) | ✅ |
| A10 | Save/export hang when Illustrator is in the background | Bridge `activate` before save/export (configurable) | ✅ save (export in P3) |

## Bridge findings (our spike, 2026-11-22)

| # | Finding | Rule | Status |
|---|---------|------|--------|
| C1 | Reading NSAppleScript's error dictionary through a JXA `Ref()` **segfaults** `osascript` (exit 139) → bridge died, caller waited forever | Catch errors inside the AppleScript (`try … on error`) and return a marked string; Node rejects pending calls when the bridge exits | ✅ |
| C2 | `NSRunningApplication` list in JXA goes stale without a run loop → false "not running" | Check with `application id … is running` inside the AppleScript (never launches the app) | ✅ |
| C3 | Thrown JSX errors come back as AppleScript error 5001 with a **localised** message; Cyrillic arrives as `???` | The runtime catches every error itself (scripts are compiled with `eval` inside a `try`, so syntax errors too) and returns a JSON envelope, so we never depend on AppleScript's error text. Illustrator's own messages stay localised (e.g. Russian) but arrive intact | ✅ |
| C4 | `$.global` persists between `do javascript` calls in the same Illustrator session | Load the runtime once; hash check every call | ✅ verified |
| C5 | `pageItem.uuid` available on 29.1 | Use as the object ID | ✅ verified (stability across reopen ⏳ 1.6) |
| C6 | `exportFile(…, ExportType.SVG, …)` **rebinds the document** to the SVG file (name and `fullName` change, seen 2026-11-22 on 29.1); a PNG export doesn't, but marks the document unsaved | `documents save` to `.svg` says so and returns the new name; `preview` restores the saved flag | ✅ |
| C7 | `doc.imageCapture` rejects resolutions below 72 ppi ("Specified value less than minimum allowed value") | Previews needing < 72 ppi: artboards via `exportFile` scale, items/regions captured at 72 and downscaled with `sips` | ✅ |
| C8 | Indexing `doc.pageItems[i]` (also `doc.pathItems`, `textFrames`) is slow on big documents: ~0.35 ms per access at 5 000 items. `layer.pageItems` / `group.pageItems` hold only **direct** children and are fast | All scans use a recursive layer → group walk (`AIA.walk`): 190× faster | ✅ |
| C9 | `pageItem.uuid` is **renumbered** when a document is reopened; `getPageItemFromUuid` with a stale uuid raises MRAP | Refs are per open session; the error says the item may be gone; use `name:` across reopen | ✅ |
| C10 | One `do javascript` = one undo step (whole batch included). `app.undo()` inside a call doesn't undo that call's own changes, and right after it `doc.pageItems.length` can miss items created later in the same call | `history undo` (P2) counts tool calls; don't mix undo with creation in one script | ✅ documented |
| C11 | Compiling an AppleScript with a literal `tell application id "com.adobe.illustrator"` **launches Illustrator** — even if that tell sits in an `if … is running` branch that never runs, and even with raw event codes | The bridge puts the app id in a variable (`application id aiaId`) and sends `«event miscDjxM»` (do javascript); nothing is resolved at compile time. Also made calls ~2 ms faster | ✅ |
| C12 | `textFrame.textRanges` holds **one range per character**, not one per style run; `TextRange.length` is writable and `characterOffset` is 1-based | Runs are merged from neighbouring characters (first 500); ranges are `characters[start]` + `length` | ✅ |
| C13 | Every ExtendScript object has built-in members `reflect` (reflection info), `watch`, `unwatch`, `toSource`: `if (opts.reflect)` is **always true** for a plain JSON object (made every rotation mirror the item) | The server renames the `reflect` option to `flip` before it reaches the runtime; ES3 lint flags `.reflect/.watch/.unwatch/.toSource` | ✅ |
| C14 | A clipping group's `visibleBounds`/`geometricBounds` cover the **whole unclipped content**, not the mask | Every bounds read goes through `AIA.vb`/`AIA.gb`, which use the clipping path for clipped groups (box, align, transform, find within) | ✅ |
| C15 | Pathfinder has no DOM API. `executeMenuCommand('Live Pathfinder Add')` etc. **does nothing on loose paths**: it only works on a selected group, then `'expandStyle'` bakes it. `'OffsetPath v22'` is Outline Stroke ("Outline Stroke" raises MRAP). Offset Path = live effect `Adobe Offset Path` (`jntp` 0 round, 1 bevel, 2 miter) + `expandStyle`. Works with Illustrator in the background | `path_ops` groups the inputs, runs the command on the selection, unwraps single results | ✅ |
| C16 | `artboards.add()` makes the new artboard **active**, which would shift every "active artboard"-relative coordinate | `artboards add` restores the active artboard; artboard rects are reported in an artboard-0 frame | ✅ |
| C17 | A **hidden** layer can't be moved (error says "Cannot modify a layer that is locked"); a locked layer can't be renamed | `layers update/reorder` unlocks and shows the layer while changing it, then restores both | ✅ |
| C18 | `DocumentPreset` bleed is `documentBleedOffset` = [left, top, right, bottom]. Setting a misspelt property (`documentBleedOffsetRect`, as in our code and the owner's earlier build scripts) **silently succeeds and does nothing** — ExtendScript adds ad-hoc properties to DOM objects. Verified by reading the saved files: all such documents have bleed 0 | Fixed in `documents new`; verify property names with `obj.reflect.properties` when in doubt | ✅ (owner's scripts: ❓ owner) |
| C19 | `doc.exportForScreens(folder, SE_PDF, ExportForScreensPDFOptions{pdfPreset}, …)` exports real PDF/X-4 (preset honoured), **does not rebind** the document, and the X-4 preset adds the **document bleed** (TrimBox = artboard). It writes nothing if the target folder doesn't exist. JPEG exists only as `SE_JPEG80` | `export` uses it for every format, creates folders, normalises boxes from the TrimBox | ✅ |
| C20 | In a CMYK document Illustrator **converts** RGB colours assigned to fills/strokes and RGB images on **embed**; only **linked** RGB images stay RGB, and the DOM can't tell their colour mode | `preflight` reads linked images' headers in Node (PNG IHDR, JPEG SOF, PSD mode) | ✅ |
| C21 | Create tools with `layer:"X"` used `AIA.layer`, which **activates** X: every later item without a layer silently went to X (in the test, onto a non-printing layer) | Tools use `AIA.layerGet` (create/find without activating); `AIA.layer` keeps activating for scripts | ✅ |
| C22 | `doc.imageCapture` draws **non-printing layers** (it renders the screen view), while `exportFile(PNG24)` and the PDF presets leave them out, and `exportForScreens` PNG/JPG include them: a preview showed a grey photo placeholder or not depending on its size (seen in calendar run C2-1, 2026-11-22) | `preview` and raster `export` hide visible non-printing layers while rendering and show them again (`AIA.hideNonPrinting`); renders show what prints | ✅ |
| C23 | `DocumentPreset.artboardSpacing` is the gap between the **bleed** edges: with a 3 mm bleed, 20 mm spacing gave a 26 mm gap between artboards (all 6 calendar runs, 2026-11-22) | `documents new {spacing}` is the gap between trim edges: both bleeds are subtracted before Illustrator gets it (`test/live-layout.mjs`) | ✅ |
| C24 | Writing `paragraphAttributes` (spaceBefore, justification, indents…) of a `ParagraphStyle` that is **not held in a variable** fails with "a problem was found for some parameter for the text operation": `doc.paragraphStyles.getByName(n).paragraphAttributes.spaceBefore = 5` and `var pa = getByName(n).paragraphAttributes; pa.spaceBefore = 5` fail, `var st = getByName(n); st.paragraphAttributes.spaceBefore = 5` works (Illustrator 29.1, 2026-11-22, found on a real job; the first attempt of that build crashed Illustrator, cause not confirmed) | Runtime always keeps the style in a variable (`styles`, `AIA.pstyle`); noted in the agent guide for hand-written scripts | ✅ |
