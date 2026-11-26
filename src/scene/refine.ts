// scene S3: refine. Measure the result against the reference — tone per region (render vs image, inside the region),
// shape per region (IoU of our own render), each shared edge against the image's sub-pixel edge — then fix only what
// misses: an ink shifted by colour conversion is corrected (global swatch: every use follows), an edge that misses the
// image edge is re-fitted tighter. The caller rebuilds once.
import { bez } from '../fitcurve.js';
import { de76, rgbToLab, type Lab } from './color.js';
import { recompute } from './analyze.js';
import type { Img } from '../image.js';
import type { Scene } from './types.js';

export interface RegionError { r: number; de: number; iou: number }
export interface EdgeError { e: number; left: number; right: number; dev: number }
export interface Measure { rmse: number; regions: RegionError[]; edges: EdgeError[] }

/** sample a Lab plane bilinearly at (x, y) (pixel-edge coordinates) */
function at(P: Float32Array, w: number, h: number, x: number, y: number): number {
  const fx = Math.max(0, Math.min(w - 1, x - 0.5)), fy = Math.max(0, Math.min(h - 1, y - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
  return P[y0 * w + x0] * (1 - tx) * (1 - ty) + P[y0 * w + x1] * tx * (1 - ty) + P[y1 * w + x0] * (1 - tx) * ty + P[y1 * w + x1] * tx * ty;
}

/** how far (px, 90th percentile) a fitted edge runs from the image's own edge between its two regions */
function edgeDeviation(s: Scene, id: number): number {
  const e = s.pm.edges[id], A = s.seg.regions[e.left], B = s.seg.regions[e.right];
  if (!A || !B || !A.area || !B.area) return 0;
  const { w, h } = s.work, lab = s.lab, d = [B.L - A.L, B.a - A.a, B.b - A.b], dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  if (dd < 25) return 0; // too close in colour to locate an edge
  const devs: number[] = [];
  for (const c of s.fits[id]) {
    const n = Math.max(1, Math.round(Math.hypot(c[3][0] - c[0][0], c[3][1] - c[0][1]) / 4));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, p = bez(c, t), q = bez(c, Math.min(1, t + 0.01)), r = bez(c, Math.max(0, t - 0.01));
      let nx = -(q[1] - r[1]), ny = q[0] - r[0];
      const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
      // progress from A's colour (0) to B's (1) along the normal; the 0.5 crossing nearest the curve
      let best = Infinity, prev = NaN;
      for (let k = -12; k <= 12; k++) {
        const o = k / 4, x = p[0] + nx * o, y = p[1] + ny * o;
        const v = ((at(lab.L, w, h, x, y) - A.L) * d[0] + (at(lab.A, w, h, x, y) - A.a) * d[1] + (at(lab.B, w, h, x, y) - A.b) * d[2]) / dd;
        if (!isNaN(prev) && (prev - 0.5) * (v - 0.5) <= 0 && prev !== v) { const z = o - 0.25 + (0.25 * (0.5 - prev)) / (v - prev); if (Math.abs(z) < Math.abs(best)) best = z; }
        prev = v;
      }
      if (isFinite(best)) devs.push(Math.abs(best));
    }
  }
  if (devs.length < 3) return 0;
  devs.sort((a, b) => a - b);
  return Math.round(devs[Math.floor(devs.length * 0.9)] * 100) / 100;
}

/** errors of a render (Illustrator's, or our own) against the working image */
export function measure(s: Scene, render: Img): Measure {
  const { w, h } = s.work, R = s.seg.regions, rl = rgbToLab(render);
  // tone: mean of the render inside each region, eroded by 2 px (anti-aliased edges are not the ink)
  const acc = R.map(() => [0, 0, 0, 0]), ref = R.map(() => [0, 0, 0, 0]);
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    const i = y * w + x, id = s.seg.map[i];
    if (id < 0 || s.seg.map[i - 2] !== id || s.seg.map[i + 2] !== id || s.seg.map[i - 2 * w] !== id || s.seg.map[i + 2 * w] !== id) continue;
    const a = acc[id], b = ref[id];
    a[0] += rl.L[i]; a[1] += rl.A[i]; a[2] += rl.B[i]; a[3]++;
    b[0] += s.lab.L[i]; b[1] += s.lab.A[i]; b[2] += s.lab.B[i]; b[3]++;
  }
  const regions: RegionError[] = [];
  R.forEach((r, id) => {
    if (!r.area || s.meta[id].drop || s.meta[id].text || acc[id][3] < 10) return;
    const a = acc[id], b = ref[id], n = a[3];
    regions.push({ r: id, de: Math.round(de76(a[0] / n, a[1] / n, a[2] / n, b[0] / n, b[1] / n, b[2] / n) * 10) / 10, iou: s.iou[id] });
  });
  const edges: EdgeError[] = s.pm.edges.filter((e) => e.left >= 0 && e.right >= 0).map((e) => ({ e: e.id, left: e.left, right: e.right, dev: edgeDeviation(s, e.id) }));
  let sq = 0;
  for (let i = 0; i < render.rgb.length; i++) { const d = render.rgb[i] - s.work.rgb[i]; sq += d * d; }
  return { rmse: Math.round((Math.sqrt(sq / render.rgb.length) / 255) * 1000) / 1000, regions, edges };
}

