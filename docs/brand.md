# Brand: logo and hero image

Designed 2026-11-22 entirely through Chandelier (an agent with its MCP tools; no manual Illustrator work), following
[logo-plan.md](logo-plan.md). Files: [`assets/brand/`](assets/brand/).

![Chandelier](assets/brand/chandelier-horizontal.svg)

## The mark

A chandelier ring hanging from its chain forms the **C**; its lights are the two **anchor points** at the open end of
the path, each with one Bézier handle along the curve — exactly what an open path's end anchors look like in
Illustrator. One mark says *Chandelier*, *light* and *vector editing*. The dot of the **i** in the wordmark is the
same amber anchor.

| File | Use |
|------|-----|
| `chandelier-mark.svg` · `-64…1024.png` | The mark (with soft glows) for 64 px and up |
| `chandelier-mark-small.svg` · `-16/32/48.png` · `favicon.svg` · `favicon.ico` | Small sizes (≤ 48 px): ring and lights only, no chain, handles or glow |
| `chandelier-mark-dark-bg.svg` | Mark on its dark background (avatars) |
| `chandelier-mark-black.svg` · `chandelier-mark-white.svg` | One colour, for black on white or white on black/very dark backgrounds |
| `chandelier-horizontal.svg` · `-dark-bg.svg` | Mark + wordmark, the default lockup |
| `chandelier-stacked.svg` | Mark above the wordmark, for square spaces |
| `hero-light.svg` / `hero-dark.svg` (+ `@2x.png`) | GitHub README hero, 1280 × 640 |
| `social-preview.png` | GitHub social preview (dark hero, 1280 × 640) |
| `chandelier-logo.ai` | Master: exploration (A1–D3), mark, wordmark tests, lockups, heroes |
| `source/*.jsx` | The builders that drew everything (`mark.jsx` first, then `lockups.jsx`), run with `run_script {file}` |

## Colours

| Name | HEX | RGB | Use |
|------|-----|-----|-----|
| Ink | `#0F1B2D` | 15 27 45 | Ring, wordmark on light |
| Amber | `#F2A93B` | 242 169 59 | The lights (anchors), i-dot, proof line on dark |
| Glow | `#FFD27A` | 255 210 122 | Soft light around the anchors (radial, fading to transparent) |
| Handle | `#8A9BB8` | 138 155 184 | Bézier handles |
| Paper | `#F6F3EC` | 246 243 236 | Light background, ring on dark |
| Night | `#0B1422` | 11 20 34 | Dark background |
| Amber text | `#94600F` | 148 96 15 | Amber text on Paper (4.8:1) |

Contrast (WCAG): Ink on Paper 15.6:1, Paper on Night 16.7:1, Amber on Night 9.2:1, Amber text on Paper 4.8:1,
Amber on Ink 8.7:1. Amber alone on white is too light for text: use Amber text or Ink.

## Type

**Montserrat SemiBold**, tracking −10, outlined in every delivered file; tagline and proof line in Montserrat Medium.
Montserrat is under the SIL Open Font License 1.1.

## Use

- **Clear space:** the size of one anchor square on every side. **Minimum size:** full mark 64 px, small mark 16 px,
  horizontal lockup 120 px wide.
- Don't recolour the ring or the lights, outline or rotate the mark, add effects, or put the light version on busy
  photos. The one-colour versions are for plain black or white backgrounds.
- The mark is not, and must not be made to look like, Adobe's Illustrator icon.

## Licence

The logo, wordmark and hero images are © 2026 acidka, all rights reserved. Anyone may use them **unmodified** to
refer to the Chandelier project (articles, lists, talks, links). The code of this repository is MIT
([LICENSE](../LICENSE)); that licence does not cover the brand files.
