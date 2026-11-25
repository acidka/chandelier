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
  const tc = mul(tangentAt(p, at), -1);
  fitPiece(p.slice(0, at + 1), t1, tc, tol, out, depth + 1);
  fitPiece(p.slice(at), mul(tc, -1), t2, tol, out, depth + 1);
}

/** Direction of travel at inner point i: derivative of the parabola through i−1, i, i+1 (chord-length spaced), so
 * the nearer neighbour counts more — across a long gap a plain p[i+1] − p[i−1] would point along the gap. */
function tangentAt(p: P[], i: number): P {
  const a = sub(p[i], p[i - 1]), b = sub(p[i + 1], p[i]), h1 = len(a) || 1e-9, h2 = len(b) || 1e-9;
  return norm(add(mul(a, h2 / (h1 * (h1 + h2))), mul(b, h1 / (h2 * (h1 + h2)))));
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

export interface FitOpts {
  tolerance?: number;
  /** continue the curve past its first / last point along its end direction (a number = both ends) */
  extend?: number | number[];
}

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
  // a point next to a long gap (> 3 × the usual spacing) is no extreme: the real peak may lie in the gap
  const sp = p.slice(1).map((q, i) => len(sub(q, p[i]))).sort((x, y) => x - y), gapAt = 3 * sp[sp.length >> 1];
  const nearGap = (i: number) => len(sub(p[i], p[i - 1])) > gapAt || len(sub(p[i + 1], p[i])) > gapAt;
  for (const e of extremes(s, 1, prom)) { const i = exact(e, 1), dx = p[i + 1][0] - p[i - 1][0]; if (Math.abs(dx) > 1e-9 && !nearGap(i)) cuts.set(i, [Math.sign(dx), 0]); }
  for (const e of extremes(s, 0, prom)) { const i = exact(e, 0), dy = p[i + 1][1] - p[i - 1][1]; if (Math.abs(dy) > 1e-9 && !cuts.has(i) && !nearGap(i)) cuts.set(i, [0, Math.sign(dy)]); }
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
  return extendSegs(out, o.extend);
}

/** Straight continuation along the end directions (handles on the line: no kink), for shapes that must run past the
 * bleed or under a clip edge. */
function extendSegs(segs: Seg[], ext?: number | number[]): Seg[] {
  const [a, b] = typeof ext === 'number' ? [ext, ext] : ext ?? [0, 0];
  const dir = (p: P, q: P, r: P) => norm(len(sub(q, p)) > 1e-9 ? sub(q, p) : sub(r, p)); // from p toward q (or r)
  const out = segs.slice();
  if (a > 0) {
    const c = segs[0], T = dir(c[0], c[1], c[3]), q = sub(c[0], mul(T, a));
    out.unshift([q, add(q, mul(T, a / 3)), sub(c[0], mul(T, a / 3)), c[0]]);
  }
  if (b > 0) {
    const c = segs[segs.length - 1], T = dir(c[3], c[2], c[0]), q = sub(c[3], mul(T, b));
    out.push([c[3], sub(c[3], mul(T, b / 3)), add(q, mul(T, b / 3)), q]);
  }
  return out;
}

/** 4-point projective map: from[i] → to[i] (photo corners → panel corners). Solves the 8 coefficients. */
export function projective(from: number[][], to: number[][]): (p: number[]) => number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i], [u, v] = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) { // Gauss–Jordan with partial pivoting
    let piv = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-12) throw new Error('map: the four points must form a quadrilateral (no three in a line).');
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < 8; r++) if (r !== c) { const k = A[r][c] / A[c][c]; for (let j = c; j < 9; j++) A[r][j] -= k * A[c][j]; }
  }
  const h = A.map((row, i) => row[8] / row[i]);
  return ([x, y]) => { const w = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]; };
}

const f = (v: number) => String(Math.round(v * 100) / 100);
const curve = (segs: Seg[]) => segs.map((c) => ` C${c.slice(1).map((q) => f(q[0]) + ' ' + f(q[1])).join(' ')}`).join('');

