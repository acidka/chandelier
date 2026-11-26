// scene analyze, step 3: the inks. Weighted k-means on a Lab histogram (fast: ~10⁴ bins instead of 10⁶ pixels),
// then the closest colours merge while they are within minDe — so k is a cap and the ΔE floor picks the real count.
import { de76, mixT } from './color.js';
import type { Lab } from './color.js';

export function mulberry32(seed: number): () => number {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export interface QuantOpts { colors?: number; minDe?: number; seed?: number; /** pixels to leave out (alpha) */ skip?: Uint8Array; /** give anti-aliased / fringe pixels the label of the side they are nearer (default true) */ unmix?: boolean }
export interface Quant {
  k: number;
  /** k × [L, a, b] */
  centres: Float32Array;
  /** pixel count per centre */
  counts: number[];
  /** centre index per pixel (255 = skipped) */
  labels: Uint8Array;
}

const binOf = (l: number, a: number, b: number) => {
  const li = Math.max(0, Math.min(100, Math.round(l))), ai = Math.max(0, Math.min(127, Math.floor((a + 128) / 2))), bi = Math.max(0, Math.min(127, Math.floor((b + 128) / 2)));
  return (li << 14) | (ai << 7) | bi;
};

export function quantize(lab: Lab, o: QuantOpts = {}): Quant {
  const n = lab.w * lab.h, kMax = Math.max(1, Math.min(64, o.colors ?? 16)), minDe = o.minDe ?? 6;
  // centres come from flat pixels only: anti-aliased rims and soft edges are mixtures of two inks and would get
  // clusters of their own (they are assigned to the nearest ink afterwards); all pixels if too few are flat
  const fr: Fringe = { t: new Float32Array(n), k: new Int8Array(n).fill(-1) };
  const flat = flatMask(lab, Math.max(3, minDe), o.skip, fr);
  const side = fringeSides(fr, lab.w, lab.h);
  // histogram
  const idx = new Map<number, number>(), bins: number[][] = []; // [n flat, ΣL, Σa, Σb, n all]
  const pixBin = new Int32Array(n);
  let used = 0;
  for (let i = 0; i < n; i++) {
    if (o.skip?.[i]) { pixBin[i] = -1; continue; }
    const key = binOf(lab.L[i], lab.A[i], lab.B[i]);
    let j = idx.get(key);
    if (j === undefined) { j = bins.length; idx.set(key, j); bins.push([0, 0, 0, 0, 0]); }
    const bn = bins[j]; bn[4]++;
    if (flat && !flat[i]) { pixBin[i] = j; continue; }
    bn[0]++; bn[1] += lab.L[i]; bn[2] += lab.A[i]; bn[3] += lab.B[i];
    pixBin[i] = j; used++;
  }
  const m = bins.length, bw = new Float64Array(m), bl = new Float64Array(m * 3);
  // a bin with no flat pixel: weight 0 while fitting; its position is the bin centre (good to ±1 ΔE for assignment)
  [...idx.entries()].forEach(([key, j]) => {
    const t = bins[j];
    bw[j] = t[0];
    if (t[0]) { bl[j * 3] = t[1] / t[0]; bl[j * 3 + 1] = t[2] / t[0]; bl[j * 3 + 2] = t[3] / t[0]; }
    else { bl[j * 3] = key >> 14; bl[j * 3 + 1] = ((key >> 7) & 127) * 2 - 127; bl[j * 3 + 2] = (key & 127) * 2 - 127; }
  });
  if (!m) return { k: 0, centres: new Float32Array(0), counts: [], labels: new Uint8Array(n).fill(255) };
  // weighted k-means++ seeding
  const rnd = mulberry32(o.seed ?? 1), k0 = Math.min(kMax, m);
  let C: number[][] = [];
  const d2 = new Float64Array(m).fill(Infinity);
  const pick = (j: number) => C.push([bl[j * 3], bl[j * 3 + 1], bl[j * 3 + 2]]);
  { let r = rnd() * used, j = 0; for (; j < m - 1 && (r -= bw[j]) > 0; j++); pick(j); }
  while (C.length < k0) {
    const c = C[C.length - 1];
    let tot = 0;
    for (let j = 0; j < m; j++) { const d = (bl[j * 3] - c[0]) ** 2 + (bl[j * 3 + 1] - c[1]) ** 2 + (bl[j * 3 + 2] - c[2]) ** 2; if (d < d2[j]) d2[j] = d; tot += bw[j] * d2[j]; }
    if (tot <= 0) break;
    let r = rnd() * tot, j = 0;
    for (; j < m - 1 && (r -= bw[j] * d2[j]) > 0; j++);
    pick(j);
  }
  const assign = new Int32Array(m);
  const nearest = (j: number) => { let best = 0, bd = Infinity; for (let c = 0; c < C.length; c++) { const d = (bl[j * 3] - C[c][0]) ** 2 + (bl[j * 3 + 1] - C[c][1]) ** 2 + (bl[j * 3 + 2] - C[c][2]) ** 2; if (d < bd) { bd = d; best = c; } } return best; };
  const update = () => {
    const s = C.map(() => [0, 0, 0, 0]);
    for (let j = 0; j < m; j++) { const c = (assign[j] = nearest(j)), t = s[c]; t[0] += bw[j]; t[1] += bw[j] * bl[j * 3]; t[2] += bw[j] * bl[j * 3 + 1]; t[3] += bw[j] * bl[j * 3 + 2]; }
    let shift = 0;
    const next = s.map((t, c) => (t[0] ? [t[1] / t[0], t[2] / t[0], t[3] / t[0], t[0]] : [...C[c], 0]));
    next.forEach((c, i) => { shift = Math.max(shift, de76(c[0], c[1], c[2], C[i][0], C[i][1], C[i][2])); });
    return { next, shift };
  };
  let W: number[] = [];
  for (let it = 0; it < 20; it++) {
    const { next, shift } = update();
    C = next.map((c) => c.slice(0, 3)); W = next.map((c) => c[3]);
    if (shift < 0.1) break;
  }
  // merge the closest pair while within minDe (weighted mean); drop specks (< 0.01 %)
  const alive = () => C.map((_, i) => i).filter((i) => W[i] > 0);
  for (;;) {
    const a = alive();
    let bi = -1, bj = -1, bd = Infinity;
    for (let x = 0; x < a.length; x++) for (let y = x + 1; y < a.length; y++) {
      const p = C[a[x]], q = C[a[y]], d = de76(p[0], p[1], p[2], q[0], q[1], q[2]);
      if (d < bd) { bd = d; bi = a[x]; bj = a[y]; }
    }
    if (bi < 0 || bd >= minDe) break;
    const t = W[bi] + W[bj];
    C[bi] = [0, 1, 2].map((c) => (C[bi][c] * W[bi] + C[bj][c] * W[bj]) / t); W[bi] = t; W[bj] = 0;
  }
  for (const i of alive()) if (W[i] < used * 1e-4 && alive().length > 1) W[i] = 0;
  // a small cluster whose colour is a mix of two bigger inks (where three inks meet, soft corners) is not an ink
  const big = alive().filter((i) => W[i] >= used * 0.01);
  for (const i of alive()) {
    if (W[i] >= used * 0.01) continue;
    mix: for (let x = 0; x < big.length; x++) for (let y = x + 1; y < big.length; y++) {
      const t = mixT(C[i], C[big[x]], C[big[y]], minDe * 1.5);
      if (t > 0.1 && t < 0.9) { W[i] = 0; break mix; }
    }
  }
  C = alive().map((i) => C[i]);
  // final assignment, then centres as the exact mean of their pixels
  const sums = C.map(() => [0, 0, 0, 0]);
  const all = C.map(() => 0);
  for (let j = 0; j < m; j++) { const c = (assign[j] = nearest(j)), t = sums[c]; t[0] += bw[j]; t[1] += bw[j] * bl[j * 3]; t[2] += bw[j] * bl[j * 3 + 1]; t[3] += bw[j] * bl[j * 3 + 2]; all[c] += bins[j][4]; }
  const keep = sums.map((t, i) => i).filter((i) => sums[i][0] > 0), remap = new Int32Array(C.length).fill(-1);
  keep.forEach((c, i) => { remap[c] = i; });
  const k = keep.length, centres = new Float32Array(k * 3), counts = keep.map((c) => all[c]);
  keep.forEach((c, i) => { const t = sums[c]; centres[i * 3] = t[1] / t[0]; centres[i * 3 + 1] = t[2] / t[0]; centres[i * 3 + 2] = t[3] / t[0]; });
  const labels = new Uint8Array(n);
  for (let i = 0; i < n; i++) labels[i] = pixBin[i] < 0 ? 255 : remap[assign[pixBin[i]]];
  // unmix: a pixel between two inks (anti-aliasing, a JPEG fringe) takes the ink of the side it is nearer — fringes
  // vanish before regions exist, and a real thin stroke (not between two sides) keeps its own ink
  if (o.unmix !== false) for (let pass = 0; pass < 3; pass++) {
    let moved = 0;
    for (let i = 0; i < n; i++) { const j = side[i]; if (j >= 0 && labels[j] !== 255 && labels[i] !== labels[j]) { labels[i] = labels[j]; moved++; } }
    if (!moved) break;
  }
  return { k, centres, counts, labels };
}

/** pairs of inks closer than limit (merge candidates for the summary), closest first */
export function nearPairs(q: Quant, limit: number): { a: number; b: number; de: number }[] {
  const out: { a: number; b: number; de: number }[] = [], c = q.centres;
  for (let a = 0; a < q.k; a++) for (let b = a + 1; b < q.k; b++) {
    const de = de76(c[a * 3], c[a * 3 + 1], c[a * 3 + 2], c[b * 3], c[b * 3 + 1], c[b * 3 + 2]);
    if (de < limit) out.push({ a, b, de });
  }
  return out.sort((x, y) => x.de - y.de);
}

/** 1 for pixels that are an ink of their own, 0 for mixtures: a pixel whose colour lies between its two opposite
 * neighbours (left/right or up/down; diagonals too) and clearly differs from one of them is an anti-aliased or soft
 * edge. A thin line's pixels are not between their neighbours (they are darker than both), so lines keep their ink.
 * null when under 10 % of the pixels qualify. */
/** fringe pixels: k = the neighbour pair (index into PAIRS) the pixel lies between, t = its place on the mix p → q */
interface Fringe { t: Float32Array; k: Int8Array }
const PAIRS = [[-1, 0, 1, 0], [0, -1, 0, 1], [-1, -1, 1, 1], [1, -1, -1, 1]];

/** the side each fringe pixel joins (p or q of its pair): the nearer one by its mix position t. Near a tie (an edge
 * through the pixel middle, where noise alone would decide and a half-covered row zigzags by 1 px) t is averaged along
 * the edge (±4 fringe pixels of the same pair), and a tie that stays goes to p, so the whole row decides alike. Clear
 * pixels keep their own t: on a tight curve the neighbours along a straight line are not the same coverage. */
function fringeSides(fr: Fringe, w: number, h: number): Int32Array {
  const side = new Int32Array(w * h).fill(-1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, k = fr.k[i];
    if (k < 0) continue;
    const p = (y + PAIRS[k][1]) * w + x + PAIRS[k][0], q = (y + PAIRS[k][3]) * w + x + PAIRS[k][2];
    if (Math.abs(fr.t[i] - 0.5) >= 0.1) { side[i] = fr.t[i] < 0.5 ? p : q; continue; }
    const [ax, ay, bx, by] = PAIRS[k], ux = -(by - ay) / 2, uy = (bx - ax) / 2; // along the edge
    let sum = fr.t[i], c = 1;
    for (const s of [1, -1]) for (let d = 1; d <= 4; d++) {
      const xx = x + s * d * ux, yy = y + s * d * uy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) break;
      const j = yy * w + xx;
      if (fr.k[j] !== k || Math.abs(fr.t[j] - 0.5) >= 0.1) break; // only a run of near-ties: a straight edge at one coverage
      sum += fr.t[j]; c++;
    }
    const m = sum / c;
    side[i] = m < 0.5 || Math.abs(m - 0.5) < 0.03 ? p : q;
  }
  return side;
}

