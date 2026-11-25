# Recreating a design from an image — the full method

Read this before rebuilding artwork from a photo, mockup, scan or screenshot. It is general: flat layouts, type,
and above all **free-form shapes** (waves, ribbons, blobs, swooshes, organic bands), where agents usually fail by
producing lumpy "camouflage" or "mountain" outlines instead of smooth curves.

Worked through on a real job (2026-11-25, Illustrator 29.1, macOS): a photographed kraft box front with five
overlapping translucent wave ribbons. RMSE against the photo went 0.116 → 0.100 in six rounds of shape and colour, then 0.095 with
shading; every mistake below was made there once. A second agent then rebuilt it from this guide alone (smooth result,
9 rounds, ~24 min) and a third with the updated guide (~16 min, 7 rounds). The owner judged the second one best: it
kept the panel's real shape, followed what the ribbons do at the panel edges and kept crisp band-to-band contrast —
even though its rmse was not the lowest. A fourth run (~25 min, 8 rounds) still lost to it: it kept one uniform scale
on a given artboard the panel didn't fit, so the panel shape broke (only one slanted side, ribbons running past it);
its colours came out redder than the photo; its ribbon ends hooked down past the panel; and extra pieces (split
shapes, fade shapes, many shading strips) showed as fans and seams. Those lessons are folded in below (§ 1, § 2, § 3,
§ 5, § 5b, § 6). A fifth run with the measuring, fitting and shading tools (`profile`, `fit`, `shade`) took ~12 min
and 3 small helper scripts (none for measuring or fitting); judged better than the fourth, still behind the second: it
missed a small ribbon in a corner and looked flat (3 shaded edges). Its gaps are in § 1, § 3, § 4 and § 5b. How these tests are run:
`docs/recreate-testing.md` in the repository.

## 0. Set up for comparing

Skip what already exists (a document, a reference artboard) — reuse it.

- `documents new` at the artwork's real size (units mm or in, bleed). Name layers by role.
- Put **the reference on its own artboard left of the work**, at the same scale and aligned to it, on a locked,
  non-printing layer "Reference": `artboards {add, rect}` + `place {path, x, y, w, layer}` + `layers {update,
  locked}`. The user compares side by side in Illustrator; previews and exports never show it.

## 1. Read the image — separate artwork from photo

- `preview {image, grid: true}` (no Python/PIL/Swift): pixel size, `content_box` (the page in a scan or photo).
- Decide what is **print artwork** and what is **the photo**: perspective, folds and creases, curls, side faces,
  shadows, highlights, paper texture. Recreate only the artwork (flat, at its real size); mention what you left out.
