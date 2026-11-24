# Recreating a design from an image — the full method

Read this before rebuilding artwork from a photo, mockup, scan or screenshot. It is general: flat layouts, type,
and above all **free-form shapes** (waves, ribbons, blobs, swooshes, organic bands), where agents usually fail by
producing lumpy "camouflage" or "mountain" outlines instead of smooth curves.

Worked through on a real job (2026-11-25, Illustrator 29.1, macOS): a photographed kraft box front with five
overlapping translucent wave ribbons. RMSE against the photo went 0.116 → 0.100 in six rounds of shape and colour, then 0.095 with
shading; every mistake below was made there once.

## 0. Set up for comparing

- `documents new` at the artwork's real size (units mm or in, bleed). Name layers by role.
- Put **the reference on its own artboard left of the work**, at the same scale and aligned to it, on a locked,
  non-printing layer "Reference": `artboards {add, rect}` + `place {path, x, y, w, layer}` + `layers {update,
  locked}`. The user compares side by side in Illustrator; previews and exports never show it.

## 1. Read the image — separate artwork from photo

- `preview {image, grid: true}` (no Python/PIL/Swift): pixel size, `content_box` (the page in a scan or photo).
- Decide what is **print artwork** and what is **the photo**: perspective, folds and creases, curls, side faces,
  shadows, highlights, paper texture. Recreate only the artwork (flat, at its real size); mention what you left out.
- One scale factor: `S = artwork width in units ÷ width in px`. Place paths with `create_path {d, scale: S, x, y}`
  so you can keep working in image pixels.

## 2. Decompose into layers

- List the parts back to front. Overlapping translucent shapes are **layers with multiply**, not separate flat
  bands: where two shapes overlap the tone is darker; draw the shapes whole and let the overlap make the step.
- Count layers from the tones: going down a column, each edge is a shape starting (darker) or ending (lighter). The
  **size of the tone step** tells how many shapes start or end there (a step twice the usual = two shapes end
  together). Assign every edge to its shape this way, not by guessing what "looks like" one band.

## 3. Measure edges densely — never invent

- Measure **every 25–50 px** along the shape (a column or row profile of the image: positions where the tone steps).
  Sparse points (every 100–150 px) leave the fit too free: pointed tips and bulges.
- Where an edge is hidden (under another shape, off the page), **leave a gap**. Don't fill it with guessed points:
  invented points make shoulders and straight stretches.
- Where two edges coincide in the reference (two ribbons merging, a shape ending on another's edge), they are **one
  shared curve**: build that stretch once and reuse it in both shapes. Two separate measurements 2 px apart leave a
  visible hairline sliver.
- Extend shapes that leave the page past the bleed, following their direction.

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
4. **Keep the bend continuous:** at each anchor the curvature on both sides should be about equal (add the squared
   jumps to the fit's cost). A tangent-continuous joint with a jump in curvature still reads as a corner.
5. A band = its top edge left→right, then its bottom edge right→left, closed; `create_path {d}`.

The fit is ~80 lines of plain JavaScript (Nelder–Mead over the free parameters); write it once per job in a Node
script, never in Python.

## 5. Colour

- `preview {image, sample: [[x, y, w, h], …]}` on areas with one layer, two layers, three…, and on the paper.
- One global swatch per ink; overlapping shapes: `blend: "multiply"` with an opacity per shape, tuned so the sampled
  one-, two- and three-layer tones match. If one ink cannot give both the clean light layers and the dark overlaps
  (light needs no black, deep needs some), use a second swatch for the deepest shape.
- Colour where shapes pile up comes from the overlap, not from the shape: keep a shape's own colour as it looks
  where it is alone.

## 5b. Shading, gradients and shadows

Flat fills give the "8 colours" look. Measure the tone **inside** each region (a profile across it), then decide per
effect what it is:

| Seen in the image | What it usually is | Build it as |
|---|---|---|
| Tone changing across a curved shape, restarting at every edge | Artwork: soft shadow of the layer above (paper-cut, layered look) | A gradient **that follows the curve** (below) |
| Tone changing in one straight direction | Artwork or lighting | Linear/radial gradient swatch (`swatches {add, kind: "gradient"}`); a fill re-assigned with the same gradient keeps its old angle — rotate it with `item.rotate(a, false, false, true, false)` |
| A soft blob of shadow or glow | Artwork | Shape + `effects {blur}` (or `feather`), multiply, clipped to where it falls |
| Thin light or dark line along an edge | Artwork: edge highlight / crease | Stroke on that edge, 0.25–0.5 pt, screen (light) or multiply (dark), low opacity |
| Light falling across the whole object, folds, side faces, grain | Photo and material (the board itself) | Leave out of print artwork; a substrate preview goes on its own layer |

**Shade the regions you see, not the objects you built.** With overlapping translucent shapes, the visible bands are
the spaces between consecutive edges; in the worked job every band darkened toward its own top edge, whichever shape
it belonged to. Shading per object (one gradient over a whole wide shape) or a fixed-size blur (thin bands drown)
both failed.

A gradient that follows a curve (linear gradients can't; mesh and freeform gradients can't be scripted):
1. Under each edge, N stacked multiply layers in one shadow swatch; layer k is bounded by the curve
   `edge + k/N × (distance to the next visible edge below)` — darkness falls linearly to zero at that edge. This is
   what Illustrator's Blend does between two paths.
2. Clip the stack with the region under the **exact** Bézier edge: the edge stays crisp, the inner steps (polylines
   every ~1 mm) are too soft to see.
3. The distance to the next edge: only edges **seen** there (measured, not a model's hidden stretch — a hidden edge
   cuts a seam), smoothed along the edge (±60 px window) so merges and crossings don't make vertical seams; no edge
   below (paper) → no shade.
4. Opacity per step ≥ ~1.5 %: Illustrator drops smaller steps entirely (a 12 % gradient in 28 steps rendered as
   nothing). Use fewer, stronger steps for weak gradients.
5. Strength per edge from the profile: `1 − tone at the band's bottom ÷ tone at its top`, roughly (multiply).
   Shading darkens the base, so lighten the shapes' own opacity after adding it.

Check with numbers, not by eye: render at exactly 1 px per reference px (`preview {width}`) and compare tone
profiles across the bands with the reference's at the same columns.

## 6. Compare — every round, two views

1. **Whole page:** `preview {reference, reference_crop: the page's pixel box}` → rmse, `content_box`,
   `differences` (shifted / missing / extra / changed with the items).
2. **Close-up at full size:** `preview {region, max_px: 1400}` over the busy part. The page view hides exactly the
   defects that matter here: pointed tips, hairline slivers, loops, corners, straight bridges. Look for them every
   round.

Change one thing per round (geometry, then colour). Stop when the close-up is clean and what remains in
`differences` is photo (folds, light, texture) — rmse stops improving there (0.100 → 0.101 on the worked job).

## 7. Finish

Name every shape and layer by role ("Ribbon D (deep)", "Kraft paper"), put the cut or panel outline on a
non-printing "Dieline" layer, clip artwork that runs off the page to the bleed, save, leave the document open, and
report what differs from the reference and why (photo effects left out, guessed hidden parts).
