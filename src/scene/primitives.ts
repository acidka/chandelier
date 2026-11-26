// scene S2a: regions that are clean primitives — ellipse / circle, rectangle, rounded rectangle, regular polygon —
// are drawn as that primitive (axis-aligned ones as live Illustrator shapes) instead of a fitted outline. Tested on the
// region's filled outer boundary: moments for the ellipse, the minimum-area rectangle (rotating calipers) for the
// rectangles, hull + simplification for polygons; accepted only when the boundary stays close to the primitive.
import type { Seg } from '../fitcurve.js';

export type PrimKind = 'ellipse' | 'circle' | 'rect' | 'rounded' | 'polygon';
export interface Prim {
  kind: PrimKind;
  cx: number; cy: number;
  /** half sizes along the primitive's own axes (polygon: circumradius in a) */
  a: number; b: number;
  /** rotation, radians */
  angle: number;
  /** rounded: corner radius; polygon: sides */
  r?: number; n?: number;
  /** mean boundary distance, px */
  err: number;
}

const K = 0.5522847498;

function hull(p: number[][]): number[][] {
  const q = [...p].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: number[][] = [], up: number[][] = [];
  for (const x of q) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], x) <= 0) lo.pop(); lo.push(x); }
  for (let i = q.length - 1; i >= 0; i--) { const x = q[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], x) <= 0) up.pop(); up.push(x); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** area, centroid and central second moments of a closed polygon (Green's theorem) */
function moments(p: number[][]) {
  let A = 0, cx = 0, cy = 0, xx = 0, yy = 0, xy = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length], c = x0 * y1 - x1 * y0;
    A += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
    xx += (x0 * x0 + x0 * x1 + x1 * x1) * c; yy += (y0 * y0 + y0 * y1 + y1 * y1) * c; xy += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * c;
  }
  A /= 2; cx /= 6 * A; cy /= 6 * A; xx /= 12; yy /= 12; xy /= 24;
  const s = Math.sign(A) || 1;
  return { A: Math.abs(A), cx, cy, mxx: (s * xx) / Math.abs(A) - cx * cx, myy: (s * yy) / Math.abs(A) - cy * cy, mxy: (s * xy) / Math.abs(A) - cx * cy };
}

/** signed-ish distance of point (u, v) (primitive frame) to the primitive's outline */
function outlineDist(pr: Prim, u: number, v: number): number {
  if (pr.kind === 'ellipse' || pr.kind === 'circle') {
    const rho = Math.hypot(u / pr.a, v / pr.b);
    return rho ? (Math.abs(rho - 1) * Math.hypot(u, v)) / rho : Math.min(pr.a, pr.b);
  }
  if (pr.kind === 'rect' || pr.kind === 'rounded') {
    const r = pr.kind === 'rounded' ? pr.r! : 0, qx = Math.abs(u) - (pr.a - r), qy = Math.abs(v) - (pr.b - r);
    return Math.abs(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r);
  }
  const vs = polyVerts(pr, false);
  let m = Infinity;
  for (let i = 0; i < vs.length; i++) m = Math.min(m, segDist([u, v], vs[i], vs[(i + 1) % vs.length]));
  return m;
}

function segDist(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** polygon vertices, in the primitive frame (world = false) or in image px */
function polyVerts(pr: Prim, world = true): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < pr.n!; i++) {
    const t = -Math.PI / 2 + (2 * Math.PI * i) / pr.n!, u = pr.a * Math.cos(t), v = pr.a * Math.sin(t);
    out.push(world ? toWorld(pr, u, v) : [u, v]);
  }
  return out;
}

const toWorld = (pr: Prim, u: number, v: number) => { const c = Math.cos(pr.angle), s = Math.sin(pr.angle); return [pr.cx + u * c - v * s, pr.cy + u * s + v * c]; };
const toLocal = (pr: Prim, x: number, y: number) => { const c = Math.cos(pr.angle), s = Math.sin(pr.angle), dx = x - pr.cx, dy = y - pr.cy; return [dx * c + dy * s, -dx * s + dy * c]; };

function score(pr: Prim, pts: number[][]): { mean: number; p95: number } {
  const d = pts.map((p) => { const [u, v] = toLocal(pr, p[0], p[1]); return outlineDist(pr, u, v); }).sort((a, b) => a - b);
  return { mean: d.reduce((a, b) => a + b, 0) / d.length, p95: d[Math.floor(d.length * 0.95)] };
}

