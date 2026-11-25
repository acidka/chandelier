// create_path {fit}: measured points → a smooth cubic Bézier with few anchors, placed where a designer would put them.
// Anchors go at the curve's extremes (peaks and troughs → horizontal handles; leftmost/rightmost points → vertical
// handles), then each piece between them is fitted by least squares (Schneider, "An Algorithm for Automatically
// Fitting Digitized Curves", Graphics Gems 1990) and split further only where it misses a point by more than the
// tolerance. Every joint keeps one tangent, so the curve has no kinks. Trained on the 2026-11-25 recreate job, where
// hand-written code for this took most of the time (roadmap "Faster free-form recreation").
type P = [number, number];
type Seg = [P, P, P, P];

const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const mul = (a: P, s: number): P => [a[0] * s, a[1] * s];
const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1];
const len = (a: P) => Math.hypot(a[0], a[1]);
const norm = (a: P): P => mul(a, 1 / (len(a) || 1));
const bez = (c: Seg, t: number): P => {
  const u = 1 - t;
  return add(add(mul(c[0], u * u * u), mul(c[1], 3 * u * u * t)), add(mul(c[2], 3 * u * t * t), mul(c[3], t * t * t)));
};
const bez1 = (c: Seg, t: number): P => {
  const u = 1 - t;
  return add(add(mul(sub(c[1], c[0]), 3 * u * u), mul(sub(c[2], c[1]), 6 * u * t)), mul(sub(c[3], c[2]), 3 * t * t));
};
const bez2 = (c: Seg, t: number): P => add(mul(add(sub(c[2], mul(c[1], 2)), c[0]), 6 * (1 - t)), mul(add(sub(c[3], mul(c[2], 2)), c[1]), 6 * t));

function chord(p: P[]): number[] {
  const u = [0];
  for (let i = 1; i < p.length; i++) u.push(u[i - 1] + len(sub(p[i], p[i - 1])));
  const L = u[u.length - 1] || 1;
  return u.map((v) => v / L);
}

/** least-squares handle lengths for fixed end tangents t1 (forward) and t2 (backward, from the end into the curve) */
function generate(p: P[], u: number[], t1: P, t2: P): Seg {
  const f = p[0], l = p[p.length - 1];
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  u.forEach((t, i) => {
    const a0 = mul(t1, 3 * (1 - t) * (1 - t) * t), a1 = mul(t2, 3 * (1 - t) * t * t);
    c00 += dot(a0, a0); c01 += dot(a0, a1); c11 += dot(a1, a1);
    const tmp = sub(p[i], bez([f, f, l, l], t));
    x0 += dot(a0, tmp); x1 += dot(a1, tmp);
  });
  const d = c00 * c11 - c01 * c01, seg = len(sub(l, f));
  let al = d ? (x0 * c11 - x1 * c01) / d : 0, ar = d ? (c00 * x1 - c01 * x0) / d : 0;
  // degenerate or looping handles: a third of the chord (Wu/Barsky heuristic)
  if (al < 1e-6 * seg || ar < 1e-6 * seg || al > seg * 1.5 || ar > seg * 1.5) al = ar = seg / 3;
  return [f, add(f, mul(t1, al)), add(l, mul(t2, ar)), l];
}

function maxError(p: P[], c: Seg, u: number[]): [number, number] {
  let m = 0, at = p.length >> 1;
  for (let i = 1; i < p.length - 1; i++) { const d = len(sub(bez(c, u[i]), p[i])); if (d > m) { m = d; at = i; } }
  return [m, at];
}

function fitPiece(p: P[], t1: P, t2: P, tol: number, out: Seg[], depth = 0): void {
  if (p.length === 2) { const d = len(sub(p[1], p[0])) / 3; out.push([p[0], add(p[0], mul(t1, d)), add(p[1], mul(t2, d)), p[1]]); return; }
  let u = chord(p), c = generate(p, u, t1, t2), [err, at] = maxError(p, c, u);
  if (err <= tol) { out.push(c); return; }
  for (let k = 0; k < 20; k++) { // Newton reparameterisation
    u = u.map((t, i) => {
      const d = sub(bez(c, t), p[i]), d1 = bez1(c, t), d2 = bez2(c, t), den = dot(d1, d1) + dot(d, d2);
      return den ? Math.min(1, Math.max(0, t - dot(d, d1) / den)) : t;
    });
    c = generate(p, u, t1, t2); [err, at] = maxError(p, c, u);
    if (err <= tol) { out.push(c); return; }
  }
  if (depth > 12 || p.length < 4) { out.push(c); return; }
  at = Math.max(1, Math.min(p.length - 2, at));
  const tc = norm(sub(p[at - 1], p[at + 1]));
  fitPiece(p.slice(0, at + 1), t1, tc, tol, out, depth + 1);
  fitPiece(p.slice(at), mul(tc, -1), t2, tol, out, depth + 1);
}

