# Working with Illustrator through Chandelier: a guide for AI agents

For any agent (Claude Code, Cursor, Codex…) that creates, changes, checks or exports Illustrator files with the
`chandelier` MCP server. Adapted from the maintainer's earlier field guide, which was
written for ExtendScript files and the ie3 MCP; most of its workarounds are now built into the tools.

The server's own instructions (sent once per session) carry the conventions; this guide explains the choices.

## 1. How Chandelier works

One persistent connection to Illustrator (~5 ms per call). Three ways to make things, all through MCP:

| Way | Use it for | Cost |
|-----|-----------|------|
| **Typed tools** (`create_text`, `modify_items`, `swatches`, …) | Anything; validated arguments, clear errors | One call each |
| **`batch`** of typed-tool steps | Building a whole page or document | **One call** for up to 1 000 steps; `@n` refers to step n |
| **`run_script`** (ExtendScript + `AIA.*` helpers) | Logic that is easier in code (loops, data, dates), rebuilds with other values | One call; a `.jsx` file can be re-run with `args` |

Measured on benchmark M2 (rebuild a one-page calendar from an image, MVP build, 2026-11-22): typed tools + batch
only: 1.5 min, 10 calls; all tools: 1.2 min, 11 calls; both 10/10. The old advice "build with a script, check with
the MCP" is no longer needed: a batch or one `run_script` builds, and the same server checks.

**Load only the tools a job needs.** Every tool you load is re-read on every request (the whole list is
~14 k tokens). A typical build needs `documents`, `batch` (or `run_script`) and `preview`: `preview {preflight: true}` checks
and `documents save {export, close: true}` exports, so `preflight` and `export` need not be loaded.

## 2. Before you start

1. No `status` call is needed: any tool says when Illustrator is not running. `status` shows the version, open
   documents (yours are marked `created_here`) and the session settings.
2. Font names match fuzzily; when unsure, `fonts {query}` or `fonts {resolve: "Montserrat SemiBold"}` shows what a
   name becomes.
3. `documents new {units: "mm"}` also sets the session units (no separate `configure`).
4. Decide where files go (product files vs scratch); never save over files you weren't asked to change.

## 3. Building a document

1. `documents new` — size, `units`, `bleed` (really set, and recorded so it can be read back), `artboards`
   (+ `columns`, `artboard_names`), `title`.
2. **One batch of design tokens**: `swatches add` one **global** swatch per colour role, `styles create` one
   **paragraph style per text role** (title, header, body, weekend…). Files must be restylable: a designer changes
   one swatch or style, not 300 objects.
3. **One batch of content**: `create_text` / `create_shape` / `create_path` with `items:[…]` (shared props at the
   top level) or `create_text {grid}` for tables and calendars (`col_props` colours weekend columns).
   Give every text its `paragraph_style`. Build one artboard, then `duplicate_items {to_artboards: "all"}` for
   what repeats. For content that differs per artboard, give each batch step `artboard: k`: its coordinates then
   start at artboard k's top-left (no offsets to add).
4. Or a **builder script**: `run_script {file: "build.jsx", args: [2027], retries: 2}`. Start it with
   `var L = AIA.fresh("Calendar")` so a re-run replaces the content instead of adding a copy; draw page k inside
   `AIA.at(k, function () { … })`.
5. Name layers and groups (`layer` on create calls, `arrange_items group {name}`).

Coordinates everywhere: `[x, y, w, h]` from the top-left of the active artboard, y down, in session units
(`configure {units: "mm"}`). Point text: `y` is the **baseline** (or `y_ref: "top"`). Artboard rects use artboard 0's
top-left as their frame.

## 4. Recreating a design from an image

1. Read the image; note the page's pixel box (exclude any background around a photographed page).
2. Page format from the aspect ratio: 1.414 A-series (landscape if wider), 1.294 US Letter, 1.25 8×10 in, 1.0 square.
3. List the parts and roles. **Copy the structure, not the artwork**: no photos, logos, brand names or their text;
   leave a named placeholder. Fix obvious mistakes in the reference and say so.
