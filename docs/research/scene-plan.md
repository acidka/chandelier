# `scene` tool: implementation plan (0.6, S1–S4)

Status: plan, 2026-11-26. Spec: [scene-tool.md](scene-tool.md). Roadmap: [0.6](../roadmap.md#milestone--06--faster-free-form-recreation-).
Grounded in the repo at `59fc511`. Measured 2026-11-26 (macOS 27.2, Node 22): `node scripts/schema-size.mjs` →
35 tools, 55,790 chars; the budget test (`test/unit/server.test.ts`) is `< 56_000`, so 210 bytes are free.

## Owner decisions (2026-11-26)

| # | Decision | Choice |
|---|---|---|
| D-A / D-J | Schema budget and rollout | `scene` hidden behind `CHANDELIER_SCENE=1` while S1 was built (no budget cost); flag lifted 2026-11-27, budget 59.5 KB (58.9 KB with `scene`) |
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
| 2 ✅ | `color.ts`, `rectify.ts` + tests — done 2026-11-26 | 0.75 d | 1 |
| 3 ✅ | `smooth.ts`, `quantize.ts` + tests — done 2026-11-26 | 1 d | 2 |
| 4 ✅ | `regions.ts` + tests — done 2026-11-26 | 1.5 d | 3 |
| 5 ✅ | `planar.ts` + invariant tests — done 2026-11-26 | 1.5 d | 4 |
| 6 ✅ | `fitedges.ts` + tests — done 2026-11-26 | 1 d | 1, 5 |
| 7 ✅ | `stack.ts`, `raster.ts`, est_rmse + seam tests — done 2026-11-26 | 1.5 d | 6 |
| 8 ✅ | `summary.ts`, `overlay.ts`, `analyze.ts` + analyze/perf tests — done 2026-11-26 | 1 d | 7 |
| 9 ✅ | `edits.ts` (S1), `store.ts` + tests — done 2026-11-26 | 1 d | 8 |
| 10 ✅ | `build.ts`, `src/tools/scene.ts` behind `CHANDELIER_SCENE=1`; plan.md row + D15 — done 2026-11-26 | 1 d | 9 |
| 11 ✅ | `test/live-scene.mjs`, `bench/scene-bench.mjs`; live tuning (payload, timing, Lab swatch) — done 2026-11-26 | 1 d | 10 |
| 12 🔄 | S1 evaluation on case 04 (arms B, C), benchmarks § 2i, roadmap S1, recreate.md note — run 1 on 04 and 08 (§ 2i), fixes made; suite re-run next | 1 d + owner | 11 |
| 13 ✅ | S2a primitives + shared arcs + `create_shape` emission — done 2026-11-26 | 1.5 d | 12 |
| 14 ✅ | S2b ramps, gradient-span probe (+ `A.setFill`), shade along edge — done 2026-11-26 | 2–2.5 d | 12 |
| 15 ✅ | S2c overlap → multiply; arm D partial — done 2026-11-26 | 1.5 d | 14 |
| 16 ✅ | S3 `refine` + tests + live — done 2026-11-26 | 2.5 d | 12 |
| 17 🔄 | S4 hooks; guide, SKILL.md, prompt, plan.md, README; budget raised, flag removed; full suite run — hooks, guide § 5.0, SKILL.md, plan.md done 2026-11-26; prompt (D-I), README, budget and flag wait for the release after the live check (11) and evaluation (12) | 2 d + runs | 13–16 |

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

## 9. Findings from the suite runs (2026-11-26)

Runs and numbers: [benchmarks § 2i](benchmarks.md). Status: ⏳ open · ✅ fixed (commit on `feature/scene`).

### Tool errors

| # | Status | Seen in | Problem |
|---|---|---|---|
| F1 | ✅ | 04 v9, 08 v1 | JPEG fringes became hundreds of sliver regions; lumpy, camouflage-like edges |
| F2 | ✅ | 08 v1 | a full-resolution crop of flat art was flagged `photo: true` |
| F3 | ✅ | 08 v1 | no bulk drop (no ranges, no "by size"): ~600 letter regions dropped by a generated list |
| F4 | ✅ | 08 v1 | a dropped region's area went to whatever ran under it (the globe became a red disc) |
| F5 | ✅ | 08 v1 | `rN circle` ignored / ended as an ellipse when other shapes sat on the region |
| F6 | ✅ | 04 v9 | refine averaged a shared ink over photo-shaded regions (amber pulled ΔE 19 towards brown) |
| F7 | ✅ | 04 v9 | refine kept rebuilds that its own estimate rated worse |
| F8 | ✅ | 08 v1 | refine re-fitted hundreds of edges of dropped regions; very long output |
| F9 | ✅ | 08 v1 | `tolerance rN` overridden by refine's tightened edges |
| F10 | ✅ | 08 v1 | `c0 = swatch:Name With Space` lost the spaces; the build failed |
| F11 | ✅ | 08 v1 | build created its layer at the bottom (hidden under other art) |
| F12 | ✅ | 04 v9 | edits add up with no undo |
| F13 | ✅ | 04 v9 | summary's segment count 2–3× below what the build wrote; dropped regions still listed as inks |
| F14 | ✅ | 04 v9 | `layers rA rB` suggested for inks that can't be multiply (gave a red ink) |
| F15 | ✅ | 08 v2 | no way to remove lost transparency: now `drop … fill none` leaves the area empty |
| F16 | ✅ | 08 v2 | `edit {overlay: true}` showed the analyzed labels: the overlay now outlines what is drawn after the edits and labels only drawn regions |
| F17 | ✅ | 08 v2 | refine's tightened tolerances (0.4) follow JPEG noise; its rmse never moved in run 2 → fixed 2026-11-27: refine re-measures each tightened edge and keeps its tolerance when the tighter fit doesn't come ≥ 15 % closer (reported "tolerance kept") |
| F18 | ✅ | 08 v1, v2 | thin constant-width outlines come out as lumpy filled bands (both runs redrew them as stroked centrelines) → fixed 2026-11-27: `rN stroke` edit: Zhang–Suen skeleton → centreline (loop or longest path, spurs pruned), width = area ÷ length, built as one stroked path (miter joins, butt caps); `rN fill` back |
| F19 | ✅ | 08 v2 | forcing `circle` on a disc whose outline is only partly round throws the fit 5 mm off → fixed 2026-11-27: a forced circle is fitted to the round stretch only (trimmed least squares) |
| F20 | ✅ | 04 v10 | `create_path {map}` is projective, the scene maps bilinear: hand-built parts sat ~40 px off until the agent wrote its own map → fixed 2026-11-27: `create_path {map: {from, to, bilinear: true}}` maps like the scene (inverse bilinear); guide § 1 says when |
| F21 | ✅ | 04 v9, v10 | first build to a new layer warned "Nothing found for layer:…": a new layer gets no delete step |
| F22 | ✅ | 04 v9 | ramps rendered with jagged bits in Illustrator that the own render didn't show → fixed 2026-11-27: two causes, both fixed: the ramp hint listed only the first 6 bands (the rest stayed flat stripes) — now every band as ranges; and the gradient stops assumed Illustrator spans the box width, while it spans the outline's own extent along the angle (measured live: ellipse 300 × 200 at 30° → 278.5) — angled ramps had flat ends; error inside a 70° ramp 5–11 → 2–5 (of 255) |
| F23 | ⏳ | 08 v2 | `scene` used far more calls than the baseline on flat art (16 scene + 34 other vs 19 in total) |
| F24 | ✅ | 06 v2 | `refine` / rebuild replaced the whole layer: now only its own items (hand-added items stay), and regions whose items were deleted stay dropped (`dropped_deleted`) |
| F25 | ⏳ | 06 v2 | a part crop cuts every shape crossing the crop edge square (the ground swoosh's ends; tips added by hand) |
| F26 | ✅ | 06 v2 | the default analyze of one flat ink rendered as foil: 12 inks, 817 regions: hint "photo with N inks: … colors = that number" |
| F27 | ✅ | 09 v3 | `cN = cM` (documented) failed "use swatch:Name, #rrggbb, lab(L,a,b) or cN": now moves every region of cN to cM |
| F28 | ✅ | 09 v3 | a crop of soft-shaded petals came back `photo: true` (lighting flattened); no switch to turn photo mode off → fixed 2026-11-27: `analyze {photo: false}` keeps shading as ramp hints (`true` forces photo mode; default: detected) |
| F29 | ✅ | 09 v3 | no ramp hints on hat, skin or petals (soft gradients): all gradients built by hand → fixed 2026-11-27: ramp test measured above the regions' own noise: gradients found at noise σ 1–8 (lost at 8 before), steps never |
| F30 | ✅ | 09 v3 | every build / refine put the scene layer on top: `position` for a new layer; an existing layer stays where it is |
| F31 | ✅ | 09 v3 | refine on a 426-region scene reverted everything while listing 8 disagreeing inks → fixed 2026-11-27: refine keeps the kind of fix that helps (only the inks or only the edges, `reverted: "edges"|"inks"`) instead of undoing everything |
| F33 | ✅ | 06 v3 | build failed on a degenerate tiny region ("item 106: The path has no drawable segments") and rolled back: one-segment loops are now left out, a region with nothing drawable is skipped |
| F34 | ✅ | 06 v3 | dark counters inside a `text` box (D, A, R, O) were drawn white (no filler: their only neighbour, the letter, was skipped too): a skipped region takes the filler of the skipped one it sits on |
| F35 | ✅ | 06 v3 | no edit to drop every region inside a box: `drop in x y w h [fill …]` |
| F36 | ✅ | 06 v3 | crown leaves touching a dropped frame line belong to the line's region and go with it (no split edit) → fixed 2026-11-27: `split rN in x y w h`: the part of rN in the box becomes a new region with the same ink |
| F37 | ✅ | 06 v3 | `max_px` doesn't upscale a small crop: `detail: high` can't add resolution → fixed 2026-11-27: `max_px` given: a smaller crop or face is upscaled to it (default unchanged: never above the source pixels, so ids stay) |
| F38 | ⏳ | 09 v4 | a crop of soft-shaded petals is a patchwork at any `colors` / `min_de` |
| F39 | ⏳ | 09 v4 | `drop < %` threw away most of the bracelet (jewellery-scale detail) |
| F40 | ✅ | 09 v4 | analyze overlays of small crops too small to read: enlarged up to 4× |
| F41 | ✅ | 09 v5 | a rebuild left items from the first build (r143–r151): the runtime lists 100 created items per step, the build recorded only those — steps now hold ≤ 100 items, leftovers found by name are cleared; live test with 170 items |
| F42 | ✅ | 09 v5 | refine "corrected" a skin-shadow ink (ΔE 26.8) into a dark brown patch → fixed 2026-11-27: one region missing its ink by more than 2.5 × threshold (ΔE 15) is reported in `left`, not "corrected" |
| F43 | ✅ | 09 v5 | the overlay of a 620 px image was shrunk to ~500 px per half: overlays up to 1600 px |
| F44 | ✅ | 09 v5 | `text_boxes` cap height (25.3 mm for the title) doesn't match the real caps → fixed 2026-11-27: `cap` = the text letters' height (75th percentile of their heights), not the box height |
| F45 | ✅ | 05 v2 | refine on a one-ink part reports darkest = lightest (meaningless) → fixed 2026-11-27: `checks` leave out darkest / lightest when they are one ink |
| F46 | ✅ | 05 v1, v2 | `get_items {points}` on a compound path fails with MRAP (twice in both runs) → fixed 2026-11-27: not reproduced (no MRAP in 3 live tries); the real gap: `points` gave no points for compound paths — now `subpaths [{closed, path}]` |
| F47 | ✅ | 09 v6 | `text_boxes` gave the caption's ink as `#ffffff` (the text is dark grey) → fixed 2026-11-27: the text ink is the one whose regions lie inside another ink's region (letters on the paper), else the one contrasting most with what it sits on, not the largest region |
| F48 | ✅ | 09 v6 | `drop in x y w h` dropped nothing when the patch is part of a large region (a black blob under the brim that belongs to the sweater's r1) → fixed 2026-11-27: nothing wholly inside: the error names the regions the box cuts; `drop in x y w h fill rF` repaints their part of the box with rF |
| F49 | ✅ | 09 v6, v7 | the summary has no region positions: agents map overlay labels back to px to pick ramp / drop ids (a `where` box column, or ids by point) → fixed 2026-11-27: summary column `where` = region box in analyzed px; guide § 5.0 step 1 |
| F50 | ✅ | 09 v7 | `text_boxes` `cap` equals the box height (10.16 / 24.19 mm), not a cap height (as F44) → fixed 2026-11-27: as F44 |
| F51 | ⏳ | 09 v7 | a part scene's crop edge shows as a square seam where its hair meets the main scene's black |
| F32 | ✅ | 09 v3 | small features inside skin facets (lips) become straight-sided: their outline is cut into edges of ≤ 5 points → fixed 2026-11-27: an edge of ≤ 5 points that bows ≥ 0.5 px is fitted as a curve with the junction tangents |

Other tools: bugs.md #16 (`path_ops` box frame in batch steps; not reproduced), #17 (preflight lists every shade step; fixed 2026-11-27); `fonts` found
no family match for "Myriad Pro Bold" when only Myriad Variable Concept is installed (no suggestion) — fixed 2026-11-27: a font that is not found lists up to 6 installed faces whose family starts with the same word.

### Guide gaps (recreate.md)

| # | Status | Seen in | Gap |
|---|---|---|---|
| G1 | ✅ | 04 v9, 08 v1 | when to leave the scene for the manual method (§ 5.0) |
| G2 | ✅ | 04 v9 | map sides on a box with wrapped edges; `max_px` / re-analyze changes ids; merge keeps the first ink |
| G3 | ✅ | 08 v1 | text on a circle (§ 3); dropping letter regions under ring text |
| G4 | ✅ | 08 v1 | building one part from a crop of it (§ 5.0 step 5) |
| G5 | ✅ | 08 v1 | lost transparency makes rmse meaningless (§ 8) |
| G6 | ✅ | 04 v9 | opaque stacked bands without slivers (§ 5a); an edge ending on another (§ 5b) |
| G7 | ✅ | 08 v2, v3 | constant-width outlines → stroked centreline (mean of the two edges), miter joins; corner = centreline intersection (a miter overshoots by w / (2 sin(θ/2))); `path_ops outline_stroke` for a fill |
| G8 | ✅ | 08 v2 | force a primitive only when the whole outline is that primitive; otherwise keep it free and fix the round stretch |
| G9 | ✅ | 08 v2, v3 | text size without capitals: x-height ÷ the font's x-height ratio; top and bottom arcs may differ; match the span by the first and last letters' angles; ring text not always centred on the disc |
| G10 | ✅ | 08 v3 | flat logos: read the structure from `region` + `grid` zooms first; profile tracks jump between shapes' edges (use them for coordinates only, split where the colour pair changes) |
| G11 | ✅ | 08 v3 | interlocking bands that change colour along their length: layer order, the top band's corner makes the colour boundary |
| G12 | ✅ | 08 v3 | small illustrative detail inside a mark (continents): how much to keep, how to read it |
| G13 | ✅ | 08 v3 | `create_path d`: say that x, y offset the path data (not a box's top-left) |
| G14 | ✅ | 04 v10 | the "weak step = shading ending" rule: check in a close-up whether the step is crisp (a thin band) or soft |
| G15 | ✅ | 04 v10 | joining edge pieces from different tracks: drop points near a steep join and let the fit bridge it |
| G16 | ✅ | 04 v10 | comparing a tapered face mapped onto a rectangle: rmse stays high (compare with the warped reference) |
| G17 | ✅ | 04 v10 | keeping only the substrate from a scene and removing the rest cleanly |
| G18 | ✅ | 04 v9 | `refine` changes named inks (global swatches) silently — say so, or leave named inks alone |
| G19 | ✅ | 06 v2 | one flat ink rendered with material (foil, emboss, print on texture): analyze with `colors` = the number of flat inks |
| G20 | ✅ | 06 v2 | a named region's item takes its given name: delete by `name:<Name>` (no layer prefix), not `r12` |
| G21 | ✅ | 06 v2 | refine rebuilds the layer: redo deletions after it (or drop in the scene); hand work on its own layer |
| G22 | ✅ | 06 v2 | a part crop must reach past every free end of the part (or end where the part ends) |
| G23 | ✅ | 06 v2 | centred point text with tracking sits half a tracking step left: shift it by tracking / 2 |
| G24 | ✅ | 06 v2 | wordmark width: one letter's width with `horizontal_scale` first, then the overall width with tracking |
| G25 | ✅ (revised) | 09 v3 | soft-shaded subject: first written as "hand-build the shaded parts" — made v3/v4 worse; now: keep the scene, `ramp` the camouflage bands (what v2 did) |
| G26 | ✅ | 09 v3 | `max_px` (small art in a large image) and `min_de` (inks that merge: hair vs black, lips vs brown) |
| G27 | ✅ | 09 v3 | a part build over the main scene: seams at the crop edge, regions running under it — build it under or clip it |
| G28 | ✅ | 09 v3 | re-order hand-built layers after every build or refine (the scene layer goes on top) |
| G29 | ✅ | 09 v3 | non-Latin text: check the font has the script in a preview (Avenir Next showed missing glyphs) |
| G30 | ✅ | 09 v3 | cap height ÷ 0.7 overshot 11 % with Futura: confirm the size in a close-up |
| G32 | ✅ | 06 v3 | `text x y w h` is in the analyzed crop's pixels |
| G33 | ✅ | 06 v3 | after each build / refine move the scene layer below the hand layers before checking (refine measures with it on top) |
| G34 | ✅ | 06 v3 | centring tracked text: G23's shift was wrong — the returned box stays centred; measure by the box or `content_box` |
| G35 | ✅ | 06 v3 | a style update doesn't clear local tracking: re-apply the paragraph style |
| G36 | ✅ | 06 v3 | check stem weight after `horizontal_scale` (Bold 120 % too heavy, Bold 112 % + tracking right) |
| G37 | ✅ | 06 v3 | straight frame lines with feet or a taper: filled polygons from profile tracks, not grid reading (0.7 mm off) |
| G38 | ✅ (revised) | 09 v4 | soft-shaded illustration recipe: scene for everything (one full-image analyze, `ramp` per shaded shape, merged inks set by hand), no refine after hand work |
| G39 | ✅ (revised) | 09 v4 | petals: flat fills in 2–3 greens + darker outline, back first (radial gradients looked bubbly); jewellery by hand |
| G40 | ✅ | 09 v4 | `max_px` never upsamples: a small crop stays small |
| G41 | ✅ | 09 v4 | wordmark: cap height with size first, then width with `horizontal_scale`, then tracking |
| G42 | ✅ | 09 v5 | check inks refine changed in a close-up; an ink you sampled on purpose: set it to a swatch so refine leaves it |
| G43 | ✅ | 09 v5 | lips belong with flower and jewellery on the "draw by hand" list (the scene's lips are a lumpy blob) |
| G44 | ✅ | 09 v5 | measure caps from the image, not from `text_boxes` |
| G45 | ✅ | 09 v5 | dropping a part that wraps another (a bracelet on a wrist) fills it with what lies under: draw the covered piece (skin) or `fill` the right region |
| G52 | ✅ | 09 v6 | re-applying a paragraph style clears every local override, `align` too (text jumped ~50 mm): put `align` in the style (§ 3 says only tracking) → recreate.md § 3 (style re-apply clears align), 2026-11-27 |
| G53 | ✅ | 09 v6 | "petals as rotated ellipses": `create_shape` has no rotation; say how (ellipse path + `transform_items` rotate, or generated Béziers) and size the flower from its measured box → recreate.md § 4 (rotated shapes, petal ring), 2026-11-27 |
| G54 | ✅ | 09 v7 | hair inside the black region (hair + brim underside + sleeve one region): nothing to recolour; a part crop of the hair, the rest dropped `fill none`, built below the hand layers → recreate.md § 5.0 (one region holding several parts), 2026-11-27 |
| G55 | ✅ | 09 v7 | `drop < 0.05` also drops eyelashes, eye, earring, finger detail: `keep` them after, or `drop in` boxes → recreate.md § 5.0 step 2 (keep after drop <), 2026-11-27 |
| G56 | ✅ | 09 v7 | the case-09 paragraph should repeat that refine changes hand-set inks (hair, lips) unless they are swatches → recreate.md § 5.0 soft-shaded paragraph (hand inks as swatches), 2026-11-27 |
| G57 | ✅ | 09 v6, v7 | non-Latin text: a shortlist of installed faces with the script (AvenirNext-UltraLight showed tofu; Helvetica Neue Light, Montserrat Light worked) → recreate.md § 3 (Cyrillic faces), 2026-11-27 |
| G58 | ✅ | 09 v7 | `size` with a non-square image (620 × 617 → 620 × 620): pad or stretch, and where — text placed from px was 1–2 mm off → recreate.md § 5.0 step 1 (size stretches), 2026-11-27 |
| G59 | ✅ | 01 Run 2, Run 3 | font size from cap height (§ 3): measure each large text on its own (one header word gave 59 pt for both, they needed 61 and 54 pt) and check a display line's box width against the measured width (Run 3's title ~10 % narrow at the right cap height) → recreate.md § 3 (each large text, display line width), 2026-11-27 |
| G60 | ✅ | 01 Run 2, Run 3 | § 8: rmse is comparable only at the same render size as well as the same crop (0.153 at 1024 px vs 0.134 at 400 px for one artboard); keep `max_px` fixed between rounds → recreate.md § 8 (same max_px), 2026-11-27 |
| G61 | ✅ | 01 Run 2 | moving a set of items by an offset is not mentioned: `transform_items {refs: "name:R2 Mini*", dx, dy}` → recreate.md § 8 (transform_items dx, dy), 2026-11-27 |
| G62 | ✅ | 01 Run 2, Run 3 | reading `preview {image, region, grid}`: labels are image px, positions read off the shown picture are ÷ zoom; small regions or `sample` for exact points. G51 is ticked but its text is not in recreate.md → recreate.md § 1 (reading a zoomed preview; G51 text added there), 2026-11-27 |
| G46 | ✅ | 05 v1, v2 | test fonts in one batch (same line in 4–6 candidates, compare box widths with the measured width, one render); the x-height : cap-height ratio points to the family |
| G47 | ✅ | 05 v1, v2 | `content_box` is [x, y, w, h]; on a panel with a white area the whole-page box can be wrong — judge with region compares |
| G48 | ✅ | 05 v1, v2 | a geometric lowercase wordmark: construct it (circles/ellipses + stems, unite, minus_front the counters) instead of chasing fonts |
| G49 | ✅ | 05 v1, v2 | splashes / teardrops: a circle plus two tangents to the tip, sizes and angles as measured (uneven if the reference is); drop the scene's lopsided specks |
| G50 | ✅ | 05 v1, v2 | a JPEG screenshot makes type look heavier: don't pick the weight from the blur |
| G51 | ✅ | 05 v1 | reading a zoomed image: px = region.x + display ÷ zoom |
| G31 | ✅ | 09 v3 | `name:` refs match the whole document: they hit another version's item of the same name |

### Owner decisions pending

- ✅ What `scene` is for (2026-11-27, owner left it to the agent, to be rewritten after more tests): organic, irregular
  artwork — whole (09 v2) or a part from a crop (06 v3 tree, 08 globe); geometry, text and layouts constructed;
  photos at most the substrate (04). See plan.md D15, recreate.md § 5.0.
- Remaining cases 05, 07, 09, 06, 01, 02: run in pairs (with and without `scene`) so every case has a baseline.

### Quality headroom (2026-11-26, in progress)

Owner: quality first, not fewer calls. Case pairs: 09 manual 5.4 min / 28 calls / rmse 0.138 vs scene 5.0 / 49 / **0.095**
(scene closer); 06 manual 8.0 min / 42 / 0.103 (crown simplified), 06 scene run stopped (tokens). `bench/scene-headroom.mjs`
splits the error by stage (colour reduction → regions → fit → shared inks): most detail was lost in the region step's
rim/halo dissolve (09 face 0.102 vs 0.052 floor). Changes (uncommitted runs not yet re-tested live): per-pixel unmixing of
fringe pixels, rims must run between two shapes, small enclosed near-colour patches merge, corners on lightly smoothed
points → 09 face built 0.119 → 0.096, 06 crown unchanged (0.142 vs floor 0.071), 08 figures 0.090. Open: one extra
anchor on a square with a half-covered row (test relaxed, TODO), 06 crown (min-area merge eats holes), fitting stage
loss on 09 (0.074 → 0.090). Next: rerun 06 scene, re-test 09 scene with this build, label docs 08 / ribbons.

**Owner verdicts (2026-11-27):** 06 v3 "almost identical — people can't tell it from the original"; 09 v2 "still
unbeatable but far from perfect", every 09 run after it "really bad". Cause found: not the build (the v2-era build and
today's both band the hat; today's keeps more detail — lips red, bracelet) but the guide: G25/G38/G39 sent v3 and v4 to
hand-draw the hat and gradient petals and to lower `min_de` (facets). v2 kept the scene for everything, `ramp`ed the hat
brim's bands, set hair and lips inks by hand, drew flat outlined petals. Guide rewritten to that; next 09 run checks it.

**06 scene rerun (v2, 2026-11-26):** 6.5 min / 52 calls / rmse 0.097 (manual v1 0.103); owner: the tree is almost
identical to the reference. What made it: a crop of just the tree, `colors: 2` (one flat ink rendered as foil),
`detail: high` — the whole-image analyze gave 12 inks / 817 regions. Findings F24–F26, G19–G24 below.

**Half-covered rows fixed** (square test strict again: 4 segments): an edge through a pixel row's middle gives every
fringe pixel t ≈ 0.50 ± 0.01, so noise chose the side pixel by pixel → 1 px zigzags the fitter can't smooth. Now a
near-tie (|t − 0.5| < 0.1) is averaged along the edge over neighbouring near-ties of the same pair (±4), and a tie
that stays goes to p (up/left); clear pixels keep their own t (averaging them along a straight line on a tight curve
turned a r = 12 px circle into a rounded square). Headroom built rmse before → after, normal / high: 06 0.067 → 0.066 /
0.064 → 0.063, 09 0.054 → 0.056 / 0.053 → 0.052, 08 0.086 → 0.085 / 0.076 → 0.079 (no change beyond ±0.003).

**Headroom items closed (2026-11-26, `bench/scene-headroom.mjs` with a detail ROI: 06 crown `345,335,420,140`, 09 face
`270,140,120,120` in working px):**
- *06 crown:* the region step lost most (quant 0.075 → regions 0.117). Ablation: mode filter off 0.098, rim dissolve
  rule A off 0.091, whole dissolve off 0.069 — but those keep the foil's shading and JPEG halos as regions (F1's lumps;
  rmse rewards them), so they stay. Fix: a region under the minimum area that differs from every neighbour by ΔE > 20
  **and** matches a large region's colour elsewhere (a hole showing the background, a letter's piece) is kept down to
  a quarter of the minimum area; a speck in a colour of its own still joins. Crown built 0.140 → **0.130**, holes and
  lobes visibly back; 08 regions 235 → 261, 09 unchanged.
- *09 fitting loss* (face regions 0.079 → fitted 0.091): a trade-off, not a defect. Floor: no smoothing + tolerance 0.3
  gives 0.075 at 3.6× the segments. Lighter smoothing (±2 × 2, tol 1.0): face 0.089, 08 0.079, +17 % segments — but
  the 08 figures' lumps come back, so the fit stays as it is. The lips' rhombus comes from the region step: skin
  facets cut the lip outline into edges of ≤ 5 points, drawn as straight lines.
- *Re-test 09 with the scene* (v3): see benchmarks § 2i — the guide, not the build, limited it.
- *Labels:* 08 and the ribbons document (04 runs) labelled.

## 10. Future ideas: speed and quality (2026-11-27)

Ideas only, nothing decided. Measured on this Mac (macOS 27.2, Node 22.23, `dist/` of commit e8e22a2; no Illustrator in
the loop).

### Speed

Where a recreate run's time goes: runs take 5–11 min (benchmarks § 2i), `scene analyze` 0.9–2.3 s of it (06 1000×899:
2.3 s; 08 1000×666: 2.1 s; 09 620×617: 0.9 s; decode 35–110 ms). The agent's turns and rounds dominate: **fewer rounds and
calls (guide, tool ergonomics) beat faster pixels**.

