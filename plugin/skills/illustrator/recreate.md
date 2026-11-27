# Recreating a design from an image — the full method

Read this before rebuilding artwork from a flat file, a scan, a screenshot, a rendered mockup or a photo of a real
object. The result is editable print artwork: live text, swatches and styles, clean vector shapes, at the real size.

The method is tested with fresh agents on a suite of real jobs of different kinds (a flat calendar page, a desk
calendar in a mockup, a packaging front in a product photo, a photographed box with translucent waves; more kinds to
come). How: `docs/recreate-testing.md` in the repository. Examples below name the kind of job they come from.

## Which sections a job needs

Every job: § 0 set up, § 1 read the image, § 2 list the parts, § 8 compare, § 9 finish. Then by what the design
contains (most contain several):

| The design has… | Typical jobs | Sections |
|---|---|---|
| Text, grids, tables, rules, boxes | calendars, flyers, menus, forms, posters, back panels | § 3 |
| Logos, icons, geometric marks, wordmarks | brand marks, pictograms, badges | § 4 |
| Free-form shapes: waves, blobs, swooshes, organic bands, overlapping translucent layers | packaging backgrounds, decorative bands, abstract art, flat illustrations | § 5 (start with § 5.0 when the `scene` tool is listed) |
| Colour that must match (inks, overlaps, a printed or photographed surface) | anything photographed or printed | § 6 |
| Gradients, shading, shadows, glows | illustrations, layered paper looks | § 7 |
| A photo of a real object or a mockup (perspective, folds, light) | product photos, box and bag mockups, desk/wall mockups | § 1 (flat shape and box) |

The failure agents make most often, whatever the kind: **guessing instead of measuring** (sizes, positions,
curves), and **copying the photo instead of the artwork** (light, folds and perspective drawn as if they were print).

## 0. Set up for comparing

`name:` refs match items anywhere in the document: in a document with other versions, give your items unique names
(your prefix) or use `layer:` / uuids.

Skip what already exists (a document, a reference artboard): reuse it.

- `documents new` at the artwork's real size (units mm or in, bleed). Name layers by role.
- Put **the reference on its own artboard left of the work**, at the same scale and aligned to it, on a locked,
  non-printing layer "Reference": `artboards {add, rect}` + `place {path, x, y, w, layer}` + `layers {update,
  locked}`. The user compares side by side in Illustrator; previews and exports never show it.

## 1. Read the image: artwork vs photo, flat shape and box

- `preview {image, grid: true}` (no Python/PIL/Swift/sips): pixel size, ppi, `content_box` (the page in a scan or
  photo). `region` zooms a part (up to 8×), `sample` reads colours, `page` renders a PDF or .ai page.
- **Reading a zoomed preview:** grid labels are **image px**; a position you read off the shown picture is
  `region.x + shown px ÷ zoom` (the reply gives `zoom`). For exact points use a small region (high zoom) around the
  point, or `sample` (its `at` is image px), instead of estimating from a wide view.
- Decide what is **print artwork** and what is **the photo or mockup**: perspective, folds and creases, curls, side
  faces, rings and bindings, shadows, highlights, reflections, paper texture, the table. Recreate only the artwork,
  flat and at its real size; say what you left out. Creases and folds (a faint line crossing other edges without
  changing them, a shaded flap, a curl) and curved light or dark wedges on a bent board are not artwork.
- Several items in one image (a row of boxes, front and back, a set of labels): recreate the one asked for; crop it
  with `preview {image, region}` and work in that crop.
- **Find the artwork's flat shape and its box** before measuring anything:
  - Use the dieline or the given size if there is one: **the given size is the truth.** Otherwise the outline of the
    face seen nearly head-on *is* the shape (a tapered box front is a real trapezoid: keep it; a rounded label keeps
    its corners). The box is the shape's bounding box.
  - **No given size:** one uniform scale, `S = artwork width in units ÷ that width in px`, the same for x and y;
    the artboard is the box at that scale.
  - **Given size, and the photographed face's aspect differs** (the photo is foreshortened, or the object is seen at
    an angle): map the face's outline in the photo **onto** the panel — its corners to the panel's corners: scale x
    and y separately, or a 4-point projective map when it tapers or shows perspective. The whole shape then fits and
    the artwork follows it. Keeping one uniform scale and letting the panel overflow (or centring it) cut a side off
    in a test run and broke the object's shape.
  - In `create_path`: `scale: [sx, sy]` scales x and y apart; `map: {from: 4 photo corners, to: 4 panel corners}`
    (`bilinear: true` for the same map a `scene {map, bilinear}` used, so hand-drawn parts line up with the scene)
    (with `fit`) maps measured points before fitting. Shapes and text: convert positions with the same map.
  - The box holds the **whole** face and nothing else (no side faces, flaps, binding, table). It is also your
    `reference_crop`; a crop that cuts part of the face off loses that part's shape.
  - A side that isn't straight in the photo (bowed board, lens) is usually the photo: draw the die's straight side.
  - **Keep the object's shape:** for a shaped object (a die-cut panel, a label), the background or substrate fills the
    real outline plus bleed and everything is clipped to it; outside stays empty, as on the die. A filled rectangle
    makes a box front read as a poster. **One clip for everything** (substrate and every shape in one clip group with
    the outline): `arrange_items {action: "clip", refs: [...], mask: <outline>}`. The outline also goes on a
    non-printing "Dieline" layer; the bleed outline is the outline offset outward (`path_ops {offset}`).