4. Measure in pixels; convert with one factor `S = page width in pt ÷ page width in px`. Font size ≈ cap height
   in px ÷ 0.7 × S. Generate coordinates in a script (or `create_text {grid}`), never by hand.
5. Build (section 3), then **compare**: `preview {reference: "<image>", reference_crop: [x, y, w, h]}` returns
   one image [reference | yours | difference], `content_box.shift/scale` (everything offset or too big?) and the
   3 most different regions. Fix (`modify_items`, `edit_text`, `styles update` — a style change moves every
   text using it), compare once more. One or two rounds are normal.
6. **Proofread the text against the reference** word by word: on a client's job the words are theirs, and a typo
   (or a "correction" of their wording) is the worst error a rebuild can have.
7. If the reference font isn't installed, pick the closest installed one (`fonts`) and match **widths**, not only
   heights: set the style's `hscale` until the lines break where the reference breaks; body text goes in area text so
   it re-flows.

The `recreate_design` MCP prompt walks through these steps.

## 5. Checking (always)

- `document_info` — artboards, bleed, swatches, styles, fonts (frames per font), `issues` (RGB, empty or
  unstyled text, overset, empty groups).
- `preflight` — must show **0 errors**. In RGB documents it also warns about text below WCAG AA contrast
  (`low_contrast`) against the shape under it. Hidden and non-printing content is skipped; only real spot inks are
  listed; live text is one info line. `ignore` drops categories you accept. `contrast: true` runs the contrast check
  in CMYK documents too. For brand work give `tokens {colors: ["swatch:Navy", "cmyk(…)"], fonts: ["Arial"], sizes: [9, 12, 28]}`:
  every item with another colour, font or size comes back under `off_token` (tints of an allowed swatch pass).
- `preview` shows what prints: non-printing layers (e.g. a photo placeholder) are hidden while it renders.
- `preview` the hardest artboards (most rows, longest title, the last one), not only the first.
- **One check call:** `preview {artboard: 0, reference, more: [7, 11], preflight: true, info: true}` returns the
  comparison, small renders of the other artboards, the preflight result and `document_info`.

## 6. Print export

**One finish call:** `documents save {path: "x.ai", export: [{format: "png", path: "x.png", artboards: [0]},
{format: "pdf", path: "x.pdf", artboards: "all"}], close: true}` saves, runs each export (same args as `export`)
and closes; if an export fails the document stays open and the result says what was done.

`export {format: "pdf", artboards: "all", path}` makes a PDF/X-4 with the document's bleed (or `bleed: 3` in
session units) and returns the measured trim and bleed boxes of every page. It never rebinds the document to the
PDF. PNG/JPG/SVG/WebP the same way. Crop marks: `artboards {action: "crop_marks"}`. The `print_export` prompt
does preflight + export.
- **Variants:** `export {format: "pdf", path, variants: [{name: "print", hide: ["Dieline"]}, {name: "dieline", show: ["Dieline"], hide: ["Art"]}]}`
  writes one file per layer set and restores the layers.
- **Screen assets:** `export {format: "png", refs: "layer:Icons", each: true, scales: [1, 2, 3], path: <folder>}` → `name.png`,
  `name@2x.png`, `name@3x.png` per item (name the items first).

## 7. When something goes wrong