export interface RefineReport {
  rmse_before: number;
  fixed: { what: string; why: string }[];
  left: { r: number; why: string }[];
  checks: { darkest: { ref: number; scene: number }; lightest: { ref: number; scene: number }; max_segments: { r: number; n: number } };
}

/** apply the fixes for one measurement; recomputes the scene */
export function refine(s: Scene, m: Measure, threshold = 6): RefineReport {
  const fixed: RefineReport['fixed'] = [], left: RefineReport['left'] = [];
  // inks: shift each colour group by the area-weighted error of its regions (render vs image), when it misses
  const groups = new Map<number, { e: number[]; n: number }>();
  const rl = s.seg.regions;
  for (const x of m.regions) {
    if (x.de <= threshold || s.meta[x.r].ramp || s.meta[x.r].multiply) continue;
    const c = s.meta[x.r].colour, g = groups.get(c) ?? { e: [0, 0, 0], n: 0 };
    const r = rl[x.r], col = s.colours[c];
    // the region's own mean is the target; the ink should move by the mean miss
    g.e[0] += (r.L - col.L) * r.area; g.e[1] += (r.a - col.a) * r.area; g.e[2] += (r.b - col.b) * r.area; g.n += r.area;
    groups.set(c, g);
  }
  for (const [c, g] of groups) {
    const col = s.colours[c], dl = g.e.map((v) => v / g.n);
    if (Math.hypot(dl[0], dl[1], dl[2]) < 1 || col.swatch) continue; // swatches named by the user stay
    s.colours[c] = { ...col, L: col.L + dl[0], a: col.a + dl[1], b: col.b + dl[2] };
    fixed.push({ what: `c${c}`, why: `tone ΔE ${Math.hypot(dl[0], dl[1], dl[2]).toFixed(1)} → corrected` });
  }
  // edges: tighter tolerance where the fit misses the image edge
  s.edgeTol = s.edgeTol ?? {};
  for (const e of m.edges) {
    const tol = Math.min(...[e.left, e.right].map((r) => s.meta[r].tol ?? s.tol));
    if (e.dev <= Math.max(1, tol)) continue; // misses the image edge by more than its own tolerance
    const key = e.left < e.right ? `${e.left},${e.right}` : `${e.right},${e.left}`;
    const now = s.edgeTol[key] ?? tol;
    if (now <= 0.3) { left.push({ r: e.left, why: `edge r${e.left}|r${e.right} ${e.dev} px off at tolerance ${now}` }); continue; }
    s.edgeTol[key] = Math.max(0.3, now / 2);
    fixed.push({ what: `edge r${e.left}|r${e.right}`, why: `${e.dev} px off → tolerance ${s.edgeTol[key]}` });
  }
  for (const x of m.regions) if (x.iou < 0.8 && rl[x.r].area > s.work.w * s.work.h * 0.002) left.push({ r: x.r, why: `shape IoU ${x.iou} (merge or split?)` });
  // tone checks the owner looks at: darkest and lightest region
  const live = m.regions.filter((x) => rl[x.r].area > s.work.w * s.work.h * 0.001);
  const by = (f: (a: number, b: number) => boolean) => live.reduce((p, x) => (f(rl[x.r].L, rl[p.r].L) ? x : p), live[0]);
  const dk = live.length ? by((a, b) => a < b) : null, lt = live.length ? by((a, b) => a > b) : null;
  const L = (id: number) => Math.round(s.colours[s.meta[id].colour].L);
  const before = m.rmse;
  recompute(s);
  let maxSeg = { r: -1, n: 0 };
  for (const sh of s.shapes) { const n = sh.loops.reduce((a, l) => a + l.length, 0); if (n > maxSeg.n) maxSeg = { r: sh.region, n }; }
  return {
    rmse_before: before, fixed, left: left.slice(0, 8),
    checks: { darkest: dk ? { ref: Math.round(rl[dk.r].L), scene: L(dk.r) } : { ref: 0, scene: 0 }, lightest: lt ? { ref: Math.round(rl[lt.r].L), scene: L(lt.r) } : { ref: 0, scene: 0 }, max_segments: maxSeg },
  };
}

/** per-pixel difference as a heat map (white = same, red = different) */
export function heatMap(a: Img, b: Img): Img {
  const rgb = new Uint8Array(a.w * a.h * 3);
  for (let i = 0; i < a.w * a.h; i++) {
    const d = (Math.abs(a.rgb[i * 3] - b.rgb[i * 3]) + Math.abs(a.rgb[i * 3 + 1] - b.rgb[i * 3 + 1]) + Math.abs(a.rgb[i * 3 + 2] - b.rgb[i * 3 + 2])) / 3;
    const t = Math.min(255, d * 3);
    rgb[i * 3] = 255; rgb[i * 3 + 1] = 255 - t; rgb[i * 3 + 2] = 255 - t;
  }
  return { w: a.w, h: a.h, rgb };
}

export type { Lab };
