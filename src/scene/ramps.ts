// scene S2b: tone ramps. A smooth gradient quantizes into contour bands — neighbouring regions whose pixels together
// fit one colour plane (Lab = k0 + kx·x + ky·y) about as well as each alone are one ramp. In a photo the ramp is
// lighting and is flattened (merged, owner 2026-11-26); in artwork it is listed as a hint, and the `ramp` edit makes
// one region with a linear gradient.
import { de76, type Lab } from './color.js';
import type { Region } from './regions.js';

/** per-region sums for a least-squares plane per channel (coordinates relative to cx, cy) */
export interface PlaneStats { n: number; sx: number; sy: number; sxx: number; sxy: number; syy: number; c: number[][] }

export function planeStats(map: Int32Array, w: number, h: number, lab: Lab, count: number): PlaneStats[] {
  const S: PlaneStats[] = Array.from({ length: count }, () => ({ n: 0, sx: 0, sy: 0, sxx: 0, sxy: 0, syy: 0, c: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]] }));
  const ch = [lab.L, lab.A, lab.B], ox = w / 2, oy = h / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, id = map[i];
    if (id < 0 || id >= count) continue;
    const s = S[id], X = x + 0.5 - ox, Y = y + 0.5 - oy;
    s.n++; s.sx += X; s.sy += Y; s.sxx += X * X; s.sxy += X * Y; s.syy += Y * Y;
    for (let k = 0; k < 3; k++) { const v = ch[k][i], c = s.c[k]; c[0] += v; c[1] += X * v; c[2] += Y * v; c[3] += v * v; }
  }
  return S;
}

export const addStats = (a: PlaneStats, b: PlaneStats): PlaneStats => ({
  n: a.n + b.n, sx: a.sx + b.sx, sy: a.sy + b.sy, sxx: a.sxx + b.sxx, sxy: a.sxy + b.sxy, syy: a.syy + b.syy,
  c: a.c.map((v, k) => v.map((x, j) => x + b.c[k][j])),
});

/** plane per channel ([k0, kx, ky], in the image-centred frame) and the combined RMS residual (ΔE) */
export function fitPlane(s: PlaneStats): { k: number[][]; rms: number } {
  const M = [[s.n, s.sx, s.sy], [s.sx, s.sxx, s.sxy], [s.sy, s.sxy, s.syy]];
  const det3 = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det3(M);
  let sse = 0;
  const k = s.c.map((c) => {
    const r = [c[0], c[1], c[2]];
    let beta: number[];
    if (Math.abs(D) < 1e-9 * Math.max(1, s.n) ** 3) beta = [c[0] / Math.max(1, s.n), 0, 0];
    else beta = [0, 1, 2].map((j) => det3(M.map((row, i) => row.map((v, q) => (q === j ? r[i] : v)))) / D);
    sse += Math.max(0, c[3] - (beta[0] * r[0] + beta[1] * r[1] + beta[2] * r[2]));
    return beta;
  });
  return { k, rms: Math.sqrt(sse / Math.max(1, s.n)) };
}

/** Groups of neighbouring regions that are bands of one ramp (each group ≥ 2 regions, largest first). */
export function findRamps(regions: Region[], stats: PlaneStats[], minDe: number, minArea: number): number[][] {
  const parent = regions.map((_, i) => i), find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const S = stats.map((s) => s), fit = S.map((s) => (s.n >= 3 ? fitPlane(s) : { k: [], rms: 0 }));
  const pairs: [number, number, number][] = [];
  for (const r of regions) {
    if (r.area < minArea) continue;
    for (const n of r.nbrs.keys()) {
      const q = regions[n];
      if (n <= r.id || q.area < minArea) continue;
      const d = de76(r.L, r.a, r.b, q.L, q.a, q.b);
      if (d < 3 * minDe) pairs.push([d, r.id, n]);
    }
  }
  pairs.sort((a, b) => a[0] - b[0]);
  for (const [d, a0, b0] of pairs) {
    const a = find(a0), b = find(b0);
    if (a === b) continue;
    const u = addStats(S[a], S[b]), f = fitPlane(u);
    // the union fits one plane about as well as the parts: a ramp (a step between two flat inks does not). The miss is
    // measured above the parts' own noise (F29: on a grainy image the noise alone exceeded the fixed bound, so soft
    // gradients got no hint); measured 2026-11-27: bands of a ramp ≤ 0.2 over the noise at noise σ 1–8, a step of ΔE 11.5 2.8
    const noise = Math.max(fit[a].rms, fit[b].rms), excess = Math.sqrt(Math.max(0, f.rms * f.rms - noise * noise));
    if (excess < Math.max(1, 0.12 * d) && f.rms <= 1.5 * noise + 1) {
      const [keep, drop] = S[a].n >= S[b].n ? [a, b] : [b, a];
      parent[drop] = keep; S[keep] = u; fit[keep] = f;
    }
  }
  const groups = new Map<number, number[]>();
  regions.forEach((r, i) => { if (r.area) { const g = find(i); if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(i); } });
  return [...groups.values()].filter((g) => g.length > 1).map((g) => g.sort((x, y) => regions[y].area - regions[x].area)).sort((x, y) => regions[y[0]].area - regions[x[0]].area);
}

/** A region's linear ramp: direction (unit, image px), the projection range (5th–95th percentile, relative to the
 * region's centroid) and the colours at both ends, from its plane. */
export interface Ramp { cx: number; cy: number; ux: number; uy: number; t0: number; t1: number; c0: number[]; c1: number[] }

export function rampOf(map: Int32Array, w: number, h: number, lab: Lab, id: number): Ramp | null {
  const st = planeStats(map, w, h, lab, id + 1)[id];
  if (st.n < 10) return null;
  const f = fitPlane(st), ox = w / 2, oy = h / 2;
  // steepest direction over all channels: main eigenvector of J·Jᵀ (J = 2 × 3 gradient)
  const gx = f.k.map((c) => c[1]), gy = f.k.map((c) => c[2]);
  const a = gx.reduce((s, v) => s + v * v, 0), b = gx.reduce((s, v, i) => s + v * gy[i], 0), c = gy.reduce((s, v) => s + v * v, 0);
  const th = 0.5 * Math.atan2(2 * b, a - c), ux = Math.cos(th), uy = Math.sin(th);
  const cx = st.sx / st.n + ox, cy = st.sy / st.n + oy, ts: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (map[y * w + x] === id) ts.push((x + 0.5 - cx) * ux + (y + 0.5 - cy) * uy);
  ts.sort((p, q) => p - q);
  const t0 = ts[Math.floor(ts.length * 0.05)], t1 = ts[Math.floor(ts.length * 0.95)];
  const at = (t: number) => f.k.map((k) => k[0] + k[1] * (cx - ox + t * ux) + k[2] * (cy - oy + t * uy));
  return { cx, cy, ux, uy, t0, t1, c0: at(t0), c1: at(t1) };
}
