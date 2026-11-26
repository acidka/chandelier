// scene analyze, step 4: ink labels → regions. Specks are voted away, the anti-aliased rims between two inks (1–2 px
// ribbons of an in-between colour) are dissolved into the inks on each side, small regions join their closest
// neighbour, and neighbours of nearly the same colour (one ink split by lighting) merge. Then per-region stats.
import { de76, mixT, type Lab } from './color.js';

export interface Region {
  id: number;
  area: number;
  /** [x0, y0, x1, y1], inclusive pixel bounds */
  bbox: number[];
  cx: number;
  cy: number;
  /** mean colour (smoothed Lab) */
  L: number; a: number; b: number;
  /** ink (quantizer cluster) most of its pixels had */
  group: number;
  /** share of pixels within ΔE 10 of the mean (JPEG noise on saturated inks reaches ΔE 5–8) */
  homog: number;
  /** the point deepest inside (label position) and its distance to the edge */
  pole: number[];
  depth: number;
  /** crack-unit perimeter (including the image border) */
  perim: number;
  touchesBorder: boolean;
  /** neighbour id → shared boundary length (crack units) */
  nbrs: Map<number, number>;
}

export interface Segmentation { w: number; h: number; map: Int32Array; regions: Region[] }

export interface SegOpts {
  minDe?: number;
  /** regions under this many pixels join a neighbour */
  minArea?: number;
  modePasses?: number;
  /** ink colours (quantizer centres, k × Lab): a thin region whose mean is its own ink is a real stroke, never a rim */
  centres?: Float32Array;
}

export const SKIP = -2;

/** 3×3 vote: a pixel with at most 1 like neighbour (a speck or a line end; a 1-px line keeps its 2) takes the commonest label. */
export function modeFilter(labels: Uint8Array, w: number, h: number, passes = 2): Uint8Array {
  let cur = labels;
  for (let p = 0; p < passes; p++) {
    const out = new Uint8Array(cur), cnt = new Map<number, number>();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, me = cur[i];
      if (me === 255) continue;
      let same = 0;
      cnt.clear();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const v = cur[yy * w + xx];
        if (v === 255) continue;
        if (v === me) same++; else cnt.set(v, (cnt.get(v) ?? 0) + 1);
      }
      if (same > 1 || !cnt.size) continue;
      let best = me, bn = same;
      for (const [v, n] of cnt) if (n > bn) { bn = n; best = v; }
      out[i] = best;
    }
    cur = out;
  }
  return cur;
}

/** 4-connected components of equal labels → region id per pixel (SKIP for label 255) and the count */
export function components(labels: Uint8Array, w: number, h: number): { map: Int32Array; count: number } {
  const map = new Int32Array(w * h).fill(-1), stack = new Int32Array(w * h);
  let count = 0;
  for (let s = 0; s < w * h; s++) {
    if (map[s] !== -1) continue;
    if (labels[s] === 255) { map[s] = SKIP; continue; }
    const v = labels[s], id = count++;
    let top = 0;
    stack[top++] = s; map[s] = id;
    while (top) {
      const i = stack[--top], x = i % w;
      if (x > 0 && map[i - 1] === -1 && labels[i - 1] === v) { map[i - 1] = id; stack[top++] = i - 1; }
      if (x < w - 1 && map[i + 1] === -1 && labels[i + 1] === v) { map[i + 1] = id; stack[top++] = i + 1; }
      if (i >= w && map[i - w] === -1 && labels[i - w] === v) { map[i - w] = id; stack[top++] = i - w; }
      if (i < w * (h - 1) && map[i + w] === -1 && labels[i + w] === v) { map[i + w] = id; stack[top++] = i + w; }
    }
  }
  return { map, count };
}

