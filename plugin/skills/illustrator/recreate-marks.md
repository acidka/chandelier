# Recreate: logos, icons and geometric marks (§ 4)

Part of the recreate method — the core (every job) is [recreate.md](recreate.md): § 0–2 set up and read the image, § 6 colour, § 8 compare, § 9 finish. This file: § 4, for logos, icons, badges and wordmarks.

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
  In a scene, `r8 stroke` does this for a band region (centreline + measured width; `r8 fill` undoes it) — check the
  width in the summary (`stroke 6.1`) against a close-up.
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
