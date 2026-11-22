# Logo and hero image plan — designed with Chandelier

Status: ✅ done 2026-11-22 — result and files in [brand.md](brand.md); decisions in § 9; how it went in § 10. Last updated: 2026-11-22.

The project's own logo **and the GitHub hero image**, drawn in Illustrator **only through Chandelier** (an agent with
the MCP tools, no manual Illustrator work). Two goals at once: the brand for the repo (hero banner, social preview,
README, plugin and registry listings), and a second real
job that exercises the tools the benchmarks barely touched — Bézier paths, `path_ops`, gradients, SVG export, icon
sizes.

## 1. Brief

| | |
|---|---|
| **Name** | Chandelier — *люстра*, Ukrainian designers' nickname for Illustrator |
| **What it is** | A fast bridge that lets AI agents drive Illustrator: one persistent connection, batches, print-ready output |
| **Audience** | Developers and designers who use AI agents; GitHub, npm, MCP registry, Claude Code plugin list |
| **Personality** | Precise, quick, a little witty (the pun), crafted — a print designer's tool, not a toy |
| **Must say** | vector / Bézier craft · light (it "lights Illustrator up") · connection (agent ↔ app) |
| **Must not** | look like Adobe's Illustrator icon or use Adobe marks: no orange-on-brown rounded square, no "Ai" letters, no Adobe red. The repo is public and MIT; the logo must be original and clearly ours |
| **Uses** | **GitHub hero image** (README banner + social preview), GitHub avatar, favicon, npm/registry icon, Claude Code plugin icon, docs pages |

## 2. Concept directions

Four directions, each drawn as 3 variants in the exploration round (§ 4, step B).