function flatMask(lab: Lab, lim: number, skip?: Uint8Array, fr?: Fringe): Uint8Array | null {
  const { w, h, L, A, B } = lab, out = new Uint8Array(w * h), l2 = lim * lim;
  let n = 0, total = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (skip?.[i]) continue;
    total++;
    let ok = 1;
    for (let k = 0; k < PAIRS.length; k++) {
      const [ax, ay, bx, by] = PAIRS[k];
      const x1 = x + ax, y1 = y + ay, x2 = x + bx, y2 = y + by;
      if (x1 < 0 || y1 < 0 || x2 < 0 || y2 < 0 || x1 >= w || x2 >= w || y1 >= h || y2 >= h) continue;
      const p = y1 * w + x1, q = y2 * w + x2;
      const v0 = L[q] - L[p], v1 = A[q] - A[p], v2 = B[q] - B[p], vv = v0 * v0 + v1 * v1 + v2 * v2;
      if (vv < l2) continue; // no edge across this pair
      // strict test, or a loose one (sRGB 40) near the middle of the mix: JPEG chroma blur moves a fringe pixel off the
      // straight mix of its two sides; textured surfaces stay inks
      const t = mixT([L[i], A[i], B[i]], [L[p], A[p], B[p]], [L[q], A[q], B[q]], lim * 1.5);
      const tl = t > 0.1 && t < 0.9 ? t : mixT([L[i], A[i], B[i]], [L[p], A[p], B[p]], [L[q], A[q], B[q]], 40);
      if ((t > 0.1 && t < 0.9) || (tl > 0.25 && tl < 0.75)) { ok = 0; if (fr) { fr.k[i] = k; fr.t[i] = t > 0.1 && t < 0.9 ? t : tl; } break; } // between the two sides: a mixture, not an ink
    }
    out[i] = ok; n += ok;
  }
  return n >= total * 0.1 ? out : null;
}