/** Stats for every region id 0..count-1 of a map (ids with no pixels get area 0). */
export function regionStats(map: Int32Array, w: number, h: number, count: number, lab: Lab, labels?: Uint8Array): Region[] {
  const R: Region[] = [];
  for (let id = 0; id < count; id++) R.push({ id, area: 0, bbox: [w, h, -1, -1], cx: 0, cy: 0, L: 0, a: 0, b: 0, group: -1, homog: 0, pole: [0, 0], depth: 0, perim: 0, touchesBorder: false, nbrs: new Map() });
  const groupCount = labels ? new Map<number, Map<number, number>>() : null;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, id = map[i];
    if (id < 0) continue;
    const r = R[id];
    r.area++; r.cx += x + 0.5; r.cy += y + 0.5; r.L += lab.L[i]; r.a += lab.A[i]; r.b += lab.B[i];
    if (x < r.bbox[0]) r.bbox[0] = x; if (y < r.bbox[1]) r.bbox[1] = y; if (x > r.bbox[2]) r.bbox[2] = x; if (y > r.bbox[3]) r.bbox[3] = y;
    // cracks: right and down neighbours (each pair once), image border
    if (x === 0 || x === w - 1 || y === 0 || y === h - 1) {
      r.touchesBorder = true;
      r.perim += (x === 0 ? 1 : 0) + (x === w - 1 ? 1 : 0) + (y === 0 ? 1 : 0) + (y === h - 1 ? 1 : 0);
    }
    for (const j of [x < w - 1 ? i + 1 : -1, y < h - 1 ? i + w : -1]) {
      if (j < 0) continue;
      const o = map[j];
      if (o === id) continue;
      r.perim++;
      if (o >= 0) { R[o].perim++; r.nbrs.set(o, (r.nbrs.get(o) ?? 0) + 1); R[o].nbrs.set(id, (R[o].nbrs.get(id) ?? 0) + 1); }
    }
    if (groupCount && labels![i] !== 255) { let g = groupCount.get(id); if (!g) groupCount.set(id, (g = new Map())); g.set(labels![i], (g.get(labels![i]) ?? 0) + 1); }
  }
  for (const r of R) if (r.area) { r.cx /= r.area; r.cy /= r.area; r.L /= r.area; r.a /= r.area; r.b /= r.area; }
  if (groupCount) for (const [id, g] of groupCount) { let best = -1, bn = 0; for (const [v, n] of g) if (n > bn) { bn = n; best = v; } R[id].group = best; }
  // homogeneity
  const near = new Float64Array(count);
  for (let i = 0; i < w * h; i++) { const id = map[i]; if (id < 0) continue; const r = R[id]; if (de76(lab.L[i], lab.A[i], lab.B[i], r.L, r.a, r.b) < 10) near[id]++; }
  for (const r of R) r.homog = r.area ? near[r.id] / r.area : 0;
  // poles: 3-4 chamfer distance to the nearest pixel of another region (or the image border)
  const d = chamfer(map, w, h);
  for (let i = 0; i < w * h; i++) { const id = map[i]; if (id < 0) continue; const r = R[id]; if (d[i] > r.depth) { r.depth = d[i]; r.pole = [(i % w) + 0.5, Math.floor(i / w) + 0.5]; } }
  for (const r of R) if (r.area && !r.depth) r.pole = [r.cx, r.cy];
  for (const r of R) r.depth /= 3;
  return R;
}

/** chamfer (3-4) distance from each pixel to its region's edge, ×3; edge pixels get 3 */
function chamfer(map: Int32Array, w: number, h: number): Uint32Array {
  const d = new Uint32Array(w * h), BIG = 1 << 30;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, id = map[i];
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || map[i - 1] !== id || map[i + 1] !== id || map[i - w] !== id || map[i + w] !== id;
    d[i] = edge ? 3 : BIG;
  }
  const relax = (i: number, j: number, c: number) => { if (d[j] + c < d[i]) d[i] = d[j] + c; };
  for (let y = 1; y < h; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; relax(i, i - 1, 3); relax(i, i - w, 3); relax(i, i - w - 1, 4); relax(i, i - w + 1, 4); }
  for (let y = h - 2; y >= 0; y--) for (let x = w - 2; x >= 1; x--) { const i = y * w + x; relax(i, i + 1, 3); relax(i, i + w, 3); relax(i, i + w + 1, 4); relax(i, i + w - 1, 4); }
  return d;
}

