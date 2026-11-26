# `scene`: image → editable vector scene (proposal)

Status: proposal, 2026-11-26; the main item of milestone 0.6 "faster free-form recreation" ([roadmap](../roadmap.md)).

## Problem

Measured 2026-11-25 (Illustrator 29.1, macOS 27.2, Node 22; [benchmarks § 2g–2h](benchmarks.md)):

| Job kind | Time | Tool calls | Tokens |
|---|---|---|---|
| Layout (calendar, mockup) | 3.5–4.6 min | 28–35 | 109–131 k |
| Free-form (ribbons, packaging waves) | 9–16 min | 46–75 | 156–223 k |

Calls cost ~15 s of model time against ~5 ms in Illustrator. On free-form jobs the agent does the pixel work itself:
reads profiles, picks anchors, keeps shared edges, sets up shading, compares, in 4–12 rounds. The 0.5.3 tools
(`profile`, `fit`, `shade`, `map`) halved the time but left the loop with the agent. Image Trace
(`path_ops {op: "trace"}`) is no answer: lumpy anchors, overlaps and gaps between neighbours, no swatches, no
primitives, no way to steer one part; the recreate guide forbids it for these reasons.

## Idea

Chandelier turns the image into an editable scene; the agent makes decisions, not coordinates; one call builds it.

```
image ──▶ scene {analyze}  ──▶ agent reads a 1-page summary + overlay image
              │                    │  edits: merge r3 r4 · r2 = swatch:Brand
              │                    │  r7 → text "SALE" · r9 → circle · drop r12
              ▼                    ▼
        scene.json  ◀──── scene {edit} ────┘
              │
              ▼
        scene {build}  ──▶ Illustrator (layers, global swatches, one undo step)
              │
              ▼
        scene {refine} ──▶ compare with the image, error per region,
                           re-fit only the bad regions, rebuild
```

One new tool, `scene`, actions `analyze` / `edit` / `build` / `refine`; `scene.json` stays on disk.

## `analyze` (pure TS in Node, no installs)

1. **Rectify**: the 4-point `map` and a per-row bilinear map (suite case 03) before anything else.
2. **Quantize**: edge-preserving smoothing (paper grain, JPEG noise), then k-means in Lab with a colour cap and a
   minimum ΔE. Translucent overlaps are recognised as "overlap of r2 + r5" → multiply, not an extra ink.
3. **Regions**: connected components per colour, tiny ones merged, an adjacency graph.
4. **Shared edges** (planar map): each border between two regions is fitted once (`src/fitcurve.ts`: designer
   anchors, level handles) and used by both — no gaps or overlaps.
5. **Primitives**: a region that fits a circle, ellipse, rectangle, rounded rectangle, line or regular polygon within
   tolerance becomes that shape (recreate.md § 4).
6. **Tone ramps**: a smooth change inside a region → a linear or radial gradient, or `shade` steps along its edge.
7. **Text**: the agent marks text boxes; the engine leaves them out for live text.
8. **Output**: a ~30-line summary (id, colour, area %, kind, neighbours, confidence) and an overlay image with ids on
   the reference.

## Expected effect

| Today | With `scene` |
|---|---|
| The agent measures profiles and picks anchors | `analyze` |
| The agent keeps neighbouring edges shared | Built in |
| 1–7 helper scripts | None: edits are short commands |
| 4–12 whole rebuilds | 1–3; `refine` re-fits only regions over the error threshold |
| Point JSON in context | 1-page summary + overlay |

Estimate (to be measured on the recreate suite): free-form jobs at ~3–5 min, 10–15 calls, < 100 k tokens.

## Stages

1. **S1**: rectify, quantize, regions, shared edges, fit, build; test on suite case 04 against v7/v8 and Image Trace.
2. **S2**: primitive recognition and tone ramps.
3. **S3**: `refine` (per-region error, re-fit, rebuild).
4. **S4**: text-box and constructed-logo hooks; recreate.md starts from `scene`.

## Risks

- Photos split into too many regions (light, grain, folds) → edge-preserving smoothing, minimum area, ΔE merge, the
  agent's `merge`.
- RMSE and the owner's judgement disagree (v2 vs v4) → `refine` reports shape and tone checks too; the owner judges
  on the suite.
- The largest image code in the project → pure TS on `src/image.ts`, `src/edges.ts`, `src/fitcurve.ts`; unit tests on
  synthetic images.
- Schema size → one tool with actions; check `scripts/schema-size.mjs`.