- Work in image pixels when that is easier: `create_path {d, scale: S, x, y}` places pixel coordinates.

## 2. List the parts — structure, not pixels

- Back to front, by role: background/substrate, panels and boxes, shapes, logo, images, text blocks, rules.
- Copy the **structure**, not the artwork: photos and other people's logos you can't redraw cleanly become a named
  placeholder in their place and size (a product photo in a packaging job, a portrait on a flyer). Say so.
- Text stays live text; repeated elements (grid cells, icons in a row) are built once and repeated (`grid`, `items`,
  `duplicate_items`).
- Fix obvious mistakes in the reference (a wrong date, a typo) and say so; on a client's job the words are theirs:
  proofread every word against the reference.
- Plan the swatches (one global swatch per colour role) and paragraph styles (one per text role) before building.

## 3. Text, layout and grids

- Measure positions in pixels with `preview {image, region, grid: 10}` and convert with S; snap to the grid the
  design obviously uses (equal columns, a common margin, a baseline step) instead of copying each pixel.
- **Font size ≈ cap height in px ÷ 0.7 × S** (x-height ÷ 0.5 for lowercase text) — a first guess: fonts differ (Futura's
  caps came out 11 % too tall), so confirm the cap height in a close-up and adjust. Weight from stroke thickness
  against the cap height; width from a known word's length.
  - **Measure each large text on its own:** two headings that look alike can differ (one cap height gave 59 pt for
    both; they needed 61 and 54 pt).
  - **Check a display line's width too:** compare the box `create_text` returns with the measured width of the line;
    at the right cap height a title came out ~10 % narrow — fix with the font, `horizontal_scale` or tracking.
- Fonts match fuzzily (`fonts {query}` when unsure). A missing font: the closest installed one, then match widths with
  `horizontal_scale` so lines break where the reference breaks. Body copy goes in area text.
- **Choosing the font:** set the same line in 4–6 candidate fonts in one batch, compare the returned box widths with the
  measured width and look at one render. The x-height : cap-height ratio narrows the family (0.75 → Tahoma/Verdana).
  A JPEG screenshot makes type look heavier than it is: don't pick the weight from the blur.
- A geometric lowercase **wordmark** (circles or ellipses and stems) is faster to construct than to match with fonts:
  measure counters and stems in one zoom, unite the positive shapes, `minus_front` the counters and an arch's cutter.
- **Non-Latin text** (Cyrillic, Greek…): the fuzzy font match doesn't check the script — look at the text in a
  preview close-up; missing glyphs show as boxes or a fallback face. Pick a font that has the script. Faces seen to
  carry Cyrillic on macOS: Helvetica Neue (Light too), Arial, Times New Roman, Montserrat when installed;
  AvenirNext-UltraLight showed boxes. Check the chosen face in a close-up before setting all the text.
- **Wordmark, in this order:** cap height with the size, then one wide letter's width with `horizontal_scale`, then the
  whole word's width with tracking. All at once take several rounds.
- **Centred point text with tracking:** check its position by the box `create_text` / `edit_text` return, or by
  `content_box` in a region preview — not by a formula.
- A paragraph style update doesn't clear tracking set locally by `edit_text`: re-apply the `paragraph_style`.
  Re-applying it clears **every** local override, `align` included (a centred line jumped ~50 mm): put `align`,
  tracking and every other shared setting in the style itself, and set locally only what one frame needs.
- `horizontal_scale` thickens or thins stems along with the width: check the stem weight against the reference after
  scaling, and change the weight if it is off.
