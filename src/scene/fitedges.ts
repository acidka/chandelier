// scene analyze, step 6: every planar-map edge fitted once (both neighbours reuse the curve, so they meet exactly).
// Sharp corners split an edge (free tangents: a crisp joint); at a junction the two edges that continue each other get
// one shared tangent (a T keeps its smooth through-curve); a closed loop starts at a corner, or at its top point with a
// level handle (the designer's convention, no kink at the seam).
import { fitCurve, type P, type Seg } from '../fitcurve.js';
import type { PlanarMap, Edge } from './planar.js';

export interface FitEdgesOpts {
  /** tolerance per edge (px) */
  tolOf?: (e: Edge) => number;
  /** turning angle that makes a corner (degrees) */
  cornerDeg?: number;
}

const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1]];
const len = (a: number[]) => Math.hypot(a[0], a[1]);
const norm = (a: number[]) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };

function arc(p: number[][]): number[] {
  const s = [0];
  for (let i = 1; i < p.length; i++) s.push(s[i - 1] + len(sub(p[i], p[i - 1])));
  return s;
}

/** largest distance of p[a..b] from the chord p[a] → p[b] */
function deviation(p: number[][], a: number, b: number): number {
  const d = sub(p[b], p[a]), L = len(d) || 1;
  let m = 0;
  for (let i = a + 1; i < b; i++) m = Math.max(m, Math.abs((p[i][0] - p[a][0]) * d[1] - (p[i][1] - p[a][1]) * d[0]) / L);
  return m;
}

/** Indices of sharp corners: turning angle over ±k px above minDeg, a local maximum, with both arms (2k px) straight.
 * A small circle turns as much but has no straight arms, so it gets no corners. */
export function corners(p: number[][], closed: boolean, k = 4, minDeg = 45): number[] {
  const n = p.length;
  if (n < 5) return [];
  const q = closed ? [...p, ...p, ...p] : p, off = closed ? n : 0, s = arc(q);
  const at = (i: number, dist: number) => { // index at arc distance dist from i (negative: backward), or -1
    let j = i;
    if (dist > 0) { while (j < q.length - 1 && s[j] - s[i] < dist) j++; return s[j] - s[i] >= dist * 0.75 ? j : -1; }
    while (j > 0 && s[i] - s[j] < -dist) j--;
    return s[i] - s[j] >= -dist * 0.75 ? j : -1;
  };
  const ang = new Float64Array(n).fill(0);
  for (let t = 0; t < n; t++) {
    const i = t + off, a = at(i, -k), b = at(i, k);
    if (a < 0 || b < 0) continue;
    const u = norm(sub(q[i], q[a])), v = norm(sub(q[b], q[i]));
    ang[t] = (Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]))) * 180) / Math.PI;
  }
  const out: number[] = [];
  for (let t = 0; t < n; t++) {
    if (ang[t] < minDeg) continue;
    const i = t + off;
    // local maximum within ±k px (ties: the first one wins)
    const idx = (j: number) => (closed ? (((j - off) % n) + n) % n : j);
    let best = true;
    for (let j = i - 1; j >= 0 && s[i] - s[j] <= k && best; j--) { const tj = idx(j); if (ang[tj] > ang[t] || (ang[tj] === ang[t] && tj < t)) best = false; }
    for (let j = i + 1; j < q.length && s[j] - s[i] <= k && best; j++) { const tj = idx(j); if (ang[tj] > ang[t] || (ang[tj] === ang[t] && tj < t)) best = false; }
    if (!best) continue;
    const a2 = at(i, -2 * k), b2 = at(i, 2 * k);
    if (a2 < 0 || b2 < 0) continue;
    if (deviation(q, a2, i) > 0.75 || deviation(q, i, b2) > 0.75) continue;
    if (!closed && (s[i] < k || s[n - 1] - s[i] < k)) continue;
    if (!out.length || Math.abs(t - out[out.length - 1]) > 2) out.push(t);
  }
  return out;
}

/** direction of travel leaving the start of points p (from about d px along) */
function leaving(p: number[][], d = 5): number[] {
  let j = 1;
  while (j < p.length - 1 && len(sub(p[j], p[0])) < d) j++;
  return norm(sub(p[j], p[0]));
}

/** reverse a run of segments (the other side's view of a shared edge) */
export const reverseSegs = (segs: Seg[]): Seg[] => segs.map((c) => [c[3], c[2], c[1], c[0]] as Seg).reverse();

/** Fit every edge: returns segments per edge id, in the edge's own direction. */
export function fitEdges(pm: PlanarMap, o: FitEdgesOpts = {}): Seg[][] {
  const tolOf = o.tolOf ?? (() => 1), minDeg = o.cornerDeg ?? 45;
  // through-pairs at junctions: shared tangents (direction of travel along the edge at that end)
  const t0 = new Map<number, number[]>(), t1 = new Map<number, number[]>();
  const atJ = new Map<number, { e: number; start: boolean; dir: number[] }[]>();
  for (const e of pm.edges) {
    if (e.closed || e.pts.length < 3) continue;
    const push = (j: number, start: boolean) => {
      const pts = start ? e.pts : [...e.pts].reverse();
      let a = atJ.get(j);
      if (!a) atJ.set(j, (a = []));
      a.push({ e: e.id, start, dir: leaving(pts) });
    };
    push(e.j0, true);
    if (e.j1 !== e.j0) push(e.j1, false);
  }
  for (const list of atJ.values()) {
    const free = [...list];
    while (free.length >= 2) {
      let bi = -1, bj = -1, best = Math.cos((150 * Math.PI) / 180);
      for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) {
        const c = free[i].dir[0] * free[j].dir[0] + free[i].dir[1] * free[j].dir[1];
        if (c < best) { best = c; bi = i; bj = j; }
      }
      if (bi < 0) break;
      const A = free[bi], B = free[bj], T = norm(sub(A.dir, B.dir)); // A leaves along T, B along −T
      for (const [x, out] of [[A, T], [B, [-T[0], -T[1]]]] as [typeof A, number[]][]) {
        if (x.start) t0.set(x.e, out); else t1.set(x.e, [-out[0], -out[1]]); // at an edge's end, travel is toward the junction
      }
      free.splice(bj, 1); free.splice(bi, 1);
    }
  }
  return pm.edges.map((e) => fitEdge(e, tolOf(e), minDeg, t0.get(e.id), t1.get(e.id)));
}

