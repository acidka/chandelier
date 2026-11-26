// scene analyze, step 5: the planar map. Region boundaries run along pixel cracks; where three or more regions meet
// (or two touch at a saddle) is a junction, and each run of cracks between two junctions is one edge with one region
// on each side. Every boundary is stored once, so two neighbours are later drawn from the same fitted curve: no gaps,
// no overlaps. The image outside counts as region OUT.
export const OUT = -1;

export interface Edge {
  id: number;
  /** region on the left / right of the direction of travel (y down: moving +x, left is above) */
  left: number;
  right: number;
  /** junction vertex ids at the ends (-1 for a closed loop) */
  j0: number;
  j1: number;
  /** crack midpoints, with the exact junction vertices first and last (open edges); [x, y] in pixel-edge coordinates */
  pts: number[][];
  closed: boolean;
}

export interface PlanarMap {
  w: number;
  h: number;
  edges: Edge[];
  /** junction vertex id → [x, y] */
  junctions: Map<number, number[]>;
}

/** Labels → planar map. Negative labels (outside, transparent) all count as OUT. */
export function planarMap(map: Int32Array, w: number, h: number): PlanarMap {
  const lab = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? OUT : Math.max(OUT, map[y * w + x]));
  // horizontal crack (x, y)→(x+1, y) between pixels (x, y-1) and (x, y); vertical (x, y)→(x, y+1) between (x-1, y) and (x, y)
  const hasH = (x: number, y: number) => x >= 0 && x < w && y >= 0 && y <= h && lab(x, y - 1) !== lab(x, y);
  const hasV = (x: number, y: number) => y >= 0 && y < h && x >= 0 && x <= w && lab(x - 1, y) !== lab(x, y);
  const W1 = w + 1, vid = (x: number, y: number) => y * W1 + x;
  const degree = (x: number, y: number) => +hasH(x - 1, y) + +hasH(x, y) + +hasV(x, y - 1) + +hasV(x, y);
  const usedH = new Uint8Array(W1 * (h + 1)), usedV = new Uint8Array(W1 * (h + 1));
  const junctions = new Map<number, number[]>();
  for (let y = 0; y <= h; y++) for (let x = 0; x <= w; x++) if (degree(x, y) >= 3) junctions.set(vid(x, y), [x, y]);
  const edges: Edge[] = [];

  // the cracks leaving vertex (x, y): [dx, dy]
  const out = (x: number, y: number): number[][] => {
    const o: number[][] = [];
    if (hasH(x, y)) o.push([1, 0]);
    if (hasH(x - 1, y)) o.push([-1, 0]);
    if (hasV(x, y)) o.push([0, 1]);
    if (hasV(x, y - 1)) o.push([0, -1]);
    return o;
  };
  const used = (x: number, y: number, d: number[]) => (d[1] === 0 ? usedH[vid(d[0] > 0 ? x : x - 1, y)] : usedV[vid(x, d[1] > 0 ? y : y - 1)]);
  const mark = (x: number, y: number, d: number[]) => { if (d[1] === 0) usedH[vid(d[0] > 0 ? x : x - 1, y)] = 1; else usedV[vid(x, d[1] > 0 ? y : y - 1)] = 1; };
  /** regions left / right of a crack leaving (x, y) in direction d */
  const sides = (x: number, y: number, d: number[]): [number, number] => {
    if (d[0] === 1) return [lab(x, y - 1), lab(x, y)];
    if (d[0] === -1) return [lab(x - 1, y), lab(x - 1, y - 1)];
    if (d[1] === 1) return [lab(x, y), lab(x - 1, y)];
    return [lab(x - 1, y - 1), lab(x, y - 1)];
  };

  /** follow cracks from (x, y) along d until a junction (or back to the start for a loop) */
  const walk = (x0: number, y0: number, d0: number[], loop: boolean): Edge => {
    const [left, right] = sides(x0, y0, d0);
    const pts: number[][] = loop ? [] : [[x0, y0]];
    let x = x0, y = y0, d = d0;
    for (;;) {
      mark(x, y, d);
      pts.push([x + d[0] / 2, y + d[1] / 2]);
      x += d[0]; y += d[1];
      if (junctions.has(vid(x, y)) || (loop && x === x0 && y === y0)) break;
      // degree 2: the other crack (keeping the same two regions on the same sides)
      const next = out(x, y).find((n) => !(n[0] === -d[0] && n[1] === -d[1]) && !used(x, y, n) && sides(x, y, n)[0] === left);
      if (!next) break; // only when back at a loop's start
      d = next;
    }
    if (!loop) pts.push([x, y]);
    return { id: edges.length, left, right, j0: loop ? -1 : vid(x0, y0), j1: loop ? -1 : vid(x, y), pts, closed: loop };
  };

  for (const [v, [x, y]] of junctions) for (const d of out(x, y)) if (!used(x, y, d)) edges.push(walk(x, y, d, false));
  // what is left are closed loops (an island inside one region)
  for (let y = 0; y <= h; y++) for (let x = 0; x < w; x++) {
    if (!hasH(x, y) || usedH[vid(x, y)]) continue;
    edges.push(walk(x, y, [1, 0], true));
  }
  return { w, h, edges, junctions };
}