- Give every text its paragraph style and every colour its swatch, so the file can be restyled.
- Tables and calendars: `create_text {grid}` with column props; check the content (dates, weekdays, totals) — a
  correct-looking grid with a wrong first weekday is the classic miss.
- Check alignment and spacing in a close-up against the reference: baselines on one line, equal gaps, rules where they
  start and end.
- **Text on a circle** (badges, seals, emblems): a circular path for each arc, `create_text {kind: "path", on_path}`.
  The path's direction decides the side: the top arc runs left → right **over** the top (clockwise from 9 to 3
  o'clock), the bottom arc left → right **through** the bottom (counter-clockwise from 7 to 5 o'clock) so it reads
  upright. The path's radius is the baseline: top arc = ring's centre radius − cap height / 2, bottom arc = centre
  radius + cap height / 2. Size from the angle the text spans: measure the arc length of the reference's text at its
  baseline radius and match it with `horizontal_scale` or tracking, not size.
  - The two arcs may have different sizes, and the ring may not share the disc's centre: measure the ring's own
    centre for the text paths.
  - Match the span by the **angles of the first and last letters** in a close-up; scale tracking by the ratio of the
    spans. `baseline_shift` in the style moves path text in or out radially.
- **Size without capitals** (lowercase-heavy text, x-height dominant): font size ≈ x-height ÷ the font's x-height
  ratio (≈ 0.5; e.g. Source Sans 0.486) × S; cap height ÷ 0.7 only for capitals.

## 4. Logos, icons and geometric marks

- **Read the structure before measuring** (flat logos, emblems): `preview {image, region, grid}` zooms over each part
  — which shape is on top, where a band changes colour, what is a stroke. Profile tracks then give coordinates only:
  on flat multi-colour art one track can jump from one shape's edge to another's, and `above`/`below` are averaged
  colours; split a track where its colour pair changes.
- Look for the **construction** first: circles, arcs, rectangles, regular polygons, equal strokes, symmetry axes,
  repeated angles. Build from primitives (`create_shape`) and booleans (`path_ops` unite / minus_front / intersect),
  not from traced outlines; measure the few numbers that define them (radii, stroke widths, angles, centres).
- Symmetric marks: build one half and mirror it (`duplicate_items` + `transform_items {reflect}`), then unite.
- **Rotated shapes** (petals, leaves as ellipses, tilted bars): `create_shape` has no rotation — create the ellipse
  upright at its measured length and width, centred where it belongs, then `transform_items {refs, rotate}` (degrees,
  clockwise; `origin` = its centre by default). A ring of petals: one petal plus
  `transform_items {rotate: 360 / n, copies: n − 1, origin: [cx, cy]}`. Size the whole flower from its measured box
  first, then the petals from it.
- **Constant-width outlines** (a frame, a loop drawn with one pen width): measure both edges, take their mean as the
  centreline and draw it as a **stroke** (`create_path {fit, stroke_width}` with `join: "miter"`), not as a filled
  band — a stroke keeps the width constant by construction. Corners: place the anchor at the **centreline**
  intersection; a miter tip sticks out by w / (2·sin(θ/2)) beyond it. Need a fill: `path_ops {op: "outline_stroke"}`.
- **Interlocking bands that change colour along their length** (a blue band running on as a red one): two shapes,
  the one below continues under the other; the colour boundary is the top shape's end or corner — layer order, not a
  cut.