| What you see | What to do |
|---|---|
| `MRAP` (1346458189) | Transient Illustrator error. Swatches, styles, text styling and reads already retry inside Illustrator (`status` shows `mrap`); if one still reaches you, retry once (`run_script {retries}` does it). If it repeats, save your documents and call `status {restart: true}`: it quits and relaunches Illustrator and reopens them (refused while one is unsaved); the runtime reloads by itself |
| "Timed out …" | The error says whether Illustrator answers again (the call probably finished) or not (a dialog may be open, or it is still busy). Call `status`: `last_call` shows whether call #n finished and the uuids it created. Never repeat non-idempotent work before that |
| "not running" | `status {launch: true}` |
| `preview {region}` comes back blank | Without `artboard`, `region` is measured from the active artboard, which a script that adds or activates artboards changes: give `preview {artboard: k, region}` |
| "Closed …: the failed call created it" | A failed call (or a `batch` with `rollback`) closed the empty document it had made: start again with `documents new` |
| A batch step failed | Earlier steps stayed (unless `rollback: true`); read `failed_step` and resend from there — `swatches add` and `styles create` are safe to repeat |
| "No layer named Layer 1" in a non-English UI | Use `@first` / `@active`; "Layer 1" also finds the localised default layer |
| A script error | The message has the line in **your** code, or says it came from an `AIA` helper |
| `preflight` RGB on a linked image | Convert the image to CMYK, or embed it (Illustrator converts on embed) |
| Windows: "Path too long for Illustrator" | Illustrator can't save or open a path of 260+ characters (it would open a dialog and wait): save to a shorter folder. Exports to long paths work |
| Windows: calls hang after the user clicks into Illustrator | A dialog is waiting, often "Some files are missing or modified in the Links panel" (a document with a broken or changed link). Ask the user to answer it; then `status` |
| Windows: "An Illustrator process exists but does not answer" | Illustrator is still starting (retry in a few seconds), or it crashed and Windows Error Reporting holds a frozen copy: ask the user to close the error report (or end Illustrator and "Windows Error Reporting" in Task Manager), then `status {launch: true}` |
| Windows: "Illustrator runs as another user or elevated" | Illustrator and the MCP client run at different levels (one "as administrator"): restart one so both match |

## 8. What to tell the user when done

Where the file is and its artboards; what preflight found (errors fixed, warnings accepted); differences from any
reference and why; how to rebuild (the builder file and its args); anything skipped.

## Recipes: ready builders

`run_script {recipe: "list"}` names the built-in builders and their options; run one with
`run_script {recipe: "calendar-month", args: [{year: 2027, month: 1, lang: "uk", week_numbers: true, x: 10, y: 10, w: 180, h: 120}]}`.
Positions and sizes are in session units, type sizes in pt; each recipe builds into the active document as one named
group and returns what it made.

| Recipe | Builds |
|--------|--------|
| `calendar-month` | Month + year title, weekday row, date grid with weekends coloured, optional ISO week numbers; paragraph styles per role (`Cal Title`, `Cal Weekday`, `Cal Date`, `Cal Week`); `lang` en / uk, Monday or Sunday first |
| `labels-sheet` | A cols × rows grid of labels with centred or left text (`\n` = new line) and optional borders; warns when there are more texts than labels |
| `business-card` | One card: colour band (left or top) running into the bleed, company, name, title, contact lines; 85 × 55 mm by default |
| `color-chips` | Chips with name and colour values, from given colours or the document's global and spot swatches |
| `style-guide` | The document's global/spot swatches as chips and every paragraph style as a sample line, fitted to the width |

Use a recipe as a starting point, then adjust with the normal tools (swatches, styles, `modify_items`).

## Production runs (0.3)

**Variable data** — `data_merge`. Build one template (artboard 0, or give `refs`):

| In the template | Gets |
|---|---|
| `{{field}}` anywhere in a text | the value, in the placeholder's style (several per text are fine) |
| item named `{{field}}`: text frame | the whole contents |
| item named `{{field}}`: linked image | relinked to the value (a file path, relative to the data file), fit inside the old box, centred; empty → hidden |
| item named `{{field}}`: symbol instance | the symbol with that name |
| item named `{{field}}`: path, compound path, group | fill colour (any colour spec, e.g. `swatch:Gold`) |
| item named `{{?field}}` | shown only when the value is non-empty and not `0` / `false` / `no` / `off` |

Always `dry_run: true` first: it lists the template's fields, `missing_in_data` and `unused_columns`. Modes:
`artboards` (default; one per row, laid out right of the existing ones; `name` pattern, `columns`, `spacing`), `grid`
(n-up; `grid {cols, rows, dx, dy}`: copies per artboard, the first where the template sits), `files` (one export per
row; `export {format, path: "out/{Name}.pdf", …}`; the document ends as it was). `remove_template: true` deletes the
template and its artboard afterwards. A row with a missing image is reported in `problems` and the run goes on.
Illustrator's canvas (227 in square) and its 1000-artboard limit cap one document: use `offset`/`limit` per document,
or `files`.

