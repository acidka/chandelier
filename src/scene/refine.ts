// scene S3: refine. Measure the result against the reference — tone per region (render vs image, inside the region),
// shape per region (IoU of our own render), each shared edge against the image's sub-pixel edge — then fix only what
// misses: an ink shifted by colour conversion is corrected (global swatch: every use follows), an edge that misses the
// image edge is re-fitted tighter. The caller rebuilds once.
import { bez } from '../fitcurve.js';
import { de76, rgbToLab, type Lab } from './color.js';
import { recompute } from './analyze.js';
import type { Img } from '../image.js';
import type { Scene } from './types.js';

/** got: the render's mean in the region, ref: the image's (Lab) */
export interface RegionError { r: number; de: number; iou: number; got: number[]; ref: number[] }
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
    const got = [a[0] / n, a[1] / n, a[2] / n], want = [b[0] / n, b[1] / n, b[2] / n];
    regions.push({ r: id, de: Math.round(de76(got[0], got[1], got[2], want[0], want[1], want[2]) * 10) / 10, iou: s.iou[id], got, ref: want });
  });
  // only edges between drawn regions: a dropped or text region's edges are not in the build
  const drawn = (r: number) => r >= 0 && !s.meta[r].drop && !s.meta[r].text && !s.meta[r].placeholder && !s.meta[r].stroke;
  const edges: EdgeError[] = s.pm.edges.filter((e) => drawn(e.left) && drawn(e.right)).map((e) => ({ e: e.id, left: e.left, right: e.right, dev: edgeDeviation(s, e.id) }));
  let sq = 0;
  for (let i = 0; i < render.rgb.length; i++) { const d = render.rgb[i] - s.work.rgb[i]; sq += d * d; }
  return { rmse: Math.round((Math.sqrt(sq / render.rgb.length) / 255) * 1000) / 1000, regions, edges };
}

export interface RefineReport {
  rmse_before: number;
  fixed: { what: string; why: string }[];
  /** more fixes of the same kind, counted */
  more?: number;
  left: { r: number; why: string }[];
  /** the fixes made our own estimate worse: undone, nothing to rebuild ("inks" / "edges": only that kind was undone) */
  reverted?: boolean | 'inks' | 'edges';
  /** darkest / lightest are left out when the part has one ink (they would be the same region, F45) */
  checks: { darkest?: { ref: number; scene: number }; lightest?: { ref: number; scene: number }; max_segments: { r: number; n: number } };
}