- **Small illustrative detail inside a mark** (continents on a globe, leaves, ornament): keep the silhouette's main
  turns and the parts big enough to see at print size (≥ ~1 mm); simplify the rest. Read it from a zoom with a fine
  `grid` (one cell ≈ the detail's size), point by point, then fit with a loose tolerance — or, when the `scene` tool
  is listed, analyze a crop of just that part (§ 5.0 step 5).
- Organic parts of a mark (a leaf, a nut, a hand-drawn shape): § 5's measuring and fitting — few anchors, smooth
  curves.
- Wordmarks: set them in the closest font first (script, geometric, slab…) and compare letter widths and slant; only a
  custom lettering that no font approaches gets drawn, and then as a placeholder or a simplified version you say is one.
- Check the mark alone, large (`preview {refs, max_px}`), next to the reference crop: anchor count, symmetry, smooth
  joins. Fewer anchors and cleaner geometry beat a closer but lumpy trace.

## 5. Free-form shapes — measure, decompose, fit

Where agents usually fail: lumpy "camouflage" or "mountain" outlines instead of smooth curves, and guessed shapes.

### 5.0 With the `scene` tool (when it is listed)

`scene` does the pixel work: inks, regions, shared edges fitted once, primitives, ramps, overlaps. You decide.

**What it is for** (from the real-job suite, owner verdicts 2026-11-26/27; may change with more tests): **organic,
irregular artwork that would take hundreds of hand-placed points** — a flat or softly shaded illustration (a figure,
a face, hair, a hat), a detailed silhouette (a tree, roots, continents, figures in an emblem), many flat-colour shapes.
Build those from the scene; **construct everything else** on layers of its own: geometry (circles, rays, frames,
constant-width outlines, symmetric marks — § 4), text (live, § 3), layouts and grids. Results that set this: a foil
logo whose tree came from a crop of the scene and whose sun, rays, frame and text were constructed — "almost
identical, people can't tell it from the original"; a flat illustration built whole from the scene with its hat's
bands ramped — the best run, while runs that hand-drew its shaded shapes were "really bad"; an emblem where the
constructed version had cleaner circles with half the calls (the scene's best part was the globe). Photos of real
objects: the scene for the flat substrate at most; curved shaded bands by § 5a–5c and § 7 (the best photo run used
no scene). Layout jobs (calendars, cards, panels) don't need it.

1. **Analyze.** `scene {action: "analyze", image, map: [TL, TR, BR, BL]}` for a photographed face (corners from
   `preview {image, grid}`; `bilinear: true` for a tapered face; on a box with rounded or wrapped edges put each side
   where the bands start to bend, not at the silhouette), or `crop` for a flat file; `size` = the artboard's aspect — the working image is **stretched** to it, so give `size` only when the crop is
   the artwork drawn a little off (a 620 × 617 crop for a square: fine); an image with a different shape (a margin, a
   caption strip) is cropped to the artwork first, and positions you place by hand come from the stretched image's px
   (the summary's `px`), not the source's.
   Read the table (the 15 largest regions; `where` = each region's box in the analyzed image's px, to pick ids for
   `drop`, `ramp`, `text` without reading labels off the overlay; `show r40-r80` lists others) and the overlay (ids on the image | flat render). `photo: true` means lighting was flattened (§ 1:
   light is not artwork); a softly shaded **artwork** detected as a photo (petals, skin) → analyze with `photo: false`
   to keep its shading as ramp hints. **One analyze per job** (and one per part crop): choose crop, map, `max_px` and `photo` once — analyzing again
   with other values gives new region ids, and the edits made so far no longer apply.
   **Flat inks rendered with a material** (gold foil, emboss, print on textured paper, a mockup's lighting): give
   `colors` = the number of flat inks in the artwork (`colors: 2` for one foil ink on paper). The default splits the
   material's shading into a dozen inks and hundreds of specks.
   **Detail settings:** small art in a large image → raise `max_px` (up to 3000; a `max_px` you give also upscales a
   smaller crop, which smooths its edges but adds no detail); two inks that merge (hair into black,
   lips into brown) → set those regions' inks by hand (`r9 = #231612`, `r33 = #9a1b19`, sampled with
   `preview {image, sample}`). Don't lower `min_de` or raise `colors` for it: that splits soft shading into facets
   all over the image (case 09: faceted skin and hand).
2. **Edit, in one call.** `merge` what is one part (the first id keeps its ink), `drop` noise and photo-only things
   (folds, shadows, side faces; the region a dropped one sits on fills its place — `drop r12 fill r0` to choose;
   `drop < 0.05` drops every tiny region at once, e.g. small text and texture — and with it eyelashes, eyes,
   earrings and finger detail: `keep r41 r57` them right after, or drop by `drop in x y w h` boxes instead), `text x y w h` over each text block (in the analyzed crop's pixels),
   `r10 logo` on marks, `rN circle` / `rect` to force a primitive — only when the **whole** outline is that primitive
   (a disc with a lobe is not a circle: keep it free and fix the round stretch afterwards) —, `c0 = swatch:…` for
   brand inks, `name` the parts.
   Hints are suggestions: take `ramp …` only for a gradient that is artwork — and give `ramp rA rB rC` yourself
   when a soft-shaded shape comes out as camouflage-like bands (a hat brim): its bands become one shape with a linear
   gradient; `layers rA rB` only when the overlap
   really is two translucent inks (the new inks must look right in the summary), `cN = cM` when two inks are one.
   Edits add up; `undo`, `undo 3` or `reset` go back. Check the new summary.
3. **Build.** `scene {action: "build", id, artboard, layer}` → one undo step on its own layer: a new layer goes on
   top, or where `position` says (`"below:<lowest hand layer>"`, `"bottom"`); a rebuild or refine keeps the layer
   where it is, replaces only its own items (items you added stay) and keeps regions you deleted dropped; then
   `create_text` into the returned `text_boxes`: `colour` is the letters' ink and `cap` their cap height (from the
   letters' heights — a first guess: confirm in a close-up and pick fonts as § 3). Text on a circle can't be boxed: drop its
   letters (`drop < …` or ranges) — the ring under them fills the gap — and set it on a path (§ 3).
4. **Refine.** `preview {reference}` once; `scene {action: "refine", id}` corrects inks shifted by colour conversion,
   re-fits edges that miss and rebuilds; it undoes the kind of fix that makes the scene worse (`reverted: "inks"` or `"edges"`, or `true` for all), reports an ink
   that misses by far on its only region instead of moving it, and names inks whose regions disagree (shading: give
   them their own ink or a ramp). A tolerance you set (`tolerance rN 3`) wins.
   Refine also corrects inks you only named or set by hand (`r9 = #231612` for hair, lips) — only an ink set to an
   existing swatch (`c0 = swatch:Name`) is never changed: make every ink you sampled on purpose a swatch first. Check every ink refine changed in a close-up (on a soft-shaded
   face it once turned a skin shadow into a dark brown patch).
   Refine measures the artboard as it looks, hand-built layers included: run it before hand work that covers the
   scene, or keep that work beside the scene, not over it.
5. **Parts.** A part that needs more detail or a cleaner build (a globe, a mark inside a badge, a detailed tree in a
   logo): analyze a `crop` of just that part (with `detail: "high"` for fine detail) and build it with `rect` (where it
   goes, session units) and its own `layer`. The crop cuts every shape crossing its edge square: make it reach past
   every free end of the part (tips, tails, swooshes), or put its edge where the part really ends. Frame lines of
   other parts that run through the crop: drop them in the scene and draw them by hand (§ 4).
   A part built **over** the main scene shows its crop edge as a square seam, and removing its background exposes
   regions of the main scene that run under it: build the part under the main layer, or clip it to the part's
   silhouette.

**When to leave the scene:** after one round of edits the build still shows camouflage-like boundaries inside bands
(soft shading, texture), or a part keeps coming out lumpy → draw that part with § 5a–5c (profile tracks + fit) and
keep the scene for the rest. Don't spend more than two builds on one part.
**A soft-shaded illustration** (gradients on the main shapes — a hat, skin; case 09, the owner's best run): keep the
scene for the **whole** illustration from one analyze of the full image (`detail: "high"`, default `colors`), and in
one edit call: `ramp` the bands of each big soft-shaded shape into one gradient shape, set the few inks that merged
(hair, lips) by hand **as swatches** (`swatches add` the sampled colour, then `r9 = swatch:Hair`: refine changes any other hand-set ink, hair and lips included), `merge` split parts, `name` the inks. Don't hand-draw the big shapes instead (the runs that
did looked worse), and refine before the hand work (it measures what covers the scene too). Draw by hand only what the
scene can't hold: lips (the scene's come out as a lumpy blob — two fitted paths), a layered flower — petals as rotated ellipses or fitted shapes with **flat** fills in 2–3 greens and
a darker outline stroke, back petals first (radial gradients on every petal looked "bubbly"); jewellery (pearls,
stones) — `drop < %` removes detail that small. Dropping a part that wraps another (a bracelet round a wrist) fills
it with what lies under it (often the dark sleeve): `fill` the right region, or draw the covered piece.

**Keeping only part of a scene** (the substrate, the primitives): drop the rest in the scene — `drop in x y w h`
(every region inside a box, image px; when nothing lies wholly inside — a patch that is part of a large region — add
`fill rF` to repaint the box's part of it with rF), ranges, `drop < %` — or delete built items by name (`name:<layer> r12`; a
region you named is drawn under that name alone: `name:<Name>`); a later rebuild keeps deleted regions dropped.
**Small specks around a mark** (splashes, teardrops, dots under ~1 %, low conf): the scene draws them lopsided — drop
them and construct each: a circle plus two tangent lines to the tip, at the measured size and angle (uneven if the
reference is).
**Lost transparency** (black or white corners around a logo): `drop r1 r2 fill none` leaves them empty.
**One region holds several parts** (hair, a brim's underside and a sleeve all in one black region): recolouring it
can't separate them. Analyze a part crop of the one that needs its own look (the hair), drop everything else in that
part scene with `fill none`, and build it on its own layer **below** the hand-drawn layers (and under or clipped to
the main scene, § 5.0 step 5).

### 5a. Decompose into layers

- Overlapping translucent shapes are **layers with multiply**, not separate flat bands: where two shapes overlap the
  tone is darker; draw the shapes whole and let the overlap make the step.
- Count layers from the tones: going across the shapes, each edge is a shape starting (darker) or ending (lighter).
  The **size of the tone step** tells how many start or end there (a step twice the usual = two shapes end together).
  Shading darkens the tone right next to edges, so read each band's tone where its shading has faded.
- **Prefer the fewest whole shapes that explain the tones.** Splitting a shape into lobes or adding fade-in pieces
  cost a test run most of its time and left seams. When the count disagrees along one edge, decide by the majority
  and fix the rest with opacity and shading.
- When steps alone don't tell, compare each region's colour with the bare substrate's: the multiply factor per channel
  (region ÷ substrate) is about the product of the shapes over it.
- A weak step (tone < ~20) running parallel to a stronger edge a short way from it, fading away from that edge, is
  that band's **shading ending**, not a thin shape (§ 7). **Check in a full-size close-up first:** a soft step that fades is shading; a crisp step (a hard edge
  at that tone, even a weak one) is a thin band of its own.
- **An edge that changes owner** (one shape's edge runs along another's for part of its length, then leaves it): build
  the shape with the shared edge, then cut it with `path_ops {op: "minus_front"}` and a cutter whose edge is the
  separate stretch; the shared stretch stays identical and the result keeps its fill, opacity and blend.
- A band whose tone changes **along** its length with no edge is a gradient fill, not an extra shape.
- **Opaque stacked bands** (no translucency): build each band as its own top edge plus a box running down past the
  panel (closed below the bottom edge), stacked bottom to top — the next band covers the rest. No band needs a second
  edge, so no shared-edge slivers; the shared stretches stay single curves.

### 5b. Measure edges densely — never invent

- **`preview {image, profile: true}` measures for you:** tone profiles down the columns (`rows: true`: along rows,
  for steep or vertical edges), every tone step linked into a **track** `{id, tone, above, below, pts}`, drawn on the
  image with its id. `tone` is the lightness step (+ = lighter below/right), `above`/`below` the colours either side.
  Points come every `step` px (default width ÷ 60): keep it at **25–50 px or less** — sparse points leave the fit too
  free (pointed tips, bulges). `region` for one part (a smaller region = denser points), `min` (default 8) to skip weak
  steps (`min: 4` in a small region finds faint edges). Points are image px: map them (§ 1) before drawing.
- Tracks run on toward the image sides and break at sharp turns (> 35°). Still check the overlay: a track can join
  two edges where they meet, or run into a crease — cut its points where the slope jumps.
- **Corners and sides hide small shapes:** thin bands narrowing into a side make short tracks. Profile a `region`
  around every corner and side (`rows: true` on side strips) and make it reach past where the edges end — a region
  that cuts a track ends it there. Count the bands there against your build (§ 8).
- Where an edge is hidden (under an opaque shape, off the page), **leave a gap**: invented points make shoulders and
  straight stretches. `fit` bridges gaps smoothly. Under translucent shapes nothing is hidden: the edge shows through
  as a tone step — find it with a lower `min`.
- Where two edges coincide (two shapes merging, a shape ending on another's edge), they are **one shared curve**: use
  the same points for both (§ 5c). Two measurements 2 px apart leave a hairline sliver.
- **At the panel's sides, reproduce what shapes do there, gently.** Measure right up to the side; a fit that stops
  30–70 px short needs a long extension, which shows. A shape that wraps over a fold in a photo bends a little and the
  clip ends it — the full wrap (ends bending 80–95°) is the fold, not artwork: drop those points so the end keeps the
  slope it has just inside the fold. Points that run **along** the photo's side are the side, not the edge: drop them.
  **Check every side as a stack:** the edges meeting the side, in order, in the reference and in your render — same
  order, every band still with height there (a hooked end once pinched a whole shape off before the side).
- An end hidden by a photo artefact near a side (a curl, a flap): continue the edge with `extend` from the last points
  seen, keeping its slope; that is not inventing.
- **Edges that seem to cross:** sample the tone in the thin gap on both sides of the meeting point. One shape's tone
  on both sides → they merge (shared curve from there); the tone changes → one continues hidden; two shapes' tone →
  they really cross. An edge that ends under another shape: anchor its end **on** that edge, with a free angle —
  e.g. a pale band's top edge whose last fit point is a point taken from the kraft edge it runs into (one shared point,
  the tip is then exact).

### 5c. Draw smooth curves — designer anchors, fitted

Never draw a curve through the measured points (polyline, Catmull–Rom, an exact fit): it follows the measurement
noise and that *is* the lumpy look. Never let a fit place anchors freely either. Do what a designer does:

1. **Anchors only where the shape needs them:** the ends, each peak and trough, an extra one only at a real bend. A
   wave across a page needs 4–6 anchors per edge.
2. **Handles level at peaks and troughs** (vertical at leftmost/rightmost points), pointing forward, **⅓ to ½ of the
   segment** long. Short handles make near-corners; backward handles make loops.
3. **Fit** them to the measured points by least squares; a large error means a missing anchor at a bend.
4. **Keep the bend continuous:** equal curvature on both sides of an anchor; a tangent-continuous joint with a jump in
   curvature still reads as a corner.
5. **Shared stretches** are built once and used by every shape that has them.
6. A band = one edge forward, the other edge reversed, closed.

**`create_path {fit: points, tolerance}` does 1–3:** anchors at prominent extremes with level/vertical handles,
least-squares handles between, another anchor only where the curve misses a point by more than `tolerance`. Noisy
photo points: tolerance ≈ 3–4 px (2 follows the noise as bumps). **Units:** `tolerance` and `extend` are in the
points' units after `map` (with a px→mm map, 0.3–0.4 mm); without `map`, before `scale`.
- A band: `fit: [edge A, edge B reversed], closed: true` (lists joined by straight lines).
- **Shared stretches:** each list in `fit: [...]` is fitted on its own, so split an edge at the merge point and pass the
  *same* sub-list (same points, same tolerance) in every shape that uses it: identical curves, no slivers. End
  sub-lists where both run the same direction, or the joint shows a slight bend.
- **Joining pieces from different tracks into one edge** (an edge read partly from one track, partly from another):
  leave out the few points on each side of a steep join and let the fit bridge the gap; joining them point to point
  leaves a notch.
- **`create_path {d}`:** the path data is in its own units; `scale` multiplies it and `x`, `y` then **offset** it (they
  are not the top-left of its box). Path data from image px: `scale` = mm per px, `x, y` = where px (0, 0) lands.
- `extend: [start, end]` runs the ends on straight along their direction (past the bleed or under a clip); with
  several lists only the outer ends of an edge are extended. Don't extend a steep end that is really a fold (5b).
- Not done by the tool: the curvature term (item 4). A curve that still shows a bend at an anchor: add points there
  or write the fit yourself (plain JavaScript, never Python).

## 6. Colour

- `preview {image, sample: [[x, y, w, h], …]}` on flat areas: each colour alone, overlaps, the substrate.
- One global swatch per ink. Overlapping translucent shapes: `blend: "multiply"` with an opacity per shape, tuned so
  the sampled one-, two- and three-layer tones match; a second swatch for the deepest one if one ink can't do both.
  Keep a shape's own colour as it looks where it is alone.
- **Match the tonal extremes first** (darkest and lightest areas), then the mid-tones: the eye reads the contrast
  range; tuning to average tone (or rmse) flattens it. Take them in **evenly lit** parts of a photo: a dark spot in the
  photo's shade is lighting, not ink.
- **Match hue and saturation, not only lightness** (channel ratios, substrate included). A photographed or printed
  colour is duller than the ink's pure colour; when in doubt, go greyer.
- Flat files and screenshots: sample and use the colour as is (convert to CMYK for print). Photos: calibrate with a
  1:1 render (`preview {width}` = the crop's width) and samples at the same points of both images; expect one round
  (multiply in CMYK doesn't map simply onto RGB ratios: amber orange needed cmyk(0,48,100,0), more yellow than guessed).

## 7. Gradients, shading and shadows

Flat fills give the "8 colours" look. Measure the tone **inside** each region (a profile across it), then decide:

| Seen in the image | What it usually is | Build it as |
|---|---|---|
| Tone changing in one straight direction | Artwork (or lighting) | Linear/radial gradient swatch (`swatches {add, kind: "gradient"}`), fill `"gradient:Name@angle"` (90 = first stop at the bottom) |
| Tone changing across a curved shape, restarting at every edge | Artwork: soft shadow of the layer above (layered paper look) | A gradient **that follows the curve** (below) |
| A soft blob of shadow or glow | Artwork | Shape + `effects {blur}` (or `feather`), multiply or screen, clipped to where it falls |
| A thin light or dark line along an edge | Artwork: highlight / crease line | Stroke on that edge, 0.25–0.5 pt, screen or multiply, low opacity |
| Light across the whole object, folds, side faces, grain, reflections | Photo and material | Leave out of print artwork |

**Shade the regions you see, not the objects you built:** with overlapping translucent shapes the visible bands are
the spaces between consecutive edges, and each band shades from its own edge, whichever shape it belongs to. One
gradient over a whole wide shape, or a fixed-size blur, both failed.

**A gradient that follows a curve** (linear gradients can't; mesh and freeform gradients can't be scripted):
`create_path {fit: edge points, shade: {to: the next edge's points | a distance}, fill: shadow ink, opacity: strength,
clip_to: <the shape>}` builds it in one call: multiply steps of ~1.5 % (6–48 of them) from the edge (full strength) to
nothing just before `to`, inside a clip group masked by a copy of the shape, so the edge stays crisp with no hairline.
- **Shade every band whose tone changes across it** (shading only a few edges looked flat), each from its own edge.
- **Strength from the profile:** `1 − tone where the shading has faded ÷ tone at the edge`, roughly. First check that
  the shapes' own tones (where the shading has faded) match — otherwise the ink is off, not the shading. Fine steps
  matter more than the number: 50 % in steps of 4.5 % looked "very sharp and pixelated"; 38–55 % in steps of ≤ 2 %
  (the default) looked fine. An edge with strength under ~0.1 gets none.
- `to` follows **one** edge, only where it is seen (points jumping between edges make a ragged far side); past its
  points the shading runs on parallel. End a stack before its edge comes closer to another edge than the shading's
  depth (it runs under the other shape and makes a dark spot). Where two edges coincide, shade once (two stacks make a
  dark wedge).
- A stack ending inside the panel: `taper` (2–3 mm; longer shows fans). Along a steep stretch (> ~45°) the offsets show
  as contour stairs: start where the edge is flatter.
- Shadow ink warm and low in black (cmyk(0,50,100,15) under orange; K 40 looked grey and dirty). Shading darkens the
  base: lighten the shapes' own opacity after adding it.
- Check with numbers: render at 1 px per reference px and compare tone profiles across the bands at the same columns.

## 8. Compare — every round, two views

1. **Whole page:** `preview {reference, reference_crop: the face's pixel box}` → rmse, `content_box`, `differences`
   (shifted — with the shift and items —, missing, extra, changed).
2. **Close-up at full size:** `preview {region, max_px: 1400}` over the busy parts and **every corner and side**. The
   page view hides what matters: wrong letters, misaligned baselines, pointed tips, hairline slivers, loops, kinks,
   contour bands. `preview {region, reference, reference_crop}` compares one part side by side with its own rmse.
- **Count** in each close-up of the reference and your render: lines of text, grid rows, bands, icons. One missing is
  a whole missing part, and the page view and rmse barely show it.
- **Shifted parts:** move a set by the measured offset in one call — `transform_items {refs: "name:R2 Mini*", dx, dy}`
  (or `layer:` / a list of uuids) — instead of re-creating it.
- Change one thing per round (geometry, then colour). Stop when the close-ups are clean and what remains in
  `differences` is photo (folds, light, texture).
- **Don't steer by rmse alone.** Photo areas inside the crop (side faces, curls, light) can outweigh the artwork, and a
  bug that darkens where the photo is dark *lowers* rmse. Use it as a trend between rounds with the same crop **and the same render size** (keep `max_px` fixed: one artboard
  gave 0.153 at 1024 px and 0.134 at 400 px); decide
  tone questions by samples and profiles at fixed points. `content_box` gives a `note` instead of a shift when the
  two boxes differ in shape (a side face in the photo).
- **A tapered face mapped onto a rectangle:** the reference crop is the face's bounding box, your art fills the
  artboard, so the shapes can't line up and rmse stays high (`content_box` only notes that the shapes differ). Compare
  by close-ups at fixed points, or against the reference warped the same way.
- **Lost transparency** (a logo exported on black or white corners): those corners are not artwork and dominate rmse
  (a round emblem on black: ~0.46 from the corners alone). Judge by `content_box` and close-ups, or crop the
  comparison to a rectangle inside the artwork.

## 9. Finish

Name every shape and layer by role ("Background", "Logo", "Wave 2 (deep)", "Body copy"), put the cut or panel outline on
a non-printing "Dieline" layer, clip artwork that runs off the page to the bleed, `preflight`, save, leave the
document open, and report what differs from the reference and why (photo effects left out, placeholders, guessed
hidden parts, fonts substituted).