/** Rims and halos: thin regions (mean width < 2 px) whose colour lies between two of their neighbours' colours, and
 * thin ones (< 3 px) within 2 × minDe of a neighbour (JPEG ringing round letters); only next to solid shapes (≥ 2 px).
 * Their pixels go, nearest first, to the neighbour closest in colour. A real thin line (its own ink) stays. */
export function dissolveThin(seg: Segmentation, lab: Lab, tol: number, centres?: Float32Array, minDe = 6): number {
  const { w, h, map, regions } = seg, dissolve = new Uint8Array(regions.length);
  let n = 0;
  // a rim lies between two solid shapes; the fringe of a thin stroke (small text) hugs a thin core and must stay
  const widthOf = (q: Region) => (q.perim ? (2 * q.area) / q.perim : 0);
  const solid = (q: Region) => q.area > 0 && widthOf(q) >= 2;
  for (const r of regions) {
    if (!r.area) continue;
    const width = widthOf(r), nb = [...r.nbrs.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => regions[id]).filter(solid).slice(0, 6);
    // a thin ring or ribbon close to a solid neighbour's colour (JPEG ringing, a halo): part of that neighbour
    if (width < 3 && nb.some((q) => de76(r.L, r.a, r.b, q.L, q.a, q.b) < 2 * minDe)) { dissolve[r.id] = 1; n++; continue; }
    if (nb.length < 2 || width >= 2) continue;
    if (centres && r.group >= 0 && de76(r.L, r.a, r.b, centres[r.group * 3], centres[r.group * 3 + 1], centres[r.group * 3 + 2]) < minDe / 2) continue;
    let between = false;
    for (let i = 0; i < nb.length && !between; i++) for (let j = i + 1; j < nb.length; j++) {
      const t = mixT([r.L, r.a, r.b], [nb[i].L, nb[i].a, nb[i].b], [nb[j].L, nb[j].a, nb[j].b], tol);
      if (t >= -0.1 && t <= 1.1) { between = true; break; } // a mix, or (nearly) one side: either way not an ink of its own
    }
    if (between) { dissolve[r.id] = 1; n++; }
  }
  if (!n) return 0;
  // multi-source BFS from the pixels that touch a kept region
  const q = new Int32Array(w * h);
  let head = 0, tail = 0;
  const pending = new Uint8Array(w * h);
  const assign = (i: number) => {
    const x = i % w;
    let best = -1, bd = Infinity;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < w * (h - 1) ? i + w : -1]) {
      if (j < 0) continue;
      const o = map[j];
      if (o < 0 || dissolve[o]) continue;
      const r = regions[o], dd = de76(lab.L[i], lab.A[i], lab.B[i], r.L, r.a, r.b);
      if (dd < bd) { bd = dd; best = o; }
    }
    return best;
  };
  for (let i = 0; i < w * h; i++) if (map[i] >= 0 && dissolve[map[i]] && assign(i) >= 0) { q[tail++] = i; pending[i] = 1; }
  while (head < tail) {
    const i = q[head++], to = assign(i);
    if (to < 0) continue;
    map[i] = to;
    const x = i % w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < w * (h - 1) ? i + w : -1]) {
      if (j < 0 || pending[j] || map[j] < 0 || !dissolve[map[j]]) continue;
      pending[j] = 1; q[tail++] = j;
    }
  }
  return n;
}

/** Union-find merging of whole regions with running stats: small ones into their closest neighbour, then
 * neighbours closer than lim. Returns the root of every id. */