- **Find the artwork's flat shape and its box** before measuring anything:
  - Use the dieline if you have one. Otherwise the outline of the face as photographed *is* the panel shape when the
    face is seen nearly head-on (a tapered box front is a real trapezoid — keep it). The box is the shape's bounding
    box: S comes from its width (here the trapezoid's bottom), and the artboard is that box at S.
  - **Visible perspective** (parallel edges converging, a far side clearly shorter): map every measured point through a
    4-point projective transform (the face's four corners → the flat panel) before fitting. Don't stretch the photo.
  - **One uniform scale** when you choose the artboard: `S = artwork width in units ÷ that width in px`, the same for
    x and y; make the artboard the box at that scale.
  - **The artboard is given** (a dieline, a set size, a task that names it) and the photographed panel's aspect
    differs: the given size is the truth, and the photo is foreshortened (taken from above or at an angle). Map the
    panel's outline in the photo **onto** the panel on the artboard — its corners to the artboard's panel corners
    (scale x and y separately, or a 4-point projective map when it tapers). Then the whole shape fits and the
    artwork follows it. Don't keep a uniform scale and let the panel overflow or centre it: a run that did lost the
    panel's shape (one side cut off) and was judged worse than the run that mapped the panel onto the artboard
    (x and y 12 % apart), which kept the shape and looked best.
  - The box excludes what isn't this face: side faces, flaps, the table. That box is also your `reference_crop` —
    and it must hold the **whole** face: a crop that cuts one side off (the face's bottom running past it) loses that
    side's slant, and the result shows one slanted side only.
  - A side that isn't straight in the photo (concave, bowed by the board) is usually the photo; draw the die's
    straight side and let the clip take the 1–2 mm difference — or follow it when the dieline says so.
  - `create_path` has one `scale`: for x and y apart, map the points yourself (multiply x and y, or the 4-point map)
    before `fit`. The bleed outline = the panel outline offset outward by the bleed (`path_ops {offset}`).
  - **Keep the object's shape:** the background/substrate (paper, board colour) fills the panel's real outline (the
    trapezoid) plus bleed, and the artwork is clipped to it — outside stays empty, as on the die. Filling the whole
    rectangle made the result read as a poster instead of this box front (the run the owner liked least on this
    point). **One clip for everything:** the substrate *and* every shape sit in one clip group with the panel
    outline, so no shape shows outside any side (a run with ribbons clipped to the bleed rectangle showed them past
    the slanted side). In a batch: `arrange_items {action: "clip", refs: ["layer:…" or "@n"…], mask: <outline>}`
    (the mask is the outline path; it must be a path or compound). The outline also goes on a non-printing "Dieline" layer.
  - Creases and folds of the object (a faint curve that crosses other edges without changing their layer count, a
    shaded flap, a curl) are not artwork: leave them out and say so.
- Place paths with `create_path {d, scale: S, x, y}` so you can keep working in image pixels.

## 2. Decompose into layers

- List the parts back to front. Overlapping translucent shapes are **layers with multiply**, not separate flat
  bands: where two shapes overlap the tone is darker; draw the shapes whole and let the overlap make the step.
- Count layers from the tones: going down a column, each edge is a shape starting (darker) or ending (lighter). The
  **size of the tone step** tells how many shapes start or end there (a step twice the usual = two shapes end
  together). Assign every edge to its shape this way, not by guessing what "looks like" one band.
  Shading darkens the tone right under top edges, so step sizes vary between columns: read the tone **at the bottom
  of each band** (where its shading has faded) and count from that, not from the step right at the edge.
- **Prefer the fewest whole shapes that explain the tones.** Splitting a shape into lobes, or adding a fade-in shape
  for a band whose count seems to change, cost one run most of its analysis time and left seams; the preferred run
  used whole shapes and let opacity and shading absorb the rest.
- The count can disagree along one edge (one layer on the right, two on the left — lighting, a merge). Decide by the
  majority of columns and fix the rest with opacity and shading; don't split the shape.
- When steps alone don't tell, compare each region's tone with the bare paper's: the multiply factor per channel
  (region ÷ paper) is about the product of the shapes over it, so it shows how many and which.
- A band whose tone changes **along** its length with no edge is a gradient fill (a gradient swatch whose stops fade
  in opacity), not an extra shape.

## 3. Measure edges densely — never invent

- **`preview {image, profile: true}` measures for you:** tone profiles down the columns (`rows: true`: along rows,
  for steep edges), every tone step linked into a **track** — `{id, tone, above, below, pts}`, drawn on the image
  with its id. `tone` is the lightness step (+ = lighter below), `above`/`below` the colours either side: the layers.
  Points come every `step` px (default width ÷ 60); keep it at **25–50 px or less** — sparse points (every
  100–150 px) leave the fit too free: pointed tips and bulges. Add `region` for one part, `min` (default 8) to skip
  weak steps. A track may join two edges where they meet or cross; split it there (check the overlay).
  Points are image px: map them to the artboard with your factor (§ 1) before drawing.
- Where an edge is hidden (under another shape, off the page), **leave a gap**. Don't fill it with guessed points:
  invented points make shoulders and straight stretches. **But under translucent (multiply) shapes nothing is
  hidden:** the edge shows through as a tone step — look for it in a `profile` with a lower `min`, or sample across.
  A long gap (≥ ~300 px) in a fitted list puts a corner where it starts; bridge it with a few points measured
  through the shape on top.
- `profile` tracks stop 20–60 px short of the panel sides (the profile needs room); add the last points from a
  `region` close-up, or `rows: true` for steep ends. **Corners hide small shapes:** thin bands that narrow into a
  side make short tracks (under 5 points they are dropped) — a run missed a whole small ribbon at the bottom-left
  this way. Run `profile` on a `region` around every corner and side (a smaller region = denser points), and count
  the bands there in the close-up against your build. A track can run on from one edge into a crease or another edge:
  check the overlay and cut its points there.
- Where two edges coincide in the reference (two ribbons merging, a shape ending on another's edge), they are **one
  shared curve**: build that stretch once and reuse it in both shapes. Two separate measurements 2 px apart leave a
  visible hairline sliver.
- **Measure right up to the panel edge, and reproduce what shapes do there.** In the photo the ribbons turned down at
  the right side as they wrapped over the fold and started at the slanted left side; the run that measured right to
  the edges and kept that looked like the object, the runs that extended straight did not. Fits that stop 30–70 px
  short need long extensions, which show as kinks and straight stretches. Check each corner in a close-up.
  The turn at a side is **gentle and cut by the panel outline**: the shape bends a little and the clip ends it. A run
  that drew the full wrap of the fold (ends bending 80–95° down, rounded, running past the side) got hooks — that
  much bend is the photo's fold, not artwork.
- **Extend shapes past the bleed by continuing the end curve itself** (evaluate the last cubic a little beyond t = 1;
  with `fit`: append 2–3 points along the end's direction, out past the bleed),
  then straight along its end tangent; stop steepening once the slope passes ~1.6 — unless the end is already
  steeper, then keep its own tangent (capping it makes a kink). An end tangent pointing backward is a fit error:
  refit with a knee anchor before extending. A plain straight line from a short fit shows; a zero-length extension
  leaves a horizontal stub at the edge.
- **Edges that seem to cross** (a bottom edge running into another shape's top edge): sample the tone in the thin gap
  between them on both sides of the meeting point. One layer's tone on both sides → they merge (one shared curve from
  there); the tone changes → one continues hidden (leave its gap, § 3 above); two layers' tone → they really cross.
  A tone step about twice the usual size on one curve also means two shapes start or end there: they share it.
- An edge that ends under another shape: anchor its end point **on** that shape's edge with a free angle; forcing it
  tangent there gave 25 px errors.

## 4. Draw smooth curves — designer anchors, fitted

Never draw a curve through the measured points (polyline, Catmull–Rom, or an exact curve fit): it follows the
measurement noise and that *is* the lumpy look. Never let a fit place anchors freely either: on noisy data it makes
kinks, loops and straight bridges over gaps. Do what a designer does, then fit:

1. **Anchors only where the shape needs them:** the two ends, each peak and trough, and an extra one only at a real
   bend (a knee). A wave across a page needs 4–6 anchors per edge.
2. **Handles horizontal at peaks and troughs** (vertical at leftmost/rightmost points), forward-pointing everywhere
   (angle within ±75° of the direction of travel), **length ⅓ to ½ of the segment** (0.3–0.55). Short handles make
   near-corners; backward handles make loops.
3. **Fit** the anchors' positions, angles and the handle factor to the measured points (least squares). Report the
   mean error: ≤ 0.5 % of the shape's width is good; a large error means a missing anchor at a bend — add one there.
   Practical details: keep anchor x fixed and fit y; measure each handle's angle relative to the chord to its
   neighbouring anchors (then ±75° means "forward"); start the handle factor at 0.38. A steep end bending into a
   flat run needs its own knee anchor, or the close-up shows a kink there.
4. **Keep the bend continuous:** at each anchor the curvature on both sides should be about equal (add the squared
   jumps to the fit's cost). A tangent-continuous joint with a jump in curvature still reads as a corner. Weight: with
   the cost in px² (mean squared distance) and curvature in 1/px, a weight of ~4·10⁵ on the summed squared jumps
   keeps the fit within ~1 px of what it was while removing visible bends.
5. **Shared stretches:** where an edge merges into another (§ 3), the merge anchor is *fixed* to the base curve's point
   and tangent there; fit only the edge's own part, then append the base curve's segments from that anchor on (split
   the base Bézier there if needed, de Casteljau).
6. A band = its top edge left→right, then its bottom edge right→left, closed.

**`create_path {fit: points, tolerance}` does 1–3:** anchors at the prominent peaks and troughs (level handles) and
leftmost/rightmost points (vertical handles), least-squares handles in between, a further anchor only where the curve
misses a point by more than `tolerance` (default 1, in the points' units; 2–4 for noisy photos gives fewer anchors).
A band: `fit: [top, bottom reversed], closed: true` (lists joined by straight lines). For noisy photo points use
tolerance **4** (2 followed the noise as bumps). **Shared stretches (item 5) with `fit`:** each list in `fit: [...]` is
fitted on its own, so split an edge at the merge point into sub-lists and pass the *same* shared sub-list (same points,
same `tolerance`) in every shape that uses it: the curve comes out identical, no slivers. A different tolerance in one
shape changes the curve and brings the slivers back; the joint between two sub-lists is a straight segment, so end
them where both run the same direction (or the joint shows a slight bend). Not done by it yet: the curvature term
(item 4) — for that, or a curve that still shows a bend, write the fit yourself (plain JavaScript, never Python).

## 5. Colour

- `preview {image, sample: [[x, y, w, h], …]}` on areas with one layer, two layers, three…, and on the paper.
- One global swatch per ink; overlapping shapes: `blend: "multiply"` with an opacity per shape, tuned so the sampled
  one-, two- and three-layer tones match. If one ink cannot give both the clean light layers and the dark overlaps
  (light needs no black, deep needs some), use a second swatch for the deepest shape.
- Colour where shapes pile up comes from the overlap, not from the shape: keep a shape's own colour as it looks
  where it is alone.
- **Match the tonal extremes first:** sample the darkest overlap and the lightest band, get those two right, then the
  mid-tones. The eye reads the contrast range; tuning to average tone (or rmse) flattens it — a run that matched the
  mid-tones best still looked flat because its darkest spot came out 124 instead of 81.
  Take the extremes **in evenly lit parts** of the photo: a dark spot inside the photo's shading (the side turning
  away from the light) is lighting, not ink — an orange multiply ink can't reach it without black, and chasing it
  makes everything too deep.
- **Match hue and saturation, not only lightness.** Compare each sample's channel ratios (R:G:B, or hue and chroma),
  substrate included: a run whose lightness was close came out visibly redder and more saturated than the muted
  photo, and its kraft looked peach. A photographed print is duller than the ink's pure colour; when in doubt, go
  greyer.
- Calibrate with the 1:1 render (`preview {width}` = the crop width) and samples at fixed points of both images — the
  same check as § 5b.
- Expect one calibration round: multiply in a CMYK document doesn't map simply onto the photo's RGB ratios (both test
  runs needed a more yellow ink than the first guess, e.g. cmyk(0,48,100,0) for amber orange). Sample, adjust once,
  sample again.

## 5b. Shading, gradients and shadows

Flat fills give the "8 colours" look. Measure the tone **inside** each region (a profile across it), then decide per
effect what it is:

| Seen in the image | What it usually is | Build it as |
|---|---|---|
| Tone changing across a curved shape, restarting at every edge | Artwork: soft shadow of the layer above (paper-cut, layered look) | A gradient **that follows the curve** (below) |
| Tone changing in one straight direction | Artwork or lighting | Linear/radial gradient swatch (`swatches {add, kind: "gradient"}`), fill `"gradient:Name@angle"` (Illustrator's convention: 90 = first stop at the bottom) |
| A soft blob of shadow or glow | Artwork | Shape + `effects {blur}` (or `feather`), multiply, clipped to where it falls |
| Thin light or dark line along an edge | Artwork: edge highlight / crease | Stroke on that edge, 0.25–0.5 pt, screen (light) or multiply (dark), low opacity |
| Light falling across the whole object, folds, side faces, grain | Photo and material (the board itself) | Leave out of print artwork; a substrate preview goes on its own layer |

**Shade the regions you see, not the objects you built.** With overlapping translucent shapes, the visible bands are
the spaces between consecutive edges; in the worked job every band darkened toward its own top edge, whichever shape
it belonged to. Shading per object (one gradient over a whole wide shape) or a fixed-size blur (thin bands drown)
both failed.

A gradient that follows a curve (linear gradients can't; mesh and freeform gradients can't be scripted):
**`create_path {fit: edge points, shade: {to: next edge's points | distance}, fill: shadow ink, opacity: strength}`**
builds items 1–4 in one call: N multiply steps (6–16, ~2 % each; `steps` to override) whose near side is the exact
fitted edge (crisp, no clip needed) and whose far side stops k/(N+1) of the way to `to` (window minimum and smoothing
of the distance built in). Pass only the stretch of the next edge **seen** there; group the steps afterwards. Item 3's
cap and end tapers are still yours (shorten `to`'s points, or clip). The near side is exact only when the shade's
`fit` list (and tolerance) is identical to the shape's own edge; otherwise a hairline shows. **The recipe that worked
best (v5):** fit the shade from the shape's own edge points lifted ~1.5 px, then clip the stack to a copy of its
shape (`duplicate_items` the shape, `arrange_items {action: "clip"}` with the copy as mask): crisp edge, no hairline,
no seam where the stack ends. Where two edges coincide (a shape's top running along another's), shade it once: two
stacks there double up as a dark wedge. The method behind it:
1. Under each edge, N stacked multiply layers in one shadow swatch; layer k (1…N) is bounded by the curve
   `edge + k/(N+1) × (distance to the next visible edge below)` — darkness falls to zero just before that edge. Use
   k/(N+1), not k/N: the last step exactly on the next edge leaves a hairline sliver. This is what Illustrator's Blend
   does between two paths.
2. Clip the stack with the region under the **exact** Bézier edge: the edge stays crisp. The inner steps (polylines
   every ~1 mm) are invisible only when they are many and weak: **12–16 steps of 3.5–7 % each**; 8 steps of 8–14 %
   show as contour bands in a close-up.
   Offset the steps vertically and let the clip shape the ends; offsets along the normal fold back into facets where
   the edge turns steep.
   **Clip each stack to its own band** (between its edge and the next edge below), not to "everything under the
   edge": where the shading stops (a shape that pinches out, a merge) it otherwise spills into the band below and
   cuts a vertical seam.
   Keep it crisp: each band's shading should reach its full strength right under its edge and fade before the next
   edge, so light bands stay light under dark ones — that band-to-band contrast is the layered-paper look.
3. The distance to the next edge: only edges **seen** there (measured, not a model's hidden stretch — a hidden edge
   cuts a seam), smoothed along the edge (±60 px window) so merges and crossings don't make vertical seams; capped
   (~160 px) so near the panel sides it doesn't reach edges far below; no edge below (paper) → no shade.
   Take a window **minimum** (±40 px) of the distance before smoothing: where a new edge appears below, the band
   clip jumps, and a plain smoothed distance leaves a seam there. A stack that ends inside the panel tapers to zero
   over 30–60 px, or it leaves a vertical seam. Hand-built strips: every strip and stack end is a chance for a fan or
   seam. With `shade` clipped to a copy of its shape (above) there are no seams, so **shade every band whose tone
   changes across it** — a run that shaded only 3 of ~9 band edges was judged flat (v5); the owner's favourite
   shaded every band.
   Shadow ink: warm and low in black, e.g. cmyk(0,50,100,15) under orange; an ink with K 40 looked grey and dirty.
4. Opacity per step ≥ ~1.5 %: Illustrator drops smaller steps entirely (a 12 % gradient in 28 steps rendered as
   nothing). So: weak gradients (≤ 10 %) 6–8 steps; strong ones 12–16 steps (item 2). An edge whose strength
   (item 5) is under ~0.1 gets no shading at all.
5. Strength per edge from the profile: `1 − tone at the band's bottom ÷ tone at its top`, roughly (multiply).
   Shading darkens the base, so lighten the shapes' own opacity after adding it.

Check with numbers, not by eye: render at exactly 1 px per reference px (`preview {width}` = the crop's width in px;
with one uniform scale, § 1, x and y map the same way) and compare tone profiles across the bands with the
reference's at the same columns.

## 6. Compare — every round, two views

1. **Whole page:** `preview {reference, reference_crop: the page's pixel box}` → rmse, `content_box`,
   `differences` (shifted / missing / extra / changed with the items).
2. **Close-up at full size:** `preview {region, max_px: 1400}` over the busy part. The page view hides exactly the
   defects that matter here: pointed tips, hairline slivers, loops, corners, straight bridges. Look for them every
   round.

**Count the bands** in each corner close-up of the reference and of your render: one missing there is a whole
missing shape (the page view and rmse barely show it).

Change one thing per round (geometry, then colour). Stop when the close-up is clean and what remains in
`differences` is photo (folds, light, texture) — rmse stops improving there (0.100 → 0.101 on the worked job).

**Don't steer by rmse alone.** Photo areas inside the crop (shaded side faces, curls, creases, lighting) can weigh
more than all the artwork together, and a geometry bug that happens to darken where the photo is dark *lowers* rmse
(a test run went 0.122 → 0.098 from broken curve ends smeared along a shaded side face, and back when fixed). Use
rmse only as a trend between rounds with the same crop; treat a sudden drop after a geometry change as suspicious and
look at the close-up; decide tone questions by profiles at fixed columns. `content_box` compares the content's
bounds, each against its own background; when the two boxes differ in shape (a side face or curl in the photo)
it gives a `note` instead of a shift and scale. `save_to` keeps the render; the comparison goes to `<name>.compare.png`.

## 7. Finish

Name every shape and layer by role ("Ribbon D (deep)", "Kraft paper"), put the cut or panel outline on a
non-printing "Dieline" layer, clip artwork that runs off the page to the bleed, save, leave the document open, and
report what differs from the reference and why (photo effects left out, guessed hidden parts).
