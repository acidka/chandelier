# Recreating a design from an image — the full method

Read this before rebuilding artwork from a flat file, a scan, a screenshot, a rendered mockup or a photo of a real
object. The result is editable print artwork: live text, swatches and styles, clean vector shapes, at the real size.

The method is tested with fresh agents on a suite of real jobs of different kinds (a flat calendar page, a desk
calendar in a mockup, a packaging front in a product photo, a photographed box with translucent waves; more kinds to
come). How: `docs/recreate-testing.md` in the repository. Examples below name the kind of job they come from.

## Which sections a job needs

This file is the core: every job reads § 0 set up, § 1 read the image, § 2 list the parts, § 6 colour, § 8 compare,
§ 9 finish. Then read **only** the files for what the design contains (most contain several):

| The design has… | Typical jobs | Read |
|---|---|---|
| Text, grids, tables, rules, boxes | calendars, flyers, menus, forms, posters, back panels | [recreate-type.md](recreate-type.md) (§ 3) |
| Logos, icons, geometric marks, wordmarks | brand marks, pictograms, badges | [recreate-marks.md](recreate-marks.md) (§ 4) |
| Organic, irregular art and the `scene` tool is listed | flat illustrations, figures, faces, detailed silhouettes | [recreate-scene.md](recreate-scene.md) (§ 5.0) |
| Free-form shapes drawn by hand: waves, blobs, swooshes, organic bands, overlapping translucent layers | packaging backgrounds, decorative bands, abstract art | [recreate-freeform.md](recreate-freeform.md) (§ 5a–5c) |
| Gradients, shading, shadows, glows | illustrations, layered paper looks, photographed objects | [recreate-shading.md](recreate-shading.md) (§ 7) |
| A photo of a real object or a mockup (perspective, folds, light) | product photos, box and bag mockups, desk/wall mockups | § 1 here (flat shape and box), then the files above |

A reference to a section in another file (§ 3, § 5b …) means that file. The failure agents make most often, whatever
the kind: **guessing instead of measuring** (sizes, positions, curves), and **copying the photo instead of the
artwork** (light, folds and perspective drawn as if they were print).

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
- **Measure in few calls:** one `preview {image, region: [[…], […]], sample: [[x, y], …]}` gives up to 6 zooms and
  24 colour samples at once; plan the parts to look at, then ask for them together.
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
  tone questions by samples and profiles at fixed points (`preview {reference, sample: [[x, y], …]}` gives both
  colours and their ΔE at each point, in session units). `content_box` gives a `note` instead of a shift when the
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