/** snap an angle to 0 / 90° when within 1°; returns [angle, a, b] with a along the angle */
function snap(angle: number, a: number, b: number): [number, number, number] {
  let t = ((angle % Math.PI) + Math.PI) % Math.PI; // 0..π
  if (t > Math.PI / 2) { t -= Math.PI / 2; [a, b] = [b, a]; }
  if (t < (1 * Math.PI) / 180) return [0, a, b];
  if (Math.PI / 2 - t < (1 * Math.PI) / 180) return [0, b, a];
  return [t, a, b];
}

/** enclosed area of a primitive */
export function primArea(pr: Prim): number {
  if (pr.kind === 'ellipse' || pr.kind === 'circle') return Math.PI * pr.a * pr.b;
  if (pr.kind === 'rect') return 4 * pr.a * pr.b;
  if (pr.kind === 'rounded') return 4 * pr.a * pr.b - (4 - Math.PI) * pr.r! * pr.r!;
  return (pr.n! / 2) * pr.a * pr.a * Math.sin((2 * Math.PI) / pr.n!);
}

/** close to the outline everywhere, and the same area (a thin U-shaped frame hugs a rectangle's outline too) */
const ok = (pr: Prim, sc: { mean: number; p95: number }, size: number, area: number) =>
  sc.mean < Math.max(0.5, 0.015 * size) && sc.p95 < Math.max(1.5, 0.04 * size) && Math.abs(area - primArea(pr)) < 0.03 * primArea(pr);

/** Fit every primitive kind to the boundary points (a closed outline, image px); the best accepted one, or with
 * `force` the best of that kind even if it misses. */
export function detectPrimitive(pts: number[][], force?: PrimKind | 'polygon'): Prim | null {
  if (pts.length < 8) return null;
  const m = moments(pts), cands: { pr: Prim; sc: { mean: number; p95: number }; size: number }[] = [];
  const want = (k: PrimKind) => !force || force === k || (force === 'ellipse' && k === 'circle') || (force === 'circle' && k === 'ellipse');
  // ellipse from moments
  if (want('ellipse')) {
    const tr = m.mxx + m.myy, det = m.mxx * m.myy - m.mxy * m.mxy, disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
    const l1 = tr / 2 + disc, l2 = Math.max(1e-9, tr / 2 - disc);
    let [angle, a, b] = snap(0.5 * Math.atan2(2 * m.mxy, m.mxx - m.myy), 2 * Math.sqrt(l1), 2 * Math.sqrt(l2));
    const circle = Math.abs(a - b) / Math.max(a, b) < 0.03;
    if (circle) { a = b = (a + b) / 2; angle = 0; }
    const pr: Prim = { kind: circle ? 'circle' : 'ellipse', cx: m.cx, cy: m.cy, a, b, angle, err: 0 };
    cands.push({ pr, sc: score(pr, pts), size: Math.min(a, b) });
  }
  // minimum-area rectangle on the hull
  const H = hull(pts);
  if (want('rect') || want('rounded')) {
    let best: Prim | null = null, bestA = Infinity;
    for (let i = 0; i < H.length; i++) {
      const p = H[i], q = H[(i + 1) % H.length], t = Math.atan2(q[1] - p[1], q[0] - p[0]), c = Math.cos(t), s = Math.sin(t);
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const h of H) { const u = h[0] * c + h[1] * s, v = -h[0] * s + h[1] * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
      const area = (u1 - u0) * (v1 - v0);
      if (area < bestA) { bestA = area; const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2; best = { kind: 'rect', cx: uc * c - vc * s, cy: uc * s + vc * c, a: (u1 - u0) / 2, b: (v1 - v0) / 2, angle: t, err: 0 }; }
    }
    if (best) {
      const [angle, a, b] = snap(best.angle, best.a, best.b);
      const rect: Prim = { ...best, angle, a, b };
      if (want('rect')) cands.push({ pr: rect, sc: score(rect, pts), size: Math.min(a, b) });
      const r = Math.sqrt(Math.max(0, 4 * a * b - m.A) / (4 - Math.PI));
      if (want('rounded') && r >= 1.5 && r <= 0.9 * Math.min(a, b)) { const rr: Prim = { ...rect, kind: 'rounded', r }; cands.push({ pr: rr, sc: score(rr, pts), size: Math.min(a, b) }); }
    }
  }
  // regular polygons (3, 5, 6, 8 sides; 4 is the rectangle)
  if (want('polygon')) {
    for (const n of [3, 5, 6, 8]) {
      const circ = Math.sqrt((2 * m.A) / (n * Math.sin((2 * Math.PI) / n))); // circumradius from the area
      // rotation: the hull vertex farthest from the centre marks a corner
      let far = H[0], fd = 0;
      for (const h of H) { const d = Math.hypot(h[0] - m.cx, h[1] - m.cy); if (d > fd) { fd = d; far = h; } }
      const angle = Math.atan2(far[1] - m.cy, far[0] - m.cx) + Math.PI / 2;
      const pr: Prim = { kind: 'polygon', cx: m.cx, cy: m.cy, a: circ, b: circ, angle, n, err: 0 };
      cands.push({ pr, sc: score(pr, pts), size: circ * Math.cos(Math.PI / n) });
    }
  }
  // the simpler kind wins a near tie (a circle also fits a rounded square, a rectangle a hexagon's box)
  const W: Record<PrimKind, number> = { circle: 0.8, ellipse: 0.9, rect: 0.9, rounded: 1.1, polygon: 1.2 };
  const rank = (c: (typeof cands)[number]) => (c.sc.mean / Math.max(1, c.size)) * W[c.pr.kind];
  const good = cands.filter((c) => force || ok(c.pr, c.sc, c.size, m.A)).sort((x, y) => rank(x) - rank(y));
  if (!good.length) return null;
  const g = good[0];
  return { ...g.pr, err: Math.round(g.sc.mean * 100) / 100 };
}

