// scene F18: a thin band of constant width (a frame, a ring, a drawn line) drawn as a STROKE along its centreline
// instead of a filled band whose two fitted edges wobble independently ("lumpy bands"; both suite runs redrew them by
// hand as stroked centrelines). The region's pixels are thinned to a one-pixel skeleton (Zhang–Suen), short spurs are
// pruned, and the longest path (or the loop, for a ring) is fitted; width = area ÷ centreline length.
import { fitCurve, type Seg } from '../fitcurve.js';

export interface Stroke { segs: Seg[]; closed: boolean; width: number }

/** Zhang–Suen thinning of a binary mask (1 = inside), in place */
function thin(m: Uint8Array, w: number, h: number): void {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : m[y * w + x]);
  for (let changed = true; changed; ) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      const del: number[] = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!m[y * w + x]) continue;
        const p = [at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)];
        const B = p.reduce((a, v) => a + v, 0);
        if (B < 2 || B > 6) continue;
        let A = 0;
        for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) % 8]) A++;
        if (A !== 1) continue;
        if (pass === 0 ? p[0] * p[2] * p[4] || p[2] * p[4] * p[6] : p[0] * p[2] * p[6] || p[0] * p[4] * p[6]) continue;
        del.push(y * w + x);
      }
      for (const i of del) m[i] = 0;
      if (del.length) changed = true;
    }
  }
}

const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** The centreline stroke of region `id` in a label map, or null when it is not a band (too thick for its length). */
export function centreline(map: Int32Array, w: number, h: number, id: number, bbox: number[], tol: number): Stroke | null {
  const x0 = Math.max(0, bbox[0] - 1), y0 = Math.max(0, bbox[1] - 1), W = Math.min(w, bbox[2] + 2) - x0, H = Math.min(h, bbox[3] + 2) - y0;
  const m = new Uint8Array(W * H);
  let area = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (map[(y + y0) * w + x + x0] === id) { m[y * W + x] = 1; area++; }
  if (area < 10) return null;
  thin(m, W, H);
  const nb = (i: number) => { const x = i % W, y = (i / W) | 0, out: number[] = []; for (const [dx, dy] of N8) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H && m[Y * W + X]) out.push(Y * W + X); } return out; };
  let px: number[] = [];
  for (let i = 0; i < m.length; i++) if (m[i]) px.push(i);
  if (px.length < 3) return null;
  // prune spurs: branches shorter than ~ the band's width (from the corners of a thick end)
  const wEst = area / px.length;
  for (let round = 0; round < 3; round++) {
    const ends = px.filter((i) => nb(i).length === 1);
    let cut = false;
    for (const e of ends) {
      const branch = [e];
      let prev = -1, cur = e;
      while (branch.length <= 2 * wEst + 2) {
        const n = nb(cur).filter((j) => j !== prev);
        if (n.length !== 1) break;
        prev = cur; cur = n[0]; branch.push(cur);
      }
      if (nb(cur).length >= 3 && branch.length <= 2 * wEst + 2) { for (const b of branch.slice(0, -1)) m[b] = 0; cut = true; }
    }
    if (!cut) break;
    px = px.filter((i) => m[i]);
  }
  // the path: a loop (no ends) or the longest path between two ends (BFS twice)
  const bfs = (from: number) => {
    const dist = new Map<number, number>([[from, 0]]), prev = new Map<number, number>(), q = [from];
    for (let k = 0; k < q.length; k++) for (const n of nb(q[k])) if (!dist.has(n)) { dist.set(n, dist.get(q[k])! + 1); prev.set(n, q[k]); q.push(n); }
    let far = from;
    for (const [i, d] of dist) if (d > dist.get(far)!) far = i;
    return { far, prev, reached: dist.size };
  };
  let ends = px.filter((i) => nb(i).length === 1), closed = false;
  if (!ends.length) {
    // a ring: cut it open at its first pixel (and that pixel's neighbours), take the long way round, close it again
    closed = true;
    const cut = [px[0], ...nb(px[0])];
    for (const c of cut) m[c] = 0;
    px = px.filter((i) => m[i]);
    ends = px.filter((i) => nb(i).length === 1);
    if (ends.length < 2) return null; // not a simple loop
  }
  const a = bfs(ends[0]).far, b = bfs(a);
  const order = [b.far];
  for (let cur = b.far; cur !== a; ) { cur = b.prev.get(cur)!; order.push(cur); }
  if (closed && order.length < px.length * 0.8) return null; // branches: not a simple loop
  const pts = order.map((i) => [(i % W) + x0 + 0.5, ((i / W) | 0) + y0 + 0.5]);
  // a light moving average (pixel steps), then the usual fit
  const r = 2, sm = pts.map((_, i) => {
    let x = 0, y = 0, c = 0;
    for (let k = -r; k <= r; k++) { let j = i + k; if (closed) j = (j + pts.length) % pts.length; else if (j < 0 || j >= pts.length) continue; x += pts[j][0]; y += pts[j][1]; c++; }
    return [x / c, y / c];
  });
  if (!closed) { sm[0] = pts[0]; sm[sm.length - 1] = pts[pts.length - 1]; }
  // length along the smoothed line (a pixel staircase is ~5 % longer than the line it steps along)
  let len = 0;
  for (let i = 1; i < sm.length; i++) len += Math.hypot(sm[i][0] - sm[i - 1][0], sm[i][1] - sm[i - 1][1]);
  if (closed) len += Math.hypot(sm[0][0] - sm[sm.length - 1][0], sm[0][1] - sm[sm.length - 1][1]);
  if (len < 4) return null;
  const width = area / len;
  if (width > len / 3) return null; // a blob, not a band
  const segs = fitCurve(closed ? [...sm, sm[0]] : sm, { tolerance: Math.max(0.5, tol) });
  return { segs, closed, width: Math.round(width * 100) / 100 };
}

/** the stroke's outline as closed polygons (for our own render and the IoU): both sides at ± width / 2 */
export function strokeOutline(st: Stroke): Seg[][] {
  const P: number[][] = [];
  for (const c of st.segs) for (let i = 0; i < 8; i++) { const t = i / 8, u = 1 - t; P.push([0, 1].map((k) => u * u * u * c[0][k] + 3 * u * u * t * c[1][k] + 3 * u * t * t * c[2][k] + t * t * t * c[3][k])); }
  const last = st.segs[st.segs.length - 1][3];
  if (!st.closed) P.push(last);
  const hw = st.width / 2, n = P.length;
  const side = (s: number) => P.map((p, i) => {
    const a = P[st.closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = P[st.closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    return [p[0] - (dy / L) * hw * s, p[1] + (dx / L) * hw * s];
  });
  const line = (pts: number[][]): Seg[] => pts.map((a, i) => { const b = pts[(i + 1) % pts.length]; return [a, [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3], [a[0] + (2 * (b[0] - a[0])) / 3, a[1] + (2 * (b[1] - a[1])) / 3], b] as Seg; });
  const L = side(1), R = side(-1);
  return st.closed ? [line(L), line(R.reverse())] : [line([...L, ...R.reverse()])];
}