CPU profile of four analyses (≈ 8 s): `regionStats` 13 %, `rasterize` (own render) 9 %, `bilateral` 6 %, garbage
collection 6 %, colour maths (`de76`, `gam`, `rgbToLab`, `labToRgb`, `mixT`) ~13 %, `modeFilter` 4 %, `chamfer` 3 %,
`quantize` + `flatMask` 6 %, primitives scoring ~4 %.

- **Token use** (benchmarks § 2j, 2026-11-27): a scene run cost more than the manual one on 4 of 5 cases — trim
  replies (summary top 15 + counts, overlay only on analyze / when asked), one analyze per job; the guide split and
  the other items are in the roadmap ("Token use").
- **Fewer calls per run** (largest effect): one analyze per image (agents ran 2–4 and threw most away); a `position`
  on `scene build` / `refine` so hand layers aren't re-ordered after every build (F30); `drop in x y w h` (F35);
  readable overlays for small crops (F40); a clearer degenerate-region report (done: F33).
- **Plain-JS speed-ups, if ever needed:** `regionStats` recomputed after each merge pass — update it incrementally;
  fewer temporary arrays (GC); cache the smoothed Lab image and the quantization per (image, crop, `max_px`) so a
  re-analyze with other edits or detail starts from them; colour conversions through a lookup table (sRGB → linear).
  Estimate: analyze roughly halved — a few hours of work, not worth it before quality.