export function mergeRegions(regions: Region[], minArea: number, lim: number): Int32Array {
  const parent = new Int32Array(regions.length).map((_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const R = regions.map((r) => ({ area: r.area, L: r.L * r.area, a: r.a * r.area, b: r.b * r.area, nbrs: new Map(r.nbrs) }));
  const mean = (i: number) => [R[i].L / R[i].area, R[i].a / R[i].area, R[i].b / R[i].area];
  const dist = (i: number, j: number) => { const p = mean(i), q = mean(j); return de76(p[0], p[1], p[2], q[0], q[1], q[2]); };
  const join = (from: number, to: number) => {
    const f = R[from], t = R[to];
    t.area += f.area; t.L += f.L; t.a += f.a; t.b += f.b;
    for (const [n, len] of f.nbrs) {
      if (n === to) continue;
      t.nbrs.set(n, (t.nbrs.get(n) ?? 0) + len);
      const nm = R[n].nbrs; nm.delete(from); nm.set(to, (nm.get(to) ?? 0) + len);
    }
    t.nbrs.delete(from); f.nbrs = new Map(); f.area = 0;
    parent[from] = to;
  };
  // small regions, smallest first
  for (let round = 0; round < 4; round++) {
    let changed = false;
    const small = R.map((_, i) => i).filter((i) => R[i].area > 0 && R[i].area < minArea && R[i].nbrs.size).sort((x, y) => R[x].area - R[y].area);
    for (const i of small) {
      if (find(i) !== i || R[i].area >= minArea || !R[i].nbrs.size) continue;
      let best = -1, bd = Infinity, bl = 0;
      for (const [n, len] of R[i].nbrs) { const d = dist(i, n); if (d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && len > bl)) { bd = d; bl = len; best = n; } }
      join(i, best); changed = true;
    }
    if (!changed) break;
  }
  // similar neighbours, closest pair first; the smaller joins the larger
  for (let round = 0; round < 6; round++) {
    const pairs: [number, number, number][] = [];
    R.forEach((r, i) => { if (r.area) for (const n of r.nbrs.keys()) if (n > i) { const d = dist(i, n); if (d < lim) pairs.push([d, i, n]); } });
    if (!pairs.length) break;
    pairs.sort((x, y) => x[0] - y[0]);
    let changed = false;
    for (const [, i0, j0] of pairs) {
      const i = find(i0), j = find(j0);
      if (i === j || dist(i, j) >= lim) continue;
      if (R[i].area < R[j].area) join(i, j); else join(j, i);
      changed = true;
    }
    if (!changed) break;
  }
  return parent.map((_, i) => find(i));
}

/** labels → regions: vote, components, rim dissolve, merges; ids sorted by area (r0 = largest) */
export function segment(lab: Lab, labels: Uint8Array, o: SegOpts = {}): Segmentation {
  const { w, h } = lab, minDe = o.minDe ?? 6, minArea = o.minArea ?? Math.max(12, Math.round(w * h * 5e-5));
  const voted = modeFilter(labels, w, h, o.modePasses ?? 2);
  const cc = components(voted, w, h);
  const seg: Segmentation = { w, h, map: cc.map, regions: regionStats(cc.map, w, h, cc.count, lab, voted) };
  dissolveThin(seg, lab, Math.max(6, minDe * 2), o.centres, minDe);
  seg.regions = regionStats(seg.map, w, h, cc.count, lab, voted);
  const root = mergeRegions(seg.regions, minArea, minDe / 2);
  for (let i = 0; i < w * h; i++) if (seg.map[i] >= 0) seg.map[i] = root[seg.map[i]];
  const merged = compact(seg, lab, voted);
  // a rim fragment's neighbours were fragments too before the merges: check once more against the merged regions
  return dissolveThin(merged, lab, Math.max(6, minDe * 2), o.centres, minDe) ? compact(merged, lab, voted) : merged;
}

/** renumber ids 0..n-1 by area (largest first) and recompute stats */
export function compact(seg: Segmentation, lab: Lab, labels?: Uint8Array): Segmentation {
  const { w, h, map } = seg, area = new Map<number, number>();
  for (let i = 0; i < w * h; i++) if (map[i] >= 0) area.set(map[i], (area.get(map[i]) ?? 0) + 1);
  const order = [...area.keys()].sort((x, y) => area.get(y)! - area.get(x)! || x - y), to = new Map(order.map((id, n) => [id, n]));
  const out = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = map[i] >= 0 ? to.get(map[i])! : map[i];
  return { w, h, map: out, regions: regionStats(out, w, h, order.length, lab, labels) };
}
