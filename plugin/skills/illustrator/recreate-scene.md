# Recreate: the `scene` tool (§ 5.0)

Part of the recreate method — the core (every job) is [recreate.md](recreate.md): § 0–2 set up and read the image, § 6 colour, § 8 compare, § 9 finish. This file: § 5.0, for organic, irregular artwork when the `scene` tool is listed; drawing a part by hand: [recreate-freeform.md](recreate-freeform.md).

## 5.0 With the `scene` tool (when it is listed)

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
   smaller crop, which smooths its edges but adds no detail); a small region of its own colour (lips) gets its own
   ink at analyze; two inks that merged into one region (hair into black) → set that region's ink by hand
   (`r9 = #231612`, sampled with `preview {image, sample}`). Don't lower `min_de` or raise `colors` for it: that splits soft shading into facets
   all over the image (case 09: faceted skin and hand).
2. **Edit, in one call.** `merge` what is one part (the first id keeps its ink), `drop` noise and photo-only things
   (folds, shadows, side faces; the region a dropped one sits on fills its place — `drop r12 fill r0` to choose;
   `drop < 0.05` drops every tiny region at once, e.g. small text and texture — and with it eyelashes, eyes,
   earrings and finger detail: `keep r41 r57` them right after, or drop by `drop in x y w h` boxes instead), `text x y w h` over each text block (in the analyzed crop's pixels),
   `r8 stroke` on a thin band of one width (a frame, a ring, a line: drawn as a stroke, not a lumpy filled band),
   `split r5 in x y w h` to cut a part off a region, `r10 logo` on marks, `rN circle` / `rect` to force a primitive — only when the **whole** outline is that primitive
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
   other parts that run through the crop: drop them in the scene and draw them by hand (§ 4); a leaf or tip that
   touches such a line is in the line's region — `split r5 in x y w h` makes the part in the box its own region
   first, so it stays when the line is dropped.
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