const line = (a: number[], b: number[]): Seg => [a, [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3], [a[0] + (2 * (b[0] - a[0])) / 3, a[1] + (2 * (b[1] - a[1])) / 3], b] as Seg;
const pt = (pr: Prim, u: number, v: number) => toWorld(pr, u, v) as [number, number];

/** the primitive's outline as one closed loop of segments (image px) */
export function primSegs(pr: Prim): Seg[] {
  if (pr.kind === 'ellipse' || pr.kind === 'circle') {
    const { a, b } = pr, q: Seg[] = [];
    const P = [[0, -b], [a, 0], [0, b], [-a, 0]], H = [[[K * a, -b], [a, -K * b]], [[a, K * b], [K * a, b]], [[-K * a, b], [-a, K * b]], [[-a, -K * b], [-K * a, -b]]];
    for (let i = 0; i < 4; i++) q.push([pt(pr, P[i][0], P[i][1]), pt(pr, H[i][0][0], H[i][0][1]), pt(pr, H[i][1][0], H[i][1][1]), pt(pr, P[(i + 1) % 4][0], P[(i + 1) % 4][1])]);
    return q;
  }
  if (pr.kind === 'rect') {
    const c = [[-pr.a, -pr.b], [pr.a, -pr.b], [pr.a, pr.b], [-pr.a, pr.b]].map(([u, v]) => pt(pr, u, v));
    return c.map((p, i) => line(p, c[(i + 1) % 4]));
  }
  if (pr.kind === 'rounded') {
    const { a, b } = pr, r = pr.r!, k = K * r, q: Seg[] = [];
    const L = (u0: number, v0: number, u1: number, v1: number) => q.push(line(pt(pr, u0, v0), pt(pr, u1, v1)));
    const C = (p0: number[], h0: number[], h1: number[], p1: number[]) => q.push([pt(pr, p0[0], p0[1]), pt(pr, h0[0], h0[1]), pt(pr, h1[0], h1[1]), pt(pr, p1[0], p1[1])]);
    L(-a + r, -b, a - r, -b); C([a - r, -b], [a - r + k, -b], [a, -b + r - k], [a, -b + r]);
    L(a, -b + r, a, b - r); C([a, b - r], [a, b - r + k], [a - r + k, b], [a - r, b]);
    L(a - r, b, -a + r, b); C([-a + r, b], [-a + r - k, b], [-a, b - r + k], [-a, b - r]);
    L(-a, b - r, -a, -b + r); C([-a, -b + r], [-a, -b + r - k], [-a + r - k, -b], [-a + r, -b]);
    return q;
  }
  const v = polyVerts(pr);
  return v.map((p, i) => line(p, v[(i + 1) % v.length]));
}

/** axis-aligned rectangles, rounded rectangles, ellipses and circles become live shapes at build */
export const live = (pr: Prim) => pr.angle === 0 && pr.kind !== 'polygon';
