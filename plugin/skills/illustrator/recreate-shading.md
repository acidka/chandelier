# Recreate: gradients, shading and shadows (§ 7)

Part of the recreate method — the core (every job) is [recreate.md](recreate.md): § 0–2 set up and read the image, § 6 colour, § 8 compare, § 9 finish. This file: § 7, for gradients, shading, shadows and glows.

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