export interface LoopPart { edge: number; reversed: boolean }
export interface Loop {
  parts: LoopPart[];
  /** signed area (y down): negative = outer boundary, positive = hole */
  area: number;
  outer: boolean;
}

/** points of an edge in the direction used by a loop */
export const partPts = (pm: PlanarMap, p: LoopPart) => (p.reversed ? [...pm.edges[p.edge].pts].reverse() : pm.edges[p.edge].pts);

/** The boundary loops of a set of regions: edges with exactly one side in the set, oriented with the set on the left,
 * chained at junctions. Where the set touches itself at a vertex, the sharpest left turn wins (touching parts stay
 * separate loops). */
export function loopsOf(pm: PlanarMap, set: Set<number> | ((r: number) => boolean)): Loop[] {
  const inSet = typeof set === 'function' ? set : (r: number) => set.has(r);
  const loops: Loop[] = [], byStart = new Map<number, LoopPart[]>();
  for (const e of pm.edges) {
    const l = inSet(e.left), r = inSet(e.right);
    if (l === r) continue;
    const part = { edge: e.id, reversed: !l };
    if (e.closed) { loops.push(mkLoop(pm, [part])); continue; }
    const start = part.reversed ? e.j1 : e.j0;
    let a = byStart.get(start);
    if (!a) byStart.set(start, (a = []));
    a.push(part);
  }
  const usedPart = new Set<number>();
  const dirIn = (p: LoopPart) => { const q = partPts(pm, p), n = q.length; return [q[n - 1][0] - q[n - 2][0], q[n - 1][1] - q[n - 2][1]]; };
  const dirOut = (p: LoopPart) => { const q = partPts(pm, p); return [q[1][0] - q[0][0], q[1][1] - q[0][1]]; };
  for (const [, parts] of byStart) for (const first of parts) {
    if (usedPart.has(first.edge)) continue;
    const chain: LoopPart[] = [];
    let p = first;
    for (let guard = 0; guard < pm.edges.length + 1; guard++) {
      usedPart.add(p.edge); chain.push(p);
      const e = pm.edges[p.edge], end = p.reversed ? e.j0 : e.j1;
      const cand = (byStart.get(end) ?? []).filter((c) => !usedPart.has(c.edge));
      if (!cand.length) break;
      // sharpest left turn (y down: left of travel direction d is (d.y, -d.x))
      const din = dirIn(p);
      cand.sort((a, b) => turn(din, dirOut(b)) - turn(din, dirOut(a)));
      p = cand[0];
    }
    loops.push(mkLoop(pm, chain));
  }
  return loops;
}

/** signed turn angle from direction a to b; positive = left turn (y down) */
function turn(a: number[], b: number[]): number {
  return Math.atan2(a[1] * b[0] - a[0] * b[1], a[0] * b[0] + a[1] * b[1]);
}

function mkLoop(pm: PlanarMap, parts: LoopPart[]): Loop {
  let area = 0;
  for (const p of parts) {
    const q = partPts(pm, p);
    for (let i = 0; i + 1 < q.length; i++) area += q[i][0] * q[i + 1][1] - q[i + 1][0] * q[i][1];
    if (pm.edges[p.edge].closed) area += q[q.length - 1][0] * q[0][1] - q[0][0] * q[q.length - 1][1];
  }
  // open parts chain end to start; the closing term across chain joints is zero (shared vertices)
  area /= 2;
  return { parts, area, outer: area < 0 };
}

/** the edges touching each region */
export function edgesByRegion(pm: PlanarMap): Map<number, number[]> {
  const m = new Map<number, number[]>();
  const add = (r: number, e: number) => { let a = m.get(r); if (!a) m.set(r, (a = [])); a.push(e); };
  for (const e of pm.edges) { add(e.left, e.id); if (e.right !== e.left) add(e.right, e.id); }
  return m;
}