/** create_path {fit}: one point list (an open or closed curve) or several (fitted one by one, joined by straight
 * lines: a band = top edge left → right, then the bottom edge right → left, closed) → SVG path data. */
export function fitToD(fit: number[][] | number[][][], closed: boolean, o: FitOpts = {}): { d: string; anchors: number } {
  const parts = (Array.isArray(fit[0]?.[0]) ? fit : [fit]) as number[][][];
  const ext = typeof o.extend === 'number' ? [o.extend, o.extend] : o.extend ?? [0, 0];
  const raw = parts.map((pts) => fitCurve(pts, { ...o, extend: undefined }));
  // a list that runs on into the next one (same direction at the joint: sub-lists of one edge, a shared stretch) is
  // not extended there — that made spikes at every inner joint; a band's turn (top → bottom reversed) is
  const endDir = (g: Seg[]) => { const c = g[g.length - 1]; return norm(sub(c[3], len(sub(c[3], c[2])) > 1e-9 ? c[2] : c[0])); };
  const startDir = (g: Seg[]) => { const c = g[0]; return norm(sub(len(sub(c[1], c[0])) > 1e-9 ? c[1] : c[3], c[0])); };
  const runsOn = (i: number) => i + 1 < raw.length && dot(endDir(raw[i]), startDir(raw[i + 1])) > 0.5;
  let d = '', anchors = 0;
  raw.forEach((g, n) => {
    const segs = extendSegs(g, [n === 0 || !runsOn(n - 1) ? ext[0] : 0, !runsOn(n) ? ext[1] : 0]);
    const s0 = segs[0][0];
    d += (n === 0 ? 'M' : ' L') + f(s0[0]) + ' ' + f(s0[1]) + curve(segs);
    anchors += segs.length + 1;
  });
  return { d: d + (closed ? ' Z' : ''), anchors };
}

export interface ShadeOpts extends FitOpts {
  to: number | number[][];
  steps?: number;
  opacity?: number;
  /** fade the stack to nothing over this length at both ends (a stack ending inside the panel otherwise cuts a seam) */
  taper?: number;
  /** move the near side this far outward (the shape's own clip then makes the crisp edge: no hairline) */
  lift?: number;
}

/** create_path {fit, shade}: shading that follows a curve. Under (or beside) the fitted edge, a fade from `opacity`
 * at the edge to nothing at `to` (a distance, or the next edge's points), built as stacked paths: each one's near
 * side is the fitted edge (crisp; or lifted outward when the stack is clipped by its shape), its far side lies
 * k/(N+1) of the way to `to`. Multiply-stacked, they give a linear fade with no gradient mesh (recreate.md § 5b).
 * `parts`: the edge as one list or several (fitted one by one, as in fit). Returns path data and the opacity of each step. */