- **GPU (gpu.js) — not now** (checked 2026-11-27): gpu.js 2.24.1 (24 Sep 2026) is maintained, but in Node it runs
  through the native `gl` (headless-gl), which per its 2.24.0 notes fails to build on Node 23+ (installs on ≤ 22;
  Apple Silicon not confirmed); kernels are float32 with fixed loop bounds; its own M1 Max benchmark has a 4 M-element
  per-pixel map slower than plain JS (15.9 vs 6.9 ms: upload and readback), faster only for heavy maths (512² matmul
  5.7×). Only `bilateral` and colour maths (~1.3 s of 8 s) fit its model; region graphs, flood fills and sorting
  don't. A native module would complicate npm, the plugin and the `.mcpb` bundle. Revisit only for a heavy per-pixel
  algorithm (below); consider WebAssembly SIMD first (no native install).

### Quality

The owner's eye decides; rmse rewards kept halos and photo shading (§ quality headroom), so every idea is checked on
renders and close-ups, and a guide change is checked against the owner's best run of each case (09: G25/G38/G39 made
v3 and v4 worse than v2).

- **Region step still loses the most** (06 crown: colours 0.075 → regions 0.108; 08: 0.042 → 0.079): tell a JPEG
  halo from real thin detail by the edge profile across it (a halo is a smooth mix between two sides; a stroke has
  its own plateau) instead of width and ΔE alone; the mode filter (06 crown 0.107 → 0.098 without it) could spare
  pixels whose ink is a large region's colour.
- **Fitting:** the floor is well below today's fit (09 face 0.075 unsmoothed vs 0.091), but lighter smoothing brings
  lumps back. Fit to sub-pixel edge positions (from the image gradient across each boundary) instead of pixel cracks,
  so less smoothing is needed; fit a small feature's outline (lips) as one loop when junctions cut it into ≤ 5-point
  edges (F32).
- **Soft shading:** suggest `ramp` for a run of bands whose tones change steadily (v2's manual `ramp` on the hat brim
  was what made 09 work, F29); radial ramps for round shading (petals, pearls); a switch for photo mode on a crop that
  is artwork (F28).
- **Parts and crops:** upsample a small crop so `detail: "high"` adds real resolution (F37); `split` a region at a
  frame line so leaves touching it survive (F36); build a part under the main layer or clipped to its silhouette.
- **Render-and-compare optimisation** (research): move anchors and gradient stops to minimise the difference between
  the rendered build and the image, thousands of renders per shape — the one idea here that would need GPU or SIMD.
- **Process:** run cases in pairs (with and without `scene`); record what the best run did (edits, inks, parts) and
  keep it in the guide; label every artboard with the owner's verdict.
