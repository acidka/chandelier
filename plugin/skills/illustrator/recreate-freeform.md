# Recreate: free-form shapes (§ 5)

Part of the recreate method — the core (every job) is [recreate.md](recreate.md): § 0–2 set up and read the image, § 6 colour, § 8 compare, § 9 finish. This file: § 5 (5a–5c), for waves, blobs, swooshes and organic bands drawn by hand; with the `scene` tool listed, start with [recreate-scene.md](recreate-scene.md) (§ 5.0).

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
  *same* sub-list (same points, same tolerance) in every shape that uses it: identical curves, no slivers. Two paths
  fitted from different point lists that must meet: give both the same `anchors: [[x, y], …]` (the nearest measured
  point becomes an anchor). Joints get matching curvature on both sides automatically (within the tolerance). End
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