| # | Concept | Idea | Risk |
|---|---------|------|------|
| **A** | **Bézier chandelier** | A chandelier whose arms are Bézier curves with visible anchor points and handles; the candle flames are the anchor squares or handle dots. The pun and the craft in one mark | Busy at 16 px: needs a simplified small-size version |
| **B** | **Pen-nib chandelier** | The pen-tool nib turned upside down becomes the chandelier body; arms spread from it; a single light at the tip | The nib is a common vector-app symbol; must stay distinct from Adobe's |
| **C** | **Monogram "C"** | A "C" drawn as one hanging arc (the chandelier's ring) with 3–5 lights on it; the opening of the C points down like the hanging chain | Less literal; relies on the wordmark for the pun |
| **D** | **Connected lights** | A chandelier as a small graph: a hub (the agent) and arms ending in lights (tools), lines straight like a node diagram — "fast connection" | Reads as a generic network icon if the chandelier silhouette is weak |

My recommendation: **A** as the lead, **C** as the simple alternative (best at small sizes). The final mark may merge
them (a C-shaped ring with anchor-point lights).

## 3. Design system decisions

- **Geometry:** built on a 24-unit grid inside a 512 × 512 pt artboard (icon) — circles and arcs from a construction
  layer (non-printing, kept in the file), stroke-based drawing converted to fills at the end. Every path checked for a
  minimal anchor count.
- **Colour:** 2 brand colours + neutrals, as global swatches (RGB document: screen first; CMYK equivalents listed for
  print). Two moods to explore in step B: *warm light* (amber/gold light on deep ink navy — matches the "light up"
  idea) and *cool precision* (electric blue anchors on near-black). Every version also in one-colour black and white.
- **Wordmark:** "Chandelier" in an open-licensed (OFL) font so the source stays shareable; candidates installed here:
  Josefin Sans, Raleway, Montserrat, Poppins, Nunito Sans (sans) and Cormorant Garamond, Playfair Display, DM Serif
  Display, Cinzel, Italiana (serif). Final wordmark outlined, with hand-adjusted kerning and one possible custom touch
  (e.g. the dot-less "i" replaced by a light, or the "C" from the mark).
- **Optional:** a Cyrillic version "Люстра" for Ukrainian posts — same font must cover Cyrillic (check with `fonts`).

## 3a. Hero image (GitHub)

The first thing a visitor sees: a wide banner at the top of the README, and the same art as the repository's social
preview (the card shown when the link is shared).

| | |
|---|---|
| **Formats** | README hero 1280 × 640 px (2:1), delivered as SVG (crisp, small) **and** PNG @2x 2560 × 1280; social preview 1280 × 640 PNG, < 1 MB (GitHub's recommendation; it crops nothing but shows it small, so it must read at ~600 px wide) |
| **Light / dark** | Two versions, switched in the README with `<picture>` + `prefers-color-scheme`; the social preview uses the dark one (it is shown on many backgrounds) |
| **Content** | The mark large on one side; on the other, the wordmark, a one-line tagline and at most one proof point. Layout keeps the important parts inside the central 80 % (safe area for crops and small cards) |
| **Story** | The chandelier hangs from the top edge and its lights fall on an **artboard** below it: a few vector paths with anchor points and handles being drawn — the agent "lights up" Illustrator. Light as soft radial gradients, art as clean flat vectors |
| **Text** | Tagline candidates: *"Let AI agents drive Illustrator — fast."* · *"Light up Illustrator for AI agents."* · *"Illustrator, at agent speed."*; proof point: *"~5 ms per call · batches · print-ready PDF/X-4"* (owner picks, § 9). All text outlined in the SVG |
| **Must not** | Show Adobe's app icon, Illustrator UI screenshots or Adobe logos; the artboard is drawn by us |
| **Checks** | Legible at 600 px wide (social card) and on a phone (README at ~360 px); text contrast WCAG AA on its background; SVG < 100 KB, PNG < 1 MB |

The hero reuses the final mark, colours and wordmark, so it comes after the logo is approved (step G2 below); its
layout can be sketched earlier, in review 1, so the mark is chosen knowing it must also work large and lit.

## 4. Process — step by step with Chandelier

All work in one RGB document `tmp/logo/chandelier-logo.ai` (git-ignored while exploring), one builder per step in
`tmp/logo/` so every step can be re-run with other parameters. Calls are estimates.

| Step | What | Chandelier tools | Calls | Output |
|------|------|------------------|------:|--------|
| **A. Setup** | RGB document, 12 artboards 512 × 512 pt (4 concepts × 3 variants) + 1 artboard 1600 × 900 for the comparison board + 2 hero artboards 1280 × 640 px (light, dark); layers *Construction* (non-printing) and *Art*; swatches for both colour moods | `documents new {artboards: 13, artboard_names}`, `batch` (swatches, layers) | 2 | Empty board |
| **B. Exploration** | One parametric builder per concept (`concept-a.jsx` … `d.jsx`), args = arm count, curve tension, light size, stroke weight; each writes its 3 variants with `AIA.at(k, …)`. Bézier arms with `AIA.svgPath` / `create_path {d}`, lights with ellipses, anchors as small squares | `run_script {file, args}` × 4 | 4–6 | 12 rough marks |
| **C. Review 1** | Contact sheet of all 12 + each at 32 px + a rough hero layout with the two strongest marks placed large; owner picks 1–2 directions and a colour mood | `preview {artboard, more: [1…11]}`, `export png` of the sheet | 2 | **Owner's choice ❓** |
| **D. Refinement** | Re-build the chosen concept on the construction grid; strokes → outlines, `path_ops` unite/minus for one clean compound shape; optical fixes (light sizes, stroke contrast); small-size version for 16–32 px (fewer arms, no handles) | `run_script`, `path_ops`, `modify_items`, `get_items` (anchor counts) | 6–10 | Final mark, large + small |
| **E. Wordmark** | 6 fonts side by side (`create_text {grid}` on one artboard), tracking tests; outline the chosen one; kerning and the custom touch by moving outlined glyphs | `fonts`, `create_text`, `path_ops`, `transform_items` | 4–6 | Final wordmark |
| **F. Review 2** | Mark + wordmark in context: README header mock, GitHub avatar circle crop, dark and light backgrounds, 16/32/64 px | `preview {more}` | 1–2 | **Owner's approval ❓** |
| **G. Lockups** | Horizontal, stacked, mark only, wordmark only; colour, one-colour black, one-colour white; clear space = height of one light, minimum sizes | `duplicate_items`, `align_items`, `artboards` | 3–4 | Lockup artboards |
| **G2. Hero image** | Builder `hero.jsx` (args: theme light/dark, tagline, proof point) on the two 1280 × 640 artboards: background, mark large with radial-gradient light, artboard with Bézier paths and handles in the light, wordmark + tagline; check at 600 px and 360 px wide; owner approves | `run_script {file, args}`, `preview {artboard, width: 600}`, `preview {width: 360}` | 4–6 | Hero light + dark |
| **H. Production** | Export: SVG (text outlined) of every lockup; PNG 16/32/48/64/128/256/512/1024; favicon set; hero SVG + PNG @2x (light, dark) and the social preview PNG; master `.ai` + PDF | `export {format: svg / png, artboards, width}`, `documents save {export, close}` | 3–4 | `docs/assets/brand/` |
| **I. Docs** | `docs/brand.md` (meaning, colours with HEX/RGB/CMYK, fonts and licences, clear space, don'ts), README hero (`<picture>` light/dark), roadmap + change log; the owner uploads the social preview in the repo's Settings → Social preview (not settable from git) | — | — | Committed |

Total: about 30–40 Illustrator calls over three review rounds (concepts, logo, hero); the agent work between reviews is roughly an hour each.

## 5. Quality checks

- **Small sizes:** the mark reads at 16 px (favicon) and 32 px; checked from real exported PNGs, not only zoomed previews.
- **Contrast:** brand colours pass WCAG AA (≥ 4.5:1 for the wordmark, ≥ 3:1 for the mark) on both white and the dark
  background.
- **Clean vectors:** final art has no strokes (all outlined), no stray points, no hidden or empty items
  (`document_info` issues = 0, `preflight` clean), each lockup one group named after it.
- **SVG:** under ~5 KB per mark, `viewBox` set, no embedded raster or fonts; renders the same in GitHub's light and
  dark themes.
- **Originality:** side-by-side with Adobe's Illustrator icon and other MCP/vector-tool logos found online — no
  confusable shape, letters or colours.

## 6. Deliverables (committed)

```
docs/assets/brand/
  chandelier-logo.ai            master (all artboards; fonts outlined in final art, live copies on a hidden layer)
  chandelier-mark.svg           mark, colour        (+ -black.svg, -white.svg)
  chandelier-horizontal.svg     mark + wordmark     (+ -black, -white, -dark-bg)
  chandelier-stacked.svg
  chandelier-mark-{16,32,48,64,128,256,512,1024}.png
  favicon.ico / favicon.svg
  hero-light.svg / hero-dark.svg              README hero, 1280 × 640
  hero-light@2x.png / hero-dark@2x.png        2560 × 1280 fallback
  social-preview.png                          1280 × 640, < 1 MB (dark), uploaded in repo Settings
docs/brand.md                   how to use the logo
```

Exploration files stay in git-ignored `tmp/logo/`; only the chosen art is committed.

## 7. What this tests in Chandelier (dogfooding)

Paths with handles (`create_path {d}` / `AIA.svgPath`), `path_ops` on real art, `transform_items` and `align_items`,
gradients if the chosen mood uses them, SVG export quality (`svg_text: "outline"`), PNG export at exact pixel widths,
`preview` at icon sizes. Every confusing or missing tool feature found on the way becomes a roadmap item, like the
calendar and M2 runs did; the job is recorded as real job #2 (calls, errors, time) in
[benchmarks](research/benchmarks.md).

## 8. Risks

| Risk | Mitigation |
|------|------------|
| Mark too detailed for a favicon | Separate small-size mark from step D; test at 16 px from step C on |
| Looks like Adobe's icon or a generic network icon | Originality check (§ 5); concept A/C rely on the chandelier silhouette, not letters |
| Font licence problems in a public repo | OFL fonts only; outlined in delivered SVG/PNG; licence named in `docs/brand.md` |
| Fine Bézier work is slow through tools | Parametric builders: change args, re-run, compare — instead of nudging points one call at a time |
| Illustrator crash mid-session (seen on real job 1) | Save the master after every step (`documents save`), builders re-runnable from scratch |

## 9. Decisions (made by Claude; the owner delegated them, 2026-11-22)

1. **Directions:** A (Bézier chandelier), C (monogram C), D (connected lights), 3 variants each. B dropped: a pen nib
   is the most common vector-app symbol and would sit too close to Adobe's own imagery.
2. **Colour mood:** warm light — amber light on ink navy (the "lights Illustrator up" idea); plus one-colour black
   and white versions. Cool precision is not explored.
3. **Wordmark:** decided in step E from a side-by-side of the OFL fonts in § 3.
4. **Cyrillic lockup:** not now (the README explains the pun); can be added later from the same files.
5. **Hero text:** tagline *"Light up Illustrator for AI agents."*; proof point *"~5 ms per call · batches ·
   print-ready PDF/X-4"*.
6. **Licence of the logo files:** © the owner, all rights reserved; anyone may use them unmodified to refer to the
   project. The code stays MIT. Stated in `docs/brand.md`.

Reviews 1–3 are done by Claude against the checks in § 5 and § 3a; the owner sees the result at the end.

## 10. How it went (2026-11-22)

Chosen: **C2** (the hanging ring as a C, its lights = the open path's end anchors with one handle each), refined on a
512 grid with a separate small-size version; wordmark **Montserrat SemiBold** with the i-dot as an amber anchor
(A, D and C1/C3 were weaker: top-heavy, busy at 32 px, or generic; D read as a network icon). Hero: the mark hangs
from the top edge and lights an artboard where a Bézier path is being edited.

Built with 4 builders (`explore`, `mark`, `wordmarks`, `lockups`; in `assets/brand/source/`), about 30 Illustrator
calls in all, 1 tool error (a font name without that weight: clear message, fixed in one call). Exports: 10 SVG +
11 PNG from one `documents save {export}` call of 20 exports plus one more; favicon.ico assembled from the PNGs with
ImageMagick (Illustrator can't write .ico).

Found on the way (→ roadmap; all three fixed in the 0.1 release):
- `preview {region}` is measured from the **active** artboard; a script that adds artboards changes it, and the next
  region preview came back blank. A `region` relative to a given artboard (or artboard 0) would avoid the guess.
- SVG export keeps art that lies outside the artboard (here a large radial glow); browsers clip to the `viewBox`,
  other renderers don't. Solved with a clipping mask in the builder; an export option to clip to the artboard would
  be simpler.
- Contrast had to be checked outside Chandelier (one colour pair failed AA and was fixed): a contrast check in
  `preflight` or `document_info` for RGB documents would catch it.