/** moving average over ±r points (staircases of crack midpoints → straight lines); fixed indices keep their place */
function relax(p: number[][], r: number, closed: boolean, fixed: Set<number>): number[][] {
  const n = p.length;
  return p.map((q, i) => {
    if (fixed.has(i) || (!closed && (i === 0 || i === n - 1))) return q;
    let x = 0, y = 0, c = 0;
    for (let k = -r; k <= r; k++) {
      let j = i + k;
      if (closed) j = ((j % n) + n) % n;
      else if (j < 0 || j >= n) continue;
      // don't average across a fixed point (a corner)
      if (k && [...fixed].some((f) => (k > 0 ? (closed ? ((f - i + n) % n) : f - i) : (closed ? ((i - f + n) % n) : i - f)) > 0 && (k > 0 ? (closed ? ((f - i + n) % n) : f - i) : (closed ? ((i - f + n) % n) : i - f)) <= Math.abs(k))) continue;
      x += p[j][0]; y += p[j][1]; c++;
    }
    return [x / c, y / c];
  });
}

/** a corner's exact position: where the two arms' lines cross (crack midpoints cut a pixel corner) */
function sharpen(p: number[][], i: number, closed: boolean, k = 6): number[] {
  const n = p.length, at = (j: number) => p[closed ? ((j % n) + n) % n : Math.max(0, Math.min(n - 1, j))];
  const a0 = at(i - k), a1 = at(i - 1), b0 = at(i + 1), b1 = at(i + k);
  const d1 = sub(a1, a0), d2 = sub(b1, b0), den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-9) return p[i];
  const t = ((b0[0] - a0[0]) * d2[1] - (b0[1] - a0[1]) * d2[0]) / den, x = [a0[0] + t * d1[0], a0[1] + t * d1[1]];
  return len(sub(x, p[i])) < 2 ? x : p[i];
}

function fitEdge(e: Edge, tol: number, minDeg: number, T0?: number[], T1?: number[]): Seg[] {
  let p = e.pts;
  if (!e.closed && p.length <= 5) return fitCurve([p[0], p[p.length - 1]], {});
  const c = corners(p, e.closed, 4, minDeg);
  const fixed = new Set(c);
  // two passes of ±4: crack staircases and a JPEG fringe's ±1 px wobble become a smooth line; corners stay fixed
  p = relax(relax(p, 4, e.closed, fixed), 4, e.closed, fixed);
  for (const i of c) p[i] = sharpen(e.pts, i, e.closed);
  if (e.closed) {
    if (c.length) {
      // start at a corner, split at the others: crisp joints all round
      const r = [...p.slice(c[0]), ...p.slice(0, c[0]), p[c[0]]], cuts = c.map((i) => (i - c[0] + p.length) % p.length).concat(p.length);
      return pieces(r, cuts, tol);
    }
    // start at the top (middle of the topmost run), level handles at the seam
    let top = 0;
    for (let i = 1; i < p.length; i++) if (p[i][1] < p[top][1] - 1e-9) top = i;
    let a = top, b = top;
    while (Math.abs(p[(a - 1 + p.length) % p.length][1] - p[top][1]) < 0.05 && (a - 1 + p.length) % p.length !== b) a = (a - 1 + p.length) % p.length;
    while (Math.abs(p[(b + 1) % p.length][1] - p[top][1]) < 0.05 && (b + 1) % p.length !== a) b = (b + 1) % p.length;
    top = (a + Math.round((((b - a) + p.length) % p.length) / 2)) % p.length;
    p = [...p.slice(top), ...p.slice(0, top), p[top]];
    const dir = Math.sign(p[1][0] - p[p.length - 2][0]) || 1;
    return fitCurve(p, { tolerance: tol, t0: [dir, 0], t1: [dir, 0] });
  }
  if (!c.length) return fitCurve(p, { tolerance: tol, t0: T0, t1: T1 });
  const out: Seg[] = [], cuts = [0, ...c, p.length - 1];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const piece = p.slice(cuts[i], cuts[i + 1] + 1);
    out.push(...fitCurve(piece.length >= 2 ? piece : [p[cuts[i]], p[cuts[i + 1]]], { tolerance: tol, t0: i === 0 ? T0 : undefined, t1: i + 2 === cuts.length ? T1 : undefined }));
  }
  return out;
}

/** fit r split at the cut indices (first piece starts at 0, last ends at the last point) */
function pieces(r: number[][], cuts: number[], tol: number): Seg[] {
  const out: Seg[] = [];
  let from = 0;
  for (const c of cuts) {
    const to = Math.min(c, r.length - 1);
    if (to <= from) continue;
    out.push(...fitCurve(r.slice(from, to + 1), { tolerance: tol }));
    from = to;
  }
  return out;
}

export type { P, Seg };