/** moving average (±r points), ends kept */
function smooth(p: P[], r: number): P[] {
  return p.map((_, i) => {
    if (i === 0 || i === p.length - 1) return p[i];
    const k = Math.min(r, i, p.length - 1 - i);
    let x = 0, y = 0;
    for (let j = i - k; j <= i + k; j++) { x += p[j][0]; y += p[j][1]; }
    return [x / (2 * k + 1), y / (2 * k + 1)] as P;
  });
}

/** Indices of prominent extremes of one coordinate (axis 1: peaks/troughs, 0: leftmost/rightmost) on smoothed
 * points; a wiggle smaller than `prom` is noise, not a turn. */
function extremes(s: P[], axis: 0 | 1, prom: number): number[] {
  // turning points of the sequence, then drop pairs whose swing is below prom (zig-zag filter)
  const v = s.map((q) => q[axis]), out: number[] = [];
  let dir = 0, piv = 0; // index of the running candidate extreme
  for (let i = 1; i < v.length; i++) {
    if (dir >= 0 && v[i] > v[piv]) { piv = i; if (dir === 0) dir = 1; continue; }
    if (dir <= 0 && v[i] < v[piv]) { piv = i; if (dir === 0) dir = -1; continue; }
    if (dir === 0) continue;
    if (Math.abs(v[i] - v[piv]) >= prom) { out.push(piv); dir = -dir; piv = i; }
  }
  // the first and last turn also need that swing against the curve's ends
  const end = v.length - 1;
  return out.filter((i, n) => i > 0 && i < end && (n > 0 || Math.abs(v[i] - v[0]) >= prom) && (n < out.length - 1 || Math.abs(v[i] - v[end]) >= prom));
}

/** direction at the start of the points, from the first few (one noisy pixel would tilt p1 − p0) */
function endTangent(p: P[], tol: number): P {
  let j = 1;
  while (j < p.length - 1 && len(sub(p[j], p[0])) < 4 * tol) j++;
  return norm(sub(p[j], p[0]));
}

export interface FitOpts { tolerance?: number }

/** Points (in order, ≥ 2) → Bézier segments. Anchors at extremes with horizontal / vertical handles, then split where
 * the curve misses a point by more than tolerance (default 1, in the points' units). */
export function fitCurve(pts: number[][], o: FitOpts = {}): Seg[] {
  const tol = Math.max(0.01, o.tolerance ?? 1);
  // drop repeats (a curve can't pass a point twice in a row)
  const p: P[] = [];
  for (const q of pts) if (!p.length || len(sub(q as P, p[p.length - 1])) > 1e-9) p.push([q[0], q[1]]);
  if (p.length < 2) throw new Error('fit needs at least 2 different points.');
  if (p.length === 2) { const d = sub(p[1], p[0]); return [[p[0], add(p[0], mul(d, 1 / 3)), add(p[0], mul(d, 2 / 3)), p[1]]]; }
  const s = smooth(p, 2), prom = 3 * tol;
  // anchors: extremes with an axis-aligned tangent (direction of travel through them)
  const cuts = new Map<number, P>();
  // found on the smoothed points, placed on the measured one (smoothing flattens a peak: the anchor would sit below
  // it and the fit would add a second anchor next to it)
  const exact = (i: number, axis: 0 | 1) => {
    const hi = s[i][axis] >= s[i - 1][axis];
    let b = i;
    for (let j = Math.max(1, i - 2); j <= Math.min(p.length - 2, i + 2); j++) if (hi ? p[j][axis] > p[b][axis] : p[j][axis] < p[b][axis]) b = j;
    return b;
  };
  for (const e of extremes(s, 1, prom)) { const i = exact(e, 1), dx = p[i + 1][0] - p[i - 1][0]; if (Math.abs(dx) > 1e-9) cuts.set(i, [Math.sign(dx), 0]); }
  for (const e of extremes(s, 0, prom)) { const i = exact(e, 0), dy = p[i + 1][1] - p[i - 1][1]; if (Math.abs(dy) > 1e-9 && !cuts.has(i)) cuts.set(i, [0, Math.sign(dy)]); }
  // two extremes a couple of points apart (a corner-ish turn) → keep the first
  const idx = [...cuts.keys()].sort((a, b) => a - b).filter((i, n, a) => n === 0 || i - a[n - 1] >= 3);
  const out: Seg[] = [];
  let from = 0, t1 = endTangent(p, tol);
  for (const i of [...idx, p.length - 1]) {
    const last = i === p.length - 1;
    const T = last ? null : cuts.get(i)!;
    const piece = p.slice(from, i + 1);
    const t2 = last ? endTangent([...piece].reverse(), tol) : mul(T!, -1);
    fitPiece(piece, t1, t2, tol, out);
    if (!last) t1 = T!;
    from = i;
  }
  return out;
}