/** apply the fixes for one measurement; recomputes the scene. Undoes them when our own estimate gets worse. */
export function refine(s: Scene, m: Measure, threshold = 6): RefineReport {
  const fixed: RefineReport['fixed'] = [], left: RefineReport['left'] = [];
  const rl = s.seg.regions, before = { colours: JSON.parse(JSON.stringify(s.colours)), edgeTol: { ...(s.edgeTol ?? {}) }, est: s.estRmse };
  // inks: move each ink by the render's mean miss over its regions (a colour-conversion shift is the same everywhere);
  // when its regions miss in different directions (lighting, shading on one of them) the ink stays and it is reported
  const groups = new Map<number, { r: number; e: number[]; w: number }[]>();
  for (const x of m.regions) {
    if (s.meta[x.r].ramp || s.meta[x.r].multiply) continue;
    const c = s.meta[x.r].colour;
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c)!.push({ r: x.r, e: [x.ref[0] - x.got[0], x.ref[1] - x.got[1], x.ref[2] - x.got[2]], w: rl[x.r].area });
  }
  for (const [c, list] of groups) {
    const col = s.colours[c], W = list.reduce((a, x) => a + x.w, 0);
    const mean = [0, 1, 2].map((k) => list.reduce((a, x) => a + x.e[k] * x.w, 0) / W), size = Math.hypot(mean[0], mean[1], mean[2]);
    const spread = Math.max(...list.map((x) => Math.hypot(x.e[0] - mean[0], x.e[1] - mean[1], x.e[2] - mean[2])));
    if (col.swatch) continue; // swatches the user chose stay
    if (list.length > 1 && spread > threshold) { left.push({ r: list[0].r, why: `c${c} misses ΔE ${size.toFixed(1)} but its regions disagree (ΔE ${spread.toFixed(0)} apart: shading?) — give them their own ink (rN = #hex) or ramp` }); continue; }
    if (size <= threshold) continue;
    // one region far off its ink is shading or a mis-assigned patch, not a colour-conversion shift (F42: a skin shadow
    // "corrected" by ΔE 26.8 into a dark brown patch): reported, not moved
    if (list.length === 1 && size > 2.5 * threshold) { left.push({ r: list[0].r, why: `c${c} misses ΔE ${size.toFixed(1)} on its only region: too far for a conversion shift — set rN = #hex or ramp it if the image's colour is wanted` }); continue; }
    s.colours[c] = { ...col, L: col.L + mean[0], a: col.a + mean[1], b: col.b + mean[2] };
    fixed.push({ what: `c${c}`, why: `tone ΔE ${size.toFixed(1)} → corrected` });
  }
  const inkFixes = fixed.length, inkColours = JSON.parse(JSON.stringify(s.colours));
  // edges: tighter tolerance where the fit misses the image edge (a tolerance set by an edit is left alone)
  s.edgeTol = s.edgeTol ?? {};
  const edgeFixes: RefineReport['fixed'] = [];
  const tightened = new Map<string, { prev: number | undefined; dev: number; fix: RefineReport['fixed'][number] }>();
  for (const e of m.edges) {
    if (s.meta[e.left].tol !== undefined || s.meta[e.right].tol !== undefined) continue;
    if (e.dev <= Math.max(1, s.tol)) continue; // misses the image edge by more than its own tolerance
    const key = e.left < e.right ? `${e.left},${e.right}` : `${e.right},${e.left}`;
    if (tightened.has(key)) { tightened.get(key)!.dev = Math.max(tightened.get(key)!.dev, e.dev); continue; } // one pair, several edges: halve once
    const now = s.edgeTol[key] ?? s.tol;
    if (now <= 0.4) { left.push({ r: e.left, why: `edge r${e.left}|r${e.right} ${e.dev} px off at tolerance ${now}` }); continue; }
    tightened.set(key, { prev: s.edgeTol[key], dev: e.dev, fix: { what: `edge r${e.left}|r${e.right}`, why: '' } });
    s.edgeTol[key] = Math.max(0.4, now / 2);
    tightened.get(key)!.fix.why = `${e.dev} px off → tolerance ${s.edgeTol[key]}`;
  }
  // a tighter fit must bring the edge closer to the image's edge; on a noisy (JPEG) image it only follows the noise
  // (F17: rmse never moved): such edges keep their tolerance and are reported
  if (tightened.size) {
    recompute(s);
    const devOf = (key: string) => Math.max(0, ...s.pm.edges.filter((x) => (x.left < x.right ? `${x.left},${x.right}` : `${x.right},${x.left}`) === key).map((x) => edgeDeviation(s, x.id)));
    for (const [key, t] of tightened) {
      const d = devOf(key);
      if (d <= 0.85 * t.dev) { edgeFixes.push(t.fix); continue; }
      if (t.prev === undefined) delete s.edgeTol[key]; else s.edgeTol[key] = t.prev;
      const [l, r] = key.split(',');
      left.push({ r: +l, why: `edge r${l}|r${r} ${t.dev} px off; a tighter fit doesn't come closer (${d} px: noise or a soft edge) — tolerance kept` });
    }
  }
  fixed.push(...edgeFixes.slice(0, 8));
  const more = Math.max(0, edgeFixes.length - 8);
  for (const x of m.regions) if (x.iou < 0.8 && rl[x.r].area > s.work.w * s.work.h * 0.002) left.push({ r: x.r, why: `shape IoU ${x.iou} (merge or split?)` });
  // tone checks the owner looks at: darkest and lightest region
  const live = m.regions.filter((x) => rl[x.r].area > s.work.w * s.work.h * 0.001);
  const by = (f: (a: number, b: number) => boolean) => live.reduce((p, x) => (f(rl[x.r].L, rl[p.r].L) ? x : p), live[0]);
  const dk = live.length ? by((a, b) => a < b) : null, lt = live.length ? by((a, b) => a > b) : null;
  const L = (id: number) => Math.round(s.colours[s.meta[id].colour].L);
  // keep what helps: all fixes, else only the ink fixes or only the edge fixes, else none (F31: one bad kind of fix
  // reverted everything on a 426-region scene)
  let reverted: RefineReport['reverted'] = false;
  if (fixed.length) {
    const edgeTol = { ...s.edgeTol }, worse = () => s.estRmse > before.est + 0.002;
    recompute(s);
    if (worse()) {
      const tries: { kind: 'inks' | 'edges'; colours: typeof before.colours; tol: typeof edgeTol }[] = [];
      if (inkFixes && edgeFixes.length) tries.push({ kind: 'edges', colours: inkColours, tol: before.edgeTol }, { kind: 'inks', colours: before.colours, tol: edgeTol });
      let best: (typeof tries)[number] | null = null, bestEst = Infinity;
      for (const t of tries) {
        s.colours = JSON.parse(JSON.stringify(t.colours)); s.edgeTol = { ...t.tol }; recompute(s);
        if (!worse() && s.estRmse < bestEst) { best = t; bestEst = s.estRmse; }
      }
      if (best) {
        s.colours = JSON.parse(JSON.stringify(best.colours)); s.edgeTol = { ...best.tol }; recompute(s);
        reverted = best.kind;
        if (best.kind === 'inks') fixed.splice(0, inkFixes); else fixed.splice(inkFixes);
      } else { s.colours = before.colours; s.edgeTol = before.edgeTol; recompute(s); reverted = true; }
    }
  }
  let maxSeg = { r: -1, n: 0 };
  for (const sh of s.shapes) { const n = sh.loops.reduce((a, l) => a + l.length, 0); if (n > maxSeg.n) maxSeg = { r: sh.region, n }; }
  return {
    rmse_before: m.rmse, fixed: reverted === true ? [] : fixed, ...(more && (!reverted || reverted === 'inks') ? { more } : {}), left: left.slice(0, 8), ...(reverted ? { reverted } : {}),
    checks: { ...(dk && lt && s.meta[dk.r].colour !== s.meta[lt.r].colour ? { darkest: { ref: Math.round(rl[dk.r].L), scene: L(dk.r) }, lightest: { ref: Math.round(rl[lt.r].L), scene: L(lt.r) } } : {}), max_segments: maxSeg },
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