export function shadeToD(parts: number[][][], o: ShadeOpts): { ds: string[]; opacity: number } {
  const segsOf = parts.map((pts) => fitCurve(pts, { tolerance: o.tolerance }));
  const pts = parts.flat();
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const ax = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? 0 : 1, bx = 1 - ax; // along, across
  // the fitted edge, sampled densely and ordered along its main axis
  const s: number[][] = [];
  for (const segs of segsOf) for (const c of segs) for (let i = 0; i <= 40; i++) s.push(bez(c, i / 40));
  const forward = s[s.length - 1][ax] >= s[0][ax];
  s.sort((p, q) => p[ax] - q[ax]);
  const at = (l: number[][], u: number) => {
    if (u <= l[0][ax]) return l[0][bx];
    for (let i = 1; i < l.length; i++) if (l[i][ax] >= u) { const a = l[i - 1], b = l[i], k = (u - a[ax]) / ((b[ax] - a[ax]) || 1); return a[bx] + k * (b[bx] - a[bx]); }
    return l[l.length - 1][bx];
  };
  const ext = typeof o.extend === 'number' ? [o.extend, o.extend] : o.extend ?? [0, 0];
  const u0 = s[0][ax] - (forward ? ext[0] : ext[1]), u1 = s[s.length - 1][ax] + (forward ? ext[1] : ext[0]);
  const n = 80, U = Array.from({ length: n + 1 }, (_, i) => u0 + (u1 - u0) * i / n);
  const to = typeof o.to === 'number' ? null : [...o.to].sort((p, q) => p[ax] - q[ax]);
  // past the ends of `to`, the distance stays as it was there (the far edge runs on parallel, not level)
  const clamp = (u: number) => (to ? Math.max(to[0][ax], Math.min(to[to.length - 1][ax], u)) : u);
  const raw = U.map((u) => (to ? at(to, clamp(u)) - at(s, clamp(u)) : (o.to as number)));
  // window minimum, then smoothing along the edge: where the far edge jumps (a new edge appears, two merge or cross)
  // a plain distance makes a seam (recreate.md § 5b)
  const win = (a: number[], r: number, fn: (v: number[]) => number) => a.map((_, i) => fn(a.slice(Math.max(0, i - r), Math.min(n, i + r) + 1)));
  const toward = (v: number[]) => v.reduce((m, x) => (Math.abs(x) < Math.abs(m) ? x : m));
  const gap = win(win(raw, 3, toward), 4, (v) => v.reduce((t, x) => t + x, 0) / v.length);
  const total = Math.min(100, Math.max(0, o.opacity ?? 30)) / 100;
  // steps of ~1.5 %: fewer, stronger steps show as contour bands (v6: 50 % in 16 steps of 4.5 % looked pixelated);
  // under ~1.5 % Illustrator drops a step. 6–48 of them
  const N = Math.round(o.steps ?? Math.max(6, Math.min(48, total / 0.015)));
  const a = 1 - Math.pow(1 - total, 1 / N);
  const sign = Math.sign(gap.reduce((t, x) => t + x, 0)) || 1, lift = o.lift ?? 0;
  const xy = (u: number, v: number) => (ax === 0 ? [u, v] : [v, u]);
  // near side: the exact curve(s), extended; or, lifted, a dense polyline just outside the edge
  const exact = () => {
    const segs = segsOf.map((g, i) => extendSegs(g, [i === 0 ? ext[0] : 0, i === segsOf.length - 1 ? ext[1] : 0]));
    return segs.map((g, i) => (i === 0 ? 'M' : ' L') + f(g[0][0][0]) + ' ' + f(g[0][0][1]) + curve(g)).join('');
  };
  const lifted = () => { const l = U.map((u) => xy(u, at(s, u) - sign * lift)); if (!forward) l.reverse(); return l.map((p, i) => (i ? ' L' : 'M') + f(p[0]) + ' ' + f(p[1])).join(''); };
  const near = lift > 0 ? lifted() : exact();
  const taper = Math.max(0, o.taper ?? 0);
  const ds: string[] = [];
  for (let k = 1; k <= N; k++) {
    // k/(N+1): the last step stops short of the far edge (exactly on it leaves a hairline sliver)
    const far = U.map((u, i) => xy(u, at(s, u) + gap[i] * k / (N + 1)));
    if (forward) far.reverse(); // back along the far side, against the edge's direction
    let d = near + far.map((p) => ' L' + f(p[0]) + ' ' + f(p[1])).join('') + ' Z';
    if (taper > 0) {
      // step k covers a shorter stretch: fewer steps overlap toward the ends, so the shade fades out there
      const cut = taper * k / N, v0 = u0 + cut, v1 = u1 - cut;
      if (v1 - v0 < 1e-6) continue;
      const span = U.filter((u) => u >= v0 && u <= v1), all = [v0, ...span, v1];
      const nearL = all.map((u) => xy(u, at(s, u) - sign * lift)), farL = all.map((u) => xy(u, at(s, u) + gap[Math.round((u - u0) / ((u1 - u0) || 1) * n)] * k / (N + 1))).reverse();
      d = [...nearL, ...farL].map((p, i) => (i ? ' L' : 'M') + f(p[0]) + ' ' + f(p[1])).join('') + ' Z';
    }
    ds.push(d);
  }
  return { ds, opacity: Math.round(a * 10000) / 100 };
}
