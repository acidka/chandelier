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
| Free-form shapes: waves, blobs, swooshes, organic bands, overlapping translucent layers | packaging backgrounds, decorative bands, abstract art | § 5 |
| Colour that must match (inks, overlaps, a printed or photographed surface) | anything photographed or printed | § 6 |
| Gradients, shading, shadows, glows | illustrations, layered paper looks | § 7 |
| A photo of a real object or a mockup (perspective, folds, light) | product photos, box and bag mockups, desk/wall mockups | § 1 (flat shape and box) |

The failure agents make most often, whatever the kind: **guessing instead of measuring** (sizes, positions,
curves), and **copying the photo instead of the artwork** (light, folds and perspective drawn as if they were print).

## 0. Set up for comparing

Skip what already exists (a document, a reference artboard): reuse it.

- `documents new` at the artwork's real size (units mm or in, bleed). Name layers by role.
- Put **the reference on its own artboard left of the work**, at the same scale and aligned to it, on a locked,
  non-printing layer "Reference": `artboards {add, rect}` + `place {path, x, y, w, layer}` + `layers {update,
  locked}`. The user compares side by side in Illustrator; previews and exports never show it.

## 1. Read the image: artwork vs photo, flat shape and box

- `preview {image, grid: true}` (no Python/PIL/Swift/sips): pixel size, ppi, `content_box` (the page in a scan or
  photo). `region` zooms a part (up to 8×), `sample` reads colours, `page` renders a PDF or .ai page.
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
- **Font size ≈ cap height in px ÷ 0.7 × S** (x-height ÷ 0.5 for lowercase text). Weight from stroke thickness
  against the cap height; width from a known word's length.
- Fonts match fuzzily (`fonts {query}` when unsure). A missing font: the closest installed one, then match widths with
  `horizontal_scale` so lines break where the reference breaks. Body copy goes in area text.
- Give every text its paragraph style and every colour its swatch, so the file can be restyled.
- Tables and calendars: `create_text {grid}` with column props; check the content (dates, weekdays, totals) — a
  correct-looking grid with a wrong first weekday is the classic miss.
- Check alignment and spacing in a close-up against the reference: baselines on one line, equal gaps, rules where they
  start and end.

## 4. Logos, icons and geometric marks

- Look for the **construction** first: circles, arcs, rectangles, regular polygons, equal strokes, symmetry axes,
  repeated angles. Build from primitives (`create_shape`) and booleans (`path_ops` unite / minus_front / intersect),
  not from traced outlines; measure the few numbers that define them (radii, stroke widths, angles, centres).
- Symmetric marks: build one half and mirror it (`duplicate_items` + `transform_items {reflect}`), then unite.
- Organic parts of a mark (a leaf, a nut, a hand-drawn shape): § 5's measuring and fitting — few anchors, smooth
  curves.
- Wordmarks: set them in the closest font first (script, geometric, slab…) and compare letter widths and slant; only a
  custom lettering that no font approaches gets drawn, and then as a placeholder or a simplified version you say is one.
- Check the mark alone, large (`preview {refs, max_px}`), next to the reference crop: anchor count, symmetry, smooth
  joins. Fewer anchors and cleaner geometry beat a closer but lumpy trace.

## 5. Free-form shapes — measure, decompose, fit

Where agents usually fail: lumpy "camouflage" or "mountain" outlines instead of smooth curves, and guessed shapes.

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
  that band's **shading ending**, not a thin shape (§ 7).
- **An edge that changes owner** (one shape's edge runs along another's for part of its length, then leaves it): build
  the shape with the shared edge, then cut it with `path_ops {op: "minus_front"}` and a cutter whose edge is the
  separate stretch; the shared stretch stays identical and the result keeps its fill, opacity and blend.
- A band whose tone changes **along** its length with no edge is a gradient fill, not an extra shape.

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
  they really cross. An edge that ends under another shape: anchor its end **on** that edge, with a free angle.

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
- Change one thing per round (geometry, then colour). Stop when the close-ups are clean and what remains in
  `differences` is photo (folds, light, texture).
- **Don't steer by rmse alone.** Photo areas inside the crop (side faces, curls, light) can outweigh the artwork, and a
  bug that darkens where the photo is dark *lowers* rmse. Use it as a trend between rounds with the same crop; decide
  tone questions by samples and profiles at fixed points. `content_box` gives a `note` instead of a shift when the
  two boxes differ in shape (a side face in the photo).

## 9. Finish

Name every shape and layer by role ("Background", "Logo", "Wave 2 (deep)", "Body copy"), put the cut or panel outline on
a non-printing "Dieline" layer, clip artwork that runs off the page to the bleed, `preflight`, save, leave the
document open, and report what differs from the reference and why (photo effects left out, placeholders, guessed
hidden parts, fonts substituted).