const f = (v: number) => String(Math.round(v * 100) / 100);
const curve = (segs: Seg[]) => segs.map((c) => ` C${c.slice(1).map((q) => f(q[0]) + ' ' + f(q[1])).join(' ')}`).join('');

/** create_path {fit}: one point list (an open or closed curve) or several (fitted one by one, joined by straight
 * lines: a band = top edge left → right, then the bottom edge right → left, closed) → SVG path data. */
export function fitToD(fit: number[][] | number[][][], closed: boolean, o: FitOpts = {}): { d: string; anchors: number } {
  const parts = (Array.isArray(fit[0]?.[0]) ? fit : [fit]) as number[][][];
  let d = '', anchors = 0;
  parts.forEach((pts, n) => {
    const segs = fitCurve(pts, o);
    const s0 = segs[0][0];
    d += (n === 0 ? 'M' : ' L') + f(s0[0]) + ' ' + f(s0[1]) + curve(segs);
    anchors += segs.length + 1;
  });
  return { d: d + (closed ? ' Z' : ''), anchors };
}

export interface ShadeOpts { to: number | number[][]; steps?: number; opacity?: number; tolerance?: number }

/** create_path {fit, shade}: shading that follows a curve. Under (or beside) the fitted edge, a fade from `opacity`
 * at the edge to nothing at `to` (a distance, or the next edge's points), built as stacked paths: each one's near
 * side is the exact fitted edge (crisp), its far side lies k/(N+1) of the way to `to`. Multiply-stacked, they give a
 * linear fade with no clip and no gradient mesh (recreate.md § 5b). Returns path data and the opacity of each step. */
export function shadeToD(pts: number[][], o: ShadeOpts): { ds: string[]; opacity: number } {
  const segs = fitCurve(pts, { tolerance: o.tolerance });
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const ax = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? 0 : 1, bx = 1 - ax; // along, across
  // the fitted edge, sampled densely and ordered along its main axis
  const s: number[][] = [];
  for (const c of segs) for (let i = 0; i <= 40; i++) s.push(bez(c, i / 40));
  const forward = s[s.length - 1][ax] >= s[0][ax];
  s.sort((p, q) => p[ax] - q[ax]);
  const at = (l: number[][], u: number) => {
    if (u <= l[0][ax]) return l[0][bx];
    for (let i = 1; i < l.length; i++) if (l[i][ax] >= u) { const a = l[i - 1], b = l[i], k = (u - a[ax]) / ((b[ax] - a[ax]) || 1); return a[bx] + k * (b[bx] - a[bx]); }
    return l[l.length - 1][bx];
  };
  const u0 = s[0][ax], u1 = s[s.length - 1][ax], n = 80, U = Array.from({ length: n + 1 }, (_, i) => u0 + (u1 - u0) * i / n);
  const to = typeof o.to === 'number' ? null : [...o.to].sort((p, q) => p[ax] - q[ax]);
  const raw = U.map((u) => (to ? at(to, u) - at(s, u) : (o.to as number)));
  // window minimum, then smoothing along the edge: where the far edge jumps (a new edge appears, two merge or cross)
  // a plain distance makes a seam (recreate.md § 5b)
  const win = (a: number[], r: number, fn: (v: number[]) => number) => a.map((_, i) => fn(a.slice(Math.max(0, i - r), Math.min(n, i + r) + 1)));
  const toward = (v: number[]) => v.reduce((m, x) => (Math.abs(x) < Math.abs(m) ? x : m));
  const gap = win(win(raw, 3, toward), 4, (v) => v.reduce((t, x) => t + x, 0) / v.length);
  const total = Math.min(100, Math.max(0, o.opacity ?? 30)) / 100;
  // many weak steps hide the contours (8 steps of 8–14 % show), but under ~1.5 % Illustrator drops a step: 6–16 of ~2 %
  const N = Math.round(o.steps ?? Math.max(6, Math.min(16, total / 0.02)));
  const a = 1 - Math.pow(1 - total, 1 / N);
  const top = 'M' + f(segs[0][0][0]) + ' ' + f(segs[0][0][1]) + curve(segs);
  const ds: string[] = [];
  for (let k = 1; k <= N; k++) {
    // k/(N+1): the last step stops short of the far edge (exactly on it leaves a hairline sliver)
    const far = U.map((u, i) => { const v = at(s, u) + gap[i] * k / (N + 1); return ax === 0 ? [u, v] : [v, u]; });
    if (forward) far.reverse(); // back along the far side, against the edge's direction
    ds.push(top + far.map((p) => ' L' + f(p[0]) + ' ' + f(p[1])).join('') + ' Z');
  }
  return { ds, opacity: Math.round(a * 10000) / 100 };
}
