---
name: illustrator
description: Use when the user wants something made, changed, checked or exported in Adobe Illustrator (posters, calendars, labels, print layouts, recreating a design from an image, variable data from a spreadsheet, the same change over many files, recolouring to a brand palette, preflight, PDF/X export) through the chandelier MCP tools. Covers the short build loop, recreating a design from a reference image, production runs, print checks and recovery from timeouts.
---

# Working in Adobe Illustrator with Chandelier

The `chandelier` MCP tools drive the user's running Illustrator over one persistent connection (~5 ms per call).
The server's own instructions carry the conventions; this skill is how to use them well.

## Ground rules

- **Only touch documents you created** or that the user asked you to change. Leave a finished document open for the user to look at; close it only when they ask or when a job goes
  through many files (`batch {files}` closes each itself).
- **Never launch Illustrator yourself** unless the user asks; any tool says when it isn't running.
- Coordinates everywhere: `[x, y, w, h]` from the artboard's top-left, y down, in the session's units
  (`documents new {units: "mm"}` sets them). Point text: `y` is the baseline.
- Colours: `"cmyk(100,85,30,25)"`, `"gray(60)"`, `"#1e2a44"` (avoid RGB in CMYK documents), `"swatch:Name"`.
- Load only the tools you need: a build needs `documents`, `batch` (or `run_script`) and `preview`.

## The short build loop (~8 calls to Illustrator)

1. `documents new` — size, `units`, `color: "cmyk"` for print, `bleed` (3 mm is common), `artboards`,
   `artboard_names`, `title`.
2. **One batch of design tokens:** `swatches add` one **global** swatch per colour role; `styles create` one
   **paragraph style per text role**. A designer must be able to restyle the file by changing one swatch or style.
3. **One batch of content:** `create_text` / `create_shape` / `create_path` with `items: [...]`, or
   `create_text {grid}` for tables and calendars; every text gets its `paragraph_style`; per-step `artboard: k` for
   other pages. Or a ready **recipe** (`run_script {recipe: "list"}`: calendar month, labels sheet, business card, style
   guide, colour chips), or **one `run_script` builder** (`file` + `args`) when logic is easier in code; start it with
   `AIA.fresh("Layer")` so a re-run replaces instead of adding.
4. **One check call:** `preview {reference?, more: [other artboards], preflight: true}`. Fix what it shows (one
   batch), check once more.
5. **One finish call:** `documents save {path, export: [{format: "pdf", path}, {format: "png", path, artboards: [0]}]}`. Leave the document open
   (add `close: true` only when the user asks).

Name layers and groups. Keep scripts re-runnable.

## Recreating a design from an image

1. Look at the image; find the page's pixel box and its format from the aspect ratio (1.414 A-series, 1.294 Letter).
2. List parts and roles. Copy the structure, not artwork: no photos or other people's logos — leave a named
   placeholder. Fix obvious mistakes and say so.
3. Measure in pixels; one factor `S = page width in pt ÷ page width in px`; font size ≈ cap height px ÷ 0.7 × S.
4. Build with the loop above, then `preview {reference: "<image>", reference_crop: [x, y, w, h]}`: fix what
   `content_box` (shift/scale) and `differences` show (a `shifted` one has its `shift` and `items`: move them back by it); one or two rounds.
5. **Proofread every word against the reference** — on a client's job the words are theirs.
6. Missing font? Pick the closest installed one (`fonts {query}`) and match widths with the style's `hscale` so lines
   break where the reference breaks; put body copy in area text.

## Production runs

- **Variable data** (certificates, badges, cards, labels): build one template on artboard 0. Put `{{field}}` in any
  text (it keeps the placeholder's style); name an item `{{photo}}` (linked image: the value is a file path), `{{logo}}`
  (symbol name), `{{color}}` (fill) or `{{?vip}}` (shown only when set). Then `data_merge {data: "people.csv",
  dry_run: true}` — fix what `missing_in_data` shows — and run it: `mode: "artboards"` (one per row, `name: "{Name}"`),
  `"grid"` (n-up sheets: `grid {cols, rows, dx, dy}`), or `"files"` (`export {format: "pdf", path: "out/{Name}.pdf"}`).
  `remove_template: true` leaves only the filled artboards. Hundreds of rows: `offset`/`limit` per document, or files.
- **Many files:** `batch {files: ["jobs/*.ai"], steps, out_dir, export: [{format: "pdf", path: "pdf/{name}.pdf"}]}`.
  Run it with `dry_run: true` first. Copies go to `out_dir`; overwrite originals only when the user asks
  (`save: "in_place"`). Files open in Illustrator are skipped.
- **Brand palette:** `swatches {action: "import", path: "brand.ase"}`, then `swatches {action: "recolor", to:
  ["group:Brand"], dry_run: true}`; read `colors` and `unmatched`, adjust `tolerance` or add a `map`, then run it.
- With `CHANDELIER_TOOLS=lean` only eight tools are listed: `tools {query}` finds the others, `tools {call, args}`
  runs them, and they also work as `batch` steps.

## Effects and prepress

- `effects {refs, add: [{type: "drop_shadow", x: 2, y: 2, blur: 3, color: "gray(60)", opacity: 60}, {type: "round_corners", radius: 4}]}`
  — live and editable in Illustrator; `clear: true` removes them; `path_ops {op: "expand"}` bakes them. Effects
  can't be read back, so keep track of what you applied. Raster effects (shadows, glows, blur, feather) print at the
  document's raster resolution.
- Traps: `path_ops {op: "trap", refs: <the lighter objects>, distance}` (trap width in session units; default 0.25 pt).
- `swatches {action: "convert", mode: "cmyk"}` turns an RGB document into CMYK; `mode: "gray"` for one-colour versions.
- Press condition: `export {format: "pdf", output_intent: "FOGRA39"}` (or "GRACoL", "SWOP", an .icc path); the result
  lists the `output_intent` of each PDF.

## Print checks

- `preflight` must show **0 errors** (missing fonts, RGB in CMYK, overset text, broken links, white overprint).
  Warnings worth a look: low-res images, hairlines, art at the edge without bleed, small text; in RGB documents,
  low contrast.
- `export {format: "pdf"}` makes PDF/X-4 with the document's bleed and returns the measured trim and bleed boxes.

## When something goes wrong

| What you see | What to do |
|---|---|
| "Timed out …" | The error says whether Illustrator answers again. Call `status`: `last_call` shows whether call #n finished and what it created. Don't repeat non-idempotent work before that |
| "Chandelier needs Node.js 22.15 or later" | The user's default `node` is too old: show them the fix from the message (install Node 22+, make it the default, restart Claude Code) |
| "Illustrator is not running" | Ask the user to start it (or `status {launch: true}` if they agree) |
| "quit or crashed" | Ask the user to restart Illustrator; the runtime reloads itself |
| MRAP | Transient; tools already retry. If it repeats, save, then `status {restart: true}` (reopens the documents) |
| A batch step failed | Earlier steps stayed (unless `rollback: true`); resend from `failed_step` |
| `preview {region}` blank | Give `artboard` with `region` |

## When done, tell the user

Where the file is and its artboards; what preflight found; what differs from the reference and why; how to rebuild
(builder file and args); anything skipped.
