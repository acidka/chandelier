# `scene` tool: implementation plan (0.6, S1–S4)

Status: plan, 2026-11-26. Spec: [scene-tool.md](scene-tool.md). Roadmap: [0.6](../roadmap.md#milestone--06--faster-free-form-recreation-).
Grounded in the repo at `59fc511`. Measured 2026-11-26 (macOS 27.2, Node 22): `node scripts/schema-size.mjs` →
35 tools, 55,790 chars; the budget test (`test/unit/server.test.ts`) is `< 56_000`, so 210 bytes are free.

## Owner decisions (2026-11-26)

| # | Decision | Choice |
|---|---|---|
| D-A / D-J | Schema budget and rollout | `scene` hidden behind `CHANDELIER_SCENE=1` while S1 is built (no budget cost); raise the budget to ~58.5 KB when it ships |
| D-B | Build geometry | **Stacked shapes**: lower regions run on under higher ones (no seams, print overlap); exact tiling only as an edit |
| D-G | S1 exit on case 04 | Speed win is enough: ≤ 5 min, ≤ 15 calls, < 100 k tokens, rmse no worse than v8 ± 0.01, no seams. Shading comes in S2 |
| D-H | Photo lighting | Flattened into flat colours by default; an edit turns a ramp back on for a region |

Still open (defaults used until the owner says otherwise): D-C z-order (filled area descending, lighter below darker),
D-D state location (server temp dir, `dir` to persist), D-E edits as strings, D-F reuse `batch` + `create_path`
(primitives as live `create_shape` objects?), D-I mention `scene` in server instructions / `recreate_design` prompt,
D-K overlap → multiply (hint + `layers` edit, not automatic).

## 0. What exists to reuse

| Need | Existing code | Gap |
|---|---|---|
| Decode, crop, resize, PNG encode, rmse | `src/image.ts`: `readImage`, `decodeImage`, `crop`, `resize`, `fitLongest`, `encodePng`, `compare`, `diffRegions` | No Lab, no labelling |
| Overlay drawing | `src/imageview.ts`: `view`, `contentBox`, `sampleAt`, `rgbToCmyk`; private `put()` / `label()` (3×5 digits font) | Export `put`, `label`; ids on the image are digits only |
| 4-point map | `src/fitcurve.ts` `projective(from, to)` | No bilinear quad map (case 03) |
| Curve fit | `fitCurve(pts, {tolerance, extend})` (endpoints exact → shareable junctions), `fitToD`, `shadeToD` | No fixed end tangents, no corner detection |
| Edge tracks | `src/edges.ts` `edgeTracks` | Not used by scene; stays the manual route |
| Build | `batch` (`src/tools/batch.ts`) → `A.cmd.batch` (one Apple event = one undo step, C10; `rollback`, `@n`); `create_path` (`makePath` in `paths.jsx`: `d`, `x`, `y`, `scale`, `fill_rule`, `items[]`); `swatches add` (global, idempotent); `layers add` (idempotent, bug #10); `delete_items` (`not_found` warning, bug #7) | Nothing new for S1; new items go in front, so emission order = z order |
| Colours | `A.color` accepts `lab(L,a,b)` | Live check: a global swatch holding Lab in a CMYK doc |
| Gradients | `swatches add kind:gradient`, `gradient:Name@angle` | No origin/length → S2 risk |
| Plumbing | `ToolDef.run()` (`src/tools/types.ts`), `src/tools/index.ts`, `Ctx.tmp`, `respond.ts` `BUDGET = 20_000` | — |
| Tests | Synthetic images in `test/unit/recreate-tools.test.ts`; live `test/live-lib.mjs` `connect()` + `guard()` | DOM shim can't create paths → build tests check generated steps |

Reference (read only, `tmp/`): case 04 `reference.jpg` 1122 × 1402, kraft box ~10 tone bands, some ΔE ≈ 4–8 apart.
v7: ~12 min, 61 calls, 203 k tokens. v8: 9.1 min, 46 calls, 156 k, rmse 0.178 on crop `[8,40,1087,1315]` with a
4-point map, owner: "perfect".

## 1. Tool surface

### 1.1 One tool, action enum

Folding into `preview`/`create_path` saves no bytes and confuses agents. `scene` is `run()`-only (not a batch step);
analyze/edit never touch Illustrator; build calls `rt.cmd('batch', …)` itself. Edits are strings in a small command
language parsed in Node (a typed union would cost +1.5 KB). Estimated cost ~1.8–2.0 KB.

### 1.2 Schema (`src/tools/scene.ts`)

```ts
const xy = z.array(z.number()).length(2);
shape: {
  action: z.enum(['analyze', 'edit', 'build', 'refine']),
  // analyze
  image: z.string().optional(),
  crop: z.array(z.number()).length(4).optional(),          // [x,y,w,h] image px
  map: z.array(xy).length(4).optional(),                    // face corners px: TL, TR, BR, BL
  bilinear: z.boolean().optional(),                         // per-row map (tapered face)
  size: xy.optional(),                                      // target aspect [w,h]
  colors: z.number().int().min(2).max(64).optional(),       // cap, default 16
  min_de: z.number().min(0).optional(),                     // merge floor, default 6
  detail: z.enum(['low', 'normal', 'high']).optional(),
  max_px: z.number().min(200).max(3000).optional(),         // working size, default 1000
  // edit / build / refine
  id: z.string().optional(),                                // "s1" or a scene.json path
  edits: z.array(z.string()).max(200).optional(),
  overlay: z.boolean().optional(),
  rect: z.array(z.number()).length(4).optional(),           // build target, session units (default the artboard)
  artboard: z.number().min(0).optional(),
  bleed: z.number().min(0).optional(),
  layer: z.string().optional(),                             // default "Scene"
  threshold: z.number().positive().optional(),              // refine ΔE, default 6
  dir: z.string().optional(),                               // where scene.json + labels.png live
}
```

Description draft (~1 KB):

> Image → editable vector scene; the pixel work happens here, Illustrator only at build. Image px until build.
> "analyze": image (PNG/JPEG); crop [x,y,w,h] px or map: 4 corners px (TL,TR,BR,BL) of a photographed face (bilinear: tapered face); size [w,h] target aspect; colors (max 16); min_de (6); detail low|normal|high → id, a 1-page summary (regions: id, colour, area %, kind, z, neighbours, confidence; hints) + overlay (ids on the image | flat preview).
> "edit": id, edits ["merge r3 r4", "drop r12", "r2 = swatch:Brand", "c1 = #d9822b", "r3 over r5", "r9 ellipse", "r7 text", "name r3 Wave", "tolerance r3 0.8", "show r40-r80"] → summary (overlay: true adds the image).
> "build": id; rect (default the artboard), bleed, layer ("Scene") → one undo step: global swatches + one path per region in z order; a re-build replaces the layer.
> "refine": id; threshold → error per region vs the image; bad edges re-fitted, rebuilt.
> dir: where scene.json is kept (default a temp folder).

### 1.3 Edit language (`src/scene/edits.ts`)

One command per string; `rN` region, `cN` colour group.

| Command | Effect | Stage |
|---|---|---|
| `merge r3 r4 [r5…]` | Union labels, recompute planar map | S1 |
| `drop r12` | Not drawn, stays in the stack (region below shows through) | S1 |
| `r2 = swatch:Brand` / `#hex` / `lab(…)` | Recolour one region (own colour group) | S1 |
| `c1 = swatch:Brand` / `#hex` | Recolour an ink group | S1 |
| `name r3 Wave 2`, `name c0 Kraft` | Item / swatch names | S1 |
| `r3 over r5` / `under` / `top` / `bottom` | Z order | S1 |
| `tolerance r3 0.8`, `tolerance 2` | Refit | S1 |
| `show r40-r80`, `show c2` | Extra summary rows | S1 |
| `stack off` | Exact tiling instead of stacked shapes | S1 |
| `r9 ellipse` / `circle` / `rect` / `rounded` / `line` / `polygon 6` / `r9 free` | Force or deny a primitive | S2 |
| `r4 ramp` / `r4 ramp radial` / `r4 flat` / `r4 shade r5` | Gradient, flat, curve-following shade | S2 |
| `layers r2 r5` | Whole multiply shapes over their overlap | S2 |
| `r7 text` / `text [x,y,w,h]` | Left out for live text; box reported at build | S4 |
| `r10 logo` / `r10 placeholder` | Constructed-logo hook / named empty box | S4 |

Edits are logged in `scene.edits` and applied to the model, never to source pixels.

### 1.4 Return shapes

analyze / edit → `[image (overlay PNG), text (summary)]`. Summary: one JSON line, then a fixed-column table (~2–3 KB):

```
{"id":"s1","file":"/…/s1/scene.json","px":[1000,1352],"regions":23,"colours":9,"edges":61,"anchors":212,"est_rmse":0.041,"ms":930}
id   colour   area%  kind     z  next           conf  c
r0   #e9cba1  41.2   flat     0  r1 r2 r5       .98   c0
r3   #d9822b   6.1   flat     4  r2 r4 r7       .91   c3   ramp? ΔL14 ↓
r9   #2a2a2a   0.4   ellipse 12  r8             .97   c5   31.5×31.2 px
… (largest 40; "+17 regions < 0.1 % (show r40-r80)")
colours: c0 #e9cba1 r0 r12 · c1 #f2b46a r1 r6 · …
hints: merge r14 r15 (ΔE 2.8) · r21 sliver 1.6 px · r3/r4/r5 on one tone line (ramp?)
```

Overlay PNG (≤ 1024 px): left the rectified image with fitted boundaries (1 px, contrasting) and ids at each
region's pole (≥ 0.3 % area or top 40, dots for the rest); right the flat render of the scene from our rasterizer.
Layout like `compare()`'s composite.

build → `{"id","layer","items","swatches","anchors","bytes","undo":"one step","rect","units","calls":1,"ms"}`,
S4 adds `text_boxes: [{r, rect, colour, cap_px}]`; batch warnings passed through.

refine → `[image (error heat map | after), text]` with `rmse_before`, `rmse_after`, `fixed: [{r, why, before, after}]`,
`left`, `checks: {darkest, lightest, max_anchors}`, `rebuilt`.

### 1.5 State between calls

- Memory: `Map<string, Scene>` in `src/scene/store.ts` (Lab image, label map, regions, edges, fits); ids `s1`, `s2`…
  per server (shared by subagents, bug #9 — fine, each scene has its own id).
- Disk, after every action: `<dir>/<id>/scene.json` (source path + sha1, rectify and analysis params, colours,
  regions with all flags, edits log, `built` record: doc, layer, rect, units, region → uuid) and `labels.png`
  (region id as 24-bit RGB). Edges and fits are recomputed on load (deterministic: seeded PRNG).
- Default `dir`: `<ctx.tmp>/scenes` (removed on exit). An agent passes `dir` (inside `tmp/` for real jobs) to persist;
  `id` may then be a `scene.json` path.

## 2. S1 algorithms (pure TS, typed arrays, no new deps)

Working image W×H, longest side `max_px` (1000). All geometry in working px.

### 2.1 Rectify (`rectify.ts`)

- `crop` → `crop()` + `fitLongest()`.
- `map` (projective): output aspect from `size`, else mean opposite-side lengths. Inverse map
  `projective(outCorners, srcCorners)`; 2×2 supersampled bilinear sampling.
- `bilinear: true`: src = (1−v)[(1−u)TL + u·TR] + v[(1−u)BL + u·BR].
- Returns `{img, toSource(u, v)}` (source px in hints). Pixels with `a < 128` → label −2, never built.

### 2.2 Colour and smoothing (`color.ts`, `smooth.ts`)

sRGB → linear (256 LUT) → XYZ D65 → Lab in three `Float32Array`s; ΔE76 (as `swatches recolor`). Bilateral filter on
Lab: σs ≈ 1.5 px (5×5), σr ≈ 5 ΔE; passes high 0 / normal 1 / low 2 (~0.2–0.3 s per pass). Flattens JPEG noise and
grain, keeps band edges.

### 2.3 Quantize (`quantize.ts`)

1. Histogram: Lab bins 1 (L) × 2 (a, b) in a `Map` (~5–30 k bins).
2. Weighted k-means on bins, k = `colors`; k-means++ seeded `mulberry32(1)`; ≤ 20 iterations or shift < 0.1.
3. Merge closest centres while ΔE < `min_de`; drop clusters < 0.01 % and reassign → effective k.
4. Assign bin → centre, pixel → bin (O(N)).

Hint: centre pairs with ΔE < 1.5 × `min_de` listed as merge candidates.

### 2.4 Regions (`regions.ts`)

1. 3×3 mode filter, 2 passes (normal).
2. 4-connected components, scanline union-find → `Int32Array regionMap`.
3. **Thin-sliver dissolve** (anti-aliasing rims quantize into 1–2 px ribbons): width = 2·area/perimeter < 2.0 px and
   ≥ 2 neighbours → BFS dissolve, each pixel to the adjacent non-thin region closest in smoothed Lab.
4. Small-region merge (priority queue by area): `min_area` = max(16 px, 0.02 % W·H) at normal, ×4 low, ÷4 high; into
   the min-ΔE neighbour, ties → longest shared boundary.
5. Neighbour merge when mean colours ΔE < `min_de`/2 (lighting splits).
6. Stats: area, bbox, centroid, mean/variance Lab, colour group, adjacency with shared crack length, pole (chamfer
   distance transform). Holes come from the planar map.
7. Confidence = min(homogeneity (share within ΔE 5), fit IoU).

### 2.5 Shared edges: planar map (`planar.ts`)

Crack-edge graph on the (W+1)×(H+1) lattice; outside = region −1.

- Cracks between 4-adjacent pixels with different labels (incl. outside).
- Junction: ≥ 3 distinct labels around a vertex (border counts outside), or a 2-label saddle (degree 4).
- Edges: follow crack chains junction to junction → `{id, left, right, j0, j1, pts}` (crack midpoints + exact
  junction vertices; midpoints straighten 45° staircases). Leftover cycles → `closed: true` edges.
- `loopsOf(set)`: edges with one side in the set, chained and oriented, → closed loops; signed area → outer/hole.
- Invariants (unit tests): 2 distinct sides per edge; all loops close; V − E + F = 1 + C.
- Bleed: border junctions/points pushed out by `bleed` at build.

### 2.6 Fitting the edges (`fitedges.ts`, small `fitcurve.ts` change)

Each edge fitted **once**; every shape that uses it reuses the same `Seg[]` (reversed as needed) → watertight.

1. Corners: resample at 1 px; turning angle over ±4 points; local max > 45° with both arms straight (< 0.5 px off the
   chord over 8 points); split there (free tangents → sharp joint).
2. Junction pairing: at degree 3 the most opposite pair (> 150°) is a through-curve and shares the averaged tangent;
   the third meets freely (also closes the roadmap's "fixed merge anchors" for scene builds).
3. Closed loops: start at a corner, else the topmost point with a horizontal tangent on both ends.
4. Edges ≤ 3 cracks → straight segment.
5. `fitCurve(pts, {tolerance, t0?, t1?})`; tolerance 1.0 px normal, 2.0 low, 0.6 high; per-region override.
6. `fitcurve.ts`: `FitOpts.t0?/t1?` (fixed unit end tangents), export `P`, `Seg`, `bez`, `segsToD(loops, closed)`.
   Backwards compatible.

### 2.7 Z order and stacking (`stack.ts`) — D-B: stacked

- Z: filled area (holes filled) descending → encloser below enclosed; tie: lighter below darker; edits override.
- Drawn shape Mᵢ = connected component of {regions with z ≥ zᵢ} containing i; boundary = edges with one side in Mᵢ.
- Why: lower solid fill under every upper anti-aliased edge → no hairline seams on screen, overlap against
  misregistration in print; whole layered shapes as designers draw; background = one rectangle; dropped/text regions
  are filled by the shape below.
- Residue: where an edge (j, k) lies on Mᵢ's boundary with z_k < zᵢ < z_j, i's colour leaks ≤ f(1−f) ≤ 25 % of one
  pixel row, on screen only. Unit-tested.
- Tiling (`stack off`): one shape per visible region, abutting.
- Holes in Mᵢ → compound path, `fill_rule: 'evenodd'`. Cost ~1 ms per region.

### 2.8 Own rasterizer (`raster.ts`)

Adaptive Bézier flattening (0.25 px), scanline fill (nonzero/evenodd), 4 sub-scanlines with exact horizontal
coverage. Used for `est_rmse`, the overlay's right half, per-region fit IoU, S3's predicted error.

### 2.9 Performance targets (Node 22, Apple Silicon, 1000 × 1250)

| Stage | Target |
|---|---|
| Decode JPEG 1122 × 1402 | ≤ 150 ms |
| Rectify | ≤ 80 ms |
| Lab + bilateral (1 pass) | ≤ 350 ms |
| k-means + assign | ≤ 120 ms |
| Mode, CC, dissolve, merges, stats | ≤ 250 ms |
| Planar map + fit (~300 edges) | ≤ 300 ms |
| Raster + est_rmse + overlay + PNG | ≤ 250 ms |
| **analyze** | **≤ 1.5 s at 1000 px; ≤ 3 s at 1500 px** |
| edit (re-planar + refit) | ≤ 0.5 s |
| Memory | ≤ 60 MB |

Unit tests: lenient (< 5 s at 1000²); real numbers from `bench/scene-bench.mjs`.

## 3. S2, S3, S4

### S2: primitives and tone ramps (`primitives.ts`, `ramps.ts`)

Primitives (gated by IoU of mask vs rasterized primitive):
- Ellipse/circle: moments → axes and angle; IoU > 0.97 and mean boundary distance < 2 % of radius; circle if axes
  within 3 %.
- Rect: min-area rectangle by rotating calipers; IoU > 0.97; snap axis-aligned under 1°.
- Rounded rect: rect IoU 0.90–0.97 → r = √(missing corner area / (4 − π)); accept at IoU > 0.97.
- Line: width ≤ 3 px, length/width > 8; stroke = area / length.
- Regular polygon: hull + Douglas–Peucker, n = 3–8, sides and angles within 5 %.

Edges stay shared: junctions projected onto the analytic outline; each edge becomes the primitive's sub-arc. The
primitive is drawn as itself (a `create_shape` step at its z), not as Mᵢ.

Tone ramps:
1. Ramp merge: adjacent regions on one Lab line with roughly parallel shared edges → merge while R² > 0.9 and
   residual < ΔE 3.
2. Linear: least squares Lab = a + bx + cy; angle atan2(c, b); 2 stops (3 if a quadratic term is significant).
3. Radial: L = a + bx + cy + d(x² + y²); centre (−b/2d, −c/2d); accept if ΔR² > 0.05 over linear.
4. Shade along an edge (tone vs distance to one boundary edge fits better than a plane) → existing `shadeToD` inside
   a clip group (`clip_to` in `paths.jsx`); strength from measured tones (recreate.md § 7's rule, computed).
5. Photo mode (D-H: default on for photos, detected from bilateral residual noise): ramps folded into flat colours
   unless an edit asks for `ramp`.

Gradient span risk: `gradient:Name@angle` sets only the angle. Probe the default span live; remap stops to the bbox
projection; else add origin/length to `A.setFill` (`core.jsx`, ES3, lint) or fall back to `shade`.

Overlap → multiply (D-K: hint + `layers` edit): region colour ≈ a·b/s (linear RGB, s = substrate) flagged
"≈ r2 × r5"; the edit makes r2/r5 = union(own, overlap), overlap dropped, fill a/s at multiply 100 %, tuned by S3.

### S3: `refine` (`refine.ts`)

1. Render: `rt.cmd('preview', {region: rect, width: W, path})` → `decodePng` (own raster as fallback).
2. Per region: tone ΔE inside the region eroded 2 px; shape IoU vs label mask (painter-order id buffer); per-edge max
   distance to the sub-pixel image edge (smoothed L along normals ±3 px, 50 % crossing); anchors and curvature
   jumps; darkest/lightest region vs reference (the "rmse vs owner" risk).
3. Fix flagged regions only (tone > `threshold`, IoU < 0.95, edge deviation > 2 × tolerance): refit bad edges from
   sub-pixel points at half tolerance; correct the colour group by weighted mean error (global swatch → every use);
   report still-low IoU as "merge or split?".
4. Rebuild in one build call; before/after.

### S4: hooks, guide, docs

- `r7 text` / `text [x,y,w,h]`: glyph regions dropped (the region below fills the box); build returns `text_boxes`
  (rect in session units, colour, cap height) for the agent's `create_text`.
- `r10 logo`: region and higher sub-regions grouped "Logo r10", primitives first, lower tolerance. `r10 placeholder`:
  named empty rect.
- `plugin/skills/illustrator/recreate.md` § 5 starts from `scene` (corners via `preview {image, grid}`, analyze, read
  overlay, edits, build, compare, refine); manual `profile`/`fit` stays as fallback. `SKILL.md`, `recreate_design`
  prompt (D-I), `docs/plan.md` tool table + D15.

## 4. Build side (D-F: reuse batch)

No new runtime code in S1. `buildSteps(scene, opts)` (pure, `src/scene/build.ts`) → steps sent as **one**
`rt.cmd('batch', {steps, stop_on_error: true, rollback: true}, {timeout})` → one undo step (C10), rollback on failure.

1. `delete_items {refs: "layer:<layer>"}` — re-runnable (first run: `not_found` warning, bug #7).
2. `layers {action: "add", name: layer}` — idempotent (bug #10).
3. `swatches {action: "add", kind: "global", name, color: "lab(L,a,b)"}` per used colour group without a `swatch:`
   mapping; hex fallback if Lab in a global swatch misbehaves live.
4. Region shapes in z ascending: `create_path {layer, x, y, scale: [sx, sy], fill_rule: "evenodd", stroke: "none",
   items: [{d, fill: "swatch:…", name, note: "scene s1 r3"}]}`, ≤ 1500 items per step; `d` in working px, 2 decimals;
   `sx = rect.w / W`, `sy = rect.h / H`. S2 inserts `create_shape`, gradient swatches and shade stacks
   (`clip_to: "@n"`) at their z.
5. Default `rect`: one read-only `artboards list` in the same tool call; `artboard` → the step's `settings.artboard`
   (D5 coordinates).

Region → uuid map read from `results[i].data.items` into `scene.built`.

Limits: ~150 regions × 25–40 segments × ~45 chars ≈ 150–250 KB (shared edges written twice). 1 MB scripts measured
fine on Windows (W1). Over 1.5 MB → split into n batches, `undo: "n steps"` + warning, suggest `detail: low` /
`merge`. Time: ~13 k DOM writes for 150 shapes, est. 1–4 s, measured in the live test.

Rejected for now: a dedicated ES3 `scene_build` runtime builder (compact geometry, no duplicated edge text) —
duplicates `makePath`; revisit if live timings or payloads are bad.

## 5. File-by-file

New:
- `src/scene/types.ts`: `Scene`, `Region`, `Edge {id, left, right, j0, j1, pts, closed, segs}`, `Params`, `SceneFile`.
- `src/scene/color.ts`: `rgbToLab`, `labToRgb`, `de76`, `labHex`, `labSpec`.
- `src/scene/rectify.ts`: `rectify(img, {crop?, map?, bilinear?, size?, maxPx})`.
- `src/scene/smooth.ts`: `bilateral(lab, w, h, {sigmaS, sigmaR, passes})`.
- `src/scene/quantize.ts`: `quantize(lab, w, h, {colors, minDe, seed}) → {centres, k, labels}`.
- `src/scene/regions.ts`: `modeFilter`, `components`, `dissolveThin`, `mergeSmall`, `mergeSimilar`, `regionStats`,
  `adjacency`, `poles`.
- `src/scene/planar.ts`: `planarMap`, `loopsOf`, `relabel`.
- `src/scene/fitedges.ts`: `corners`, `pairJunctions`, `fitEdges`.
- `src/scene/stack.ts`: `zOrder`, `stacked`.
- `src/scene/raster.ts`: `rasterize(shapes, w, h, {evenodd, ids?})`.
- `src/scene/overlay.ts`, `summary.ts`, `edits.ts` (`parseEdit`, `applyEdits`), `store.ts` (`put`, `get`, `save`,
  `load`), `analyze.ts` (`analyze`, `recompute`), `build.ts` (`buildSteps`).
- S2: `primitives.ts`, `ramps.ts`. S3: `refine.ts`.
- `src/tools/scene.ts` (`ToolDef` with `run()`).
- Tests: `test/unit/scene-fixtures.ts`, `test/unit/scene-*.test.ts`, `test/live-scene.mjs`.
- `bench/scene-bench.mjs <image> [--map …]` (stdout only).

Edits: `src/fitcurve.ts` (t0/t1, exports); `src/imageview.ts` (export `put`, `label`); `src/tools/index.ts` (`scene`
only when `CHANDELIER_SCENE=1`, D-A); `test/unit/server.test.ts` (budget at release); `src/server.ts` (S4, D-I);
S2 if needed `src/runtime/core.jsx` `A.setFill`; docs (§ 7).

## 6. Tests

### 6.1 Unit (synthetic images generated in-test; painted at 4× and downsampled → real anti-aliasing; seeded noise; optional `jpeg-js` q 80 round trip)

| File | Checks |
|---|---|
| `scene-rectify` | Quad corners within 1 px; rows stay straight (projective, bilinear); crop + `max_px` |
| `scene-quantize` | 5 colours + noise → k = 5, centres within ΔE 2; ΔE-3 pair merges at `min_de` 6, not at 2; deterministic |
| `scene-regions` | Same-colour blobs → 2 regions, 1 group; no salt; **no sliver regions from AA rims**; ring → one hole; small-merge to min-ΔE neighbour |
| `scene-planar` | T configuration → 3 edges, junctions right; 2 sides per edge; loops close; Euler; island → closed edge |
| `scene-fit` | AA circle r 100 → ≤ 8 anchors, < 1 px; square → 4 sharp corners, straight sides; T through-pair tangent-continuous; loop starts top with level handle; old `fitCurve` tests unchanged |
| `scene-stack` | Raster matches labels on ≥ 98.5 %; **seam test** (stacked: no edge pixel > 8 lighter than both sides over white; tiling shows seams); encloser below enclosed |
| `scene-analyze` | Poster fixture: exact region count, `est_rmse` < 0.02, anchor budget, summary ≤ 3 KB with JSON first line, overlay ≤ 1024 px; 1000² with 50 shapes < 5 s |
| `scene-edits` | Each command; errors name the edit index; `show` changes nothing |
| `scene-build` | Delete-layer first; swatches once per group; z order; scale/x/y from rect; bleed; chunking > 1500 items / 1.5 MB; `rollback: true`; `scene.run` build against a stub ctx |
| `scene-store` | Save → load identical edges and fits; `id` as a path |
| S2 `scene-primitives` | Ellipse, circle, rect 12°, rounded r 20, line, hexagon within 1 %; wavy blob → free |
| S2 `scene-ramps` | Linear square → angle ±2°, stops ΔE 2; radial centre 2 px; bands merged; a·b/s flagged |
| S3 `scene-refine` | Edge at tolerance 4 flagged and halved; colour shifted ΔE 8 corrected |

### 6.2 Live `test/live-scene.mjs` (`connect('live-scene')`, guard)

Synthetic PNG in a temp dir → `documents new` (mm) → analyze → build (layer, item count, global swatches, one call) →
`history undo` empties the layer (one undo step), redo → `preview {reference}` rmse < 0.05 and a full-size close-up of a
shared edge without seams → second build same count → refine nothing above threshold → `merge` + rebuild one item
fewer → close without saving. Prints build ms and payload bytes. Not in `test:live` unless the owner wants it.

### 6.3 Evaluation on case 04 (docs/recreate-testing.md: one artboard per run, fresh subagent, Chandelier tools only)

| Arm | What |
|---|---|
| A | v8 / v7 baselines (benchmarks § 2g/2h) |
| B | Fresh subagent with `scene` (S1), same task card: time, calls, tokens, rounds, rmse on the same crop and map, anchors, objects, swatches, close-ups (seams, kinks), darkest/lightest tones, owner's verdict |
| C | Image Trace via `path_ops {op: "trace"}` on the same crop |
| D | B after S2/S3 |

**S1 exit (D-G)**: B ≤ 5 min, ≤ 15 calls, < 100 k tokens, rmse ≤ v8 + 0.01, no seams. Flat bands accepted; the
owner's verdict recorded as is. Plus `bench/scene-bench.mjs` on the four suite references → benchmarks § 2i.

## 7. Docs (same commit as each change)

- `docs/roadmap.md`: tick S1–S4 with dated results, change-log row per task; "Curve fit, rest" notes shared stretches
  solved for scene builds.
- `docs/plan.md`: tool table row `scene`, status/tool count, **D15** (Node-side pipeline, state on disk, stacked
  shapes; pros/cons), testing table.
- `docs/research/scene-tool.md`: status, decisions, measured numbers (dated, with environment).
- `plugin/skills/illustrator/recreate.md` + `SKILL.md`: scene first (S4; short S1 note earlier).
- `docs/research/benchmarks.md` § 2i; `docs/recreate-testing.md` (tool list, what to record).
- `README.md` at release (tool count, feature, numbers from benchmarks); `docs/README.md` status and research row.
- `AGENTS.md`: `node test/live-scene.mjs`, `node bench/scene-bench.mjs <image>`, `CHANDELIER_SCENE=1`.
- `docs/bugs.md`, `docs/research/illustrator-quirks.md`: live findings (gradient span, Lab global swatch).

## 8. Work breakdown

| # | Task | Effort | Depends |
|---|---|---|---|
| 1 ✅ | `fitcurve.ts` t0/t1 + exports; `imageview.ts` exports; tests — done 2026-11-26 | 0.5 d | — |
| 2 | `color.ts`, `rectify.ts` + tests | 0.75 d | 1 |
| 3 | `smooth.ts`, `quantize.ts` + tests | 1 d | 2 |
| 4 | `regions.ts` + tests | 1.5 d | 3 |
| 5 | `planar.ts` + invariant tests | 1.5 d | 4 |
| 6 | `fitedges.ts` + tests | 1 d | 1, 5 |
| 7 | `stack.ts`, `raster.ts`, est_rmse + seam tests | 1.5 d | 6 |
| 8 | `summary.ts`, `overlay.ts`, `analyze.ts` + analyze/perf tests | 1 d | 7 |
| 9 | `edits.ts` (S1), `store.ts` + tests | 1 d | 8 |
| 10 | `build.ts`, `src/tools/scene.ts` behind `CHANDELIER_SCENE=1`; plan.md row + D15 | 1 d | 9 |
| 11 | `test/live-scene.mjs`, `bench/scene-bench.mjs`; live tuning (payload, timing, Lab swatch) | 1 d | 10 |
| 12 | S1 evaluation on case 04 (arms B, C), benchmarks § 2i, roadmap S1, recreate.md note | 1 d + owner | 11 |
| 13 | S2a primitives + shared arcs + `create_shape` emission | 1.5 d | 12 |
| 14 | S2b ramps, gradient-span probe (+ `A.setFill`), shade along edge | 2–2.5 d | 12 |
| 15 | S2c overlap → multiply; arm D partial | 1.5 d | 14 |
| 16 | S3 `refine` + tests + live | 2.5 d | 12 |
| 17 | S4 hooks; guide, SKILL.md, prompt, plan.md, README; budget raised, flag removed; full suite run | 2 d + runs | 13–16 |

Total ≈ 22–25 days of focused work plus owner reviews; S1 (1–12) ≈ 12 days.

### Risks

1. Over-segmented photos (lighting, grain, folds, JPEG) → rectify first, bilateral, thin dissolve, ΔE merges,
   `detail: low`, agent `merge`, photo mode.
2. Bands closer than `min_de` (case 04: ΔE 4–8) merge and a ribbon is lost (v5's failure) → hints list near pairs,
   overlay ids, agent lowers `min_de`; maybe default 4 for photos (tune on case 04).
3. Corner misfires → straight-arm test, per-region tolerance, S2 primitives.
4. Stacked-mode AA fringe (≤ 25 % of a pixel row, screen only) → documented, unit-measured.
5. Illustrator speed/payload on big scenes → live measurement, chunking, fallback runtime builder.
6. Gradient span not settable → shade stacks or flat.
7. Lab in a global swatch converts oddly → hex / `rgbToCmyk` fallback; S3 colour correction.
8. Schema budget → flag until release (D-A).
9. rmse vs the owner's judgement → refine's shape/tone checks; owner judges per case.
10. Determinism / CI timing → seeded PRNG, lenient bounds, bench for real numbers.