**Many files** — `batch {files, steps, …}`: paths, folders (their .ai/.pdf/.eps/.svg) or `*.ai` globs. Each file:
open → steps → save → `export` (`{name}` in the path = the file's stem) → close. `save: "copy"` (default) writes into
`out_dir` and refuses the originals' folder; `"in_place"` overwrites (only when the user asked); `"none"`. Files open
in Illustrator are skipped. Run `dry_run: true` first: it opens, runs and reports, then closes without saving.

**Recolour** — `swatches {action: "recolor"}`: every fill, stroke, text run and gradient stop goes to the nearest
target swatch (`to`: names or `"group:Name"`; default all global and spot swatches) if it lies within `tolerance` (CIE76
ΔE without a colour profile, default 20), or follows an explicit `map {"cmyk(0,90,80,5)": "swatch:Red"}`. Tints of a
swatch match by the swatch's colour and stay tints. Gradients are recoloured once per gradient (they are document-wide).
`dry_run` reports `colors` and `unmatched` first. Brand libraries: `swatches {action: "import", path: "brand.ase"}`.

**Lean tool list** — with `CHANDELIER_TOOLS=lean` only `status`, `documents`, `batch`, `run_script`, `preview`,
`export`, `find_items`, `get_items` and `tools` are listed. `tools {}` lists the rest, `tools {query}` searches,
`tools {name}` returns a schema, `tools {call, args}` runs one; step tools also work inside `batch`.

## Reference: `AIA.*` helpers in `run_script`

Positions and sizes in session units (default pt, artboard top-left, y down); font size, leading, tracking and
stroke width always pt. Options are the **last** argument, an object.

| Helper | Does |
|--------|------|
| `AIA.doc()` | active Document (error if none) |
| `AIA.layer(name)` / `AIA.fresh(name)` | get/create a layer and make it active / the same, emptied first |
| `AIA.group(name, parent?)` | new group in a Layer or GroupItem |
| `AIA.swatch(name, color)` | global process swatch (create/update) → use `"swatch:Name"` |
| `AIA.pstyle(name, {font, size, color, leading, tracking, hscale, align})` | paragraph style (create/update); `hscale` = horizontal scale in % |
| `AIA.text(str, {x, y, font, size, color, align, style, leading, tracking, hscale, name, parent})` | point text, y = baseline, `\n` = new paragraph; removed again if styling fails |
| `AIA.rect / ellipse(x, y, w, h, {fill, stroke, sw, name, parent})` | shapes |
| `AIA.line(x1, y1, x2, y2, {stroke, sw, cap, dash, …})` · `AIA.path([[x, y], …], {closed, …})` | lines and polylines |
| `AIA.svgPath(d)` | parse SVG path data (create_path uses it) |
| `AIA.font(name)` | TextFont by fuzzy name ("Arial Bold" → Arial-BoldMT) |
| `AIA.color(spec)` / `AIA.colorStr(color)` | colour string ⇄ Illustrator colour |
| `AIA.find(name)` / `AIA.refs(ref)` / `AIA.walk(fn, root?)` | find by name / resolve a ref / visit every item fast |
| `AIA.box(item)` | `[x, y, w, h]` visible bounds (clipping groups: the mask) |
| `AIA.at(k, fn)` | run `fn` with coordinates from artboard k's top-left |
| `AIA.P(x, y)` · `AIA.u(v)` · `AIA.mm(v)` | session point → document coordinates · session units → pt · mm → pt |
| `AIA.json(v)` / `AIA.parse(s)` | JSON in ES3 |
| `AIA.warn(msg)` | add a warning to the call's result |

ExtendScript is ES3: `var` only; no arrow functions, `let/const`, template strings, `Array#map/forEach/indexOf`,
`JSON`. Never read a paragraph style's character attributes (crashes Illustrator). To change a style's paragraph
attributes in raw code, keep the style in a variable first: `var st = doc.paragraphStyles.getByName(n);
st.paragraphAttributes.spaceBefore = 5` (a chained `getByName(n).paragraphAttributes.… =` fails, quirk C24), or use
`styles update`.
