// scene S2c: translucent layers. Where two translucent inks A and B overlap on a substrate S, the overlap looks like
// A·B/S (per channel, linear light: multiply). Such an overlap region is better built as two whole shapes in
// multiply mode — A over A ∪ X and B over B ∪ X, filled A/S and B/S — than as three flat patches.
import { labToRgb, rgbLab, de76 } from './color.js';
import type { Scene } from './types.js';

const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const enc = (c: number) => Math.max(0, Math.min(255, Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255)));
const linOf = (L: number, a: number, b: number) => labToRgb(L, a, b).map(lin);

/** the colour a multiply layer needs so that over s it looks like a: a / s per channel (clamped to ≤ 1) */
export function multiplyFill(a: number[], s: number[]): number[] {
  const A = linOf(a[0], a[1], a[2]), S = linOf(s[0], s[1], s[2]);
  return rgbLab(...(A.map((v, k) => enc(Math.min(1, v / Math.max(1e-4, S[k])))) as [number, number, number]));
}

/** what a over b over s (both multiply) looks like */
export function multiplied(a: number[], b: number[], s: number[]): number[] {
  const A = linOf(a[0], a[1], a[2]), B = linOf(b[0], b[1], b[2]), S = linOf(s[0], s[1], s[2]);
  return rgbLab(...(A.map((v, k) => enc((v * B[k]) / Math.max(1e-4, S[k]))) as [number, number, number]));
}

export interface Overlap { x: number; a: number; b: number; s: number; de: number }

/** the substrate under a region: its lowest neighbour (by z) that is lighter in L */
function substrate(s: Scene, id: number): number {
  const r = s.seg.regions[id];
  let best = -1;
  for (const n of r.nbrs.keys()) { const q = s.seg.regions[n]; if (q.area && q.L > r.L && (best < 0 || s.z[n] < s.z[best])) best = n; }
  return best;
}

/** regions that look like the overlap of two neighbours (multiply over their substrate), best first */
export function findOverlaps(s: Scene, limit = s.params.minDe): Overlap[] {
  const R = s.seg.regions, out: Overlap[] = [];
  for (const x of R) {
    if (!x.area || x.nbrs.size < 2) continue;
    const nb = [...x.nbrs.keys()].filter((n) => R[n].area && R[n].L > x.L);
    for (let i = 0; i < nb.length; i++) for (let j = i + 1; j < nb.length; j++) {
      const a = nb[i], b = nb[j], sa = substrate(s, a), sb = substrate(s, b);
      if (sa < 0 || sa !== sb || sa === x.id) continue;
      const S = R[sa];
      // multiply only darkens: a layer lighter than its paper in any channel is not a translucent ink
      const SA = linOf(S.L, S.a, S.b);
      if ([a, b].some((id) => linOf(R[id].L, R[id].a, R[id].b).some((v, k) => v > SA[k] * 1.02))) continue;
      const m = multiplied([R[a].L, R[a].a, R[a].b], [R[b].L, R[b].a, R[b].b], [S.L, S.a, S.b]);
      const de = de76(m[0], m[1], m[2], x.L, x.a, x.b);
      if (de < limit) out.push({ x: x.id, a, b, s: sa, de: Math.round(de * 10) / 10 });
    }
  }
  return out.sort((p, q) => p.de - q.de);
}
