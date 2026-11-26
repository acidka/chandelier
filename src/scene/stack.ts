// scene build geometry. Stacked (default, owner 2026-11-26): each region is drawn as itself plus every higher region
// it connects to, so a lower fill always runs on under the anti-aliased edge of the one above — no hairline seams on
// screen, an overlap against misregistration in print, whole layered shapes as a designer draws them. A dropped or
// text region stays in the stack and is filled by the shape below. Tiling: one shape per region, edges abutting.
import { loopsOf, partPts, OUT, type PlanarMap, type Loop } from './planar.js';
import { reverseSegs, type Seg } from './fitedges.js';
import type { Region } from './regions.js';

/** z per region id (0 = bottom): the ink that covers most of the image border is the background (a design touching
 * the edges splits it into pieces), then enclosing regions below what they enclose (filled area descending), lighter
 * below darker on ties. */
export function zOrder(pm: PlanarMap, regions: Region[]): number[] {
  const filled = regions.map((r) => loopsOf(pm, new Set([r.id])).filter((l) => l.outer).reduce((a, l) => a - l.area, 0));
  const border = new Map<number, number>();
  let total = 0;
  for (const e of pm.edges) {
    const r = e.left === OUT ? e.right : e.right === OUT ? e.left : -1;
    if (r < 0 && !(e.left === OUT || e.right === OUT)) continue;
    total += e.pts.length;
    if (r >= 0) border.set(regions[r].group, (border.get(regions[r].group) ?? 0) + e.pts.length);
  }
  let bg = -2, most = 0;
  for (const [g, n] of border) if (n > most) { most = n; bg = g; }
  if (most < total * 0.5) bg = -2;
  const isBg = (id: number) => (regions[id].group === bg && regions[id].touchesBorder ? 0 : 1);
  const order = regions.map((r) => r.id).sort((a, b) => isBg(a) - isBg(b) || filled[b] - filled[a] || regions[b].L - regions[a].L || a - b);
  const z = new Array<number>(regions.length);
  order.forEach((id, n) => { z[id] = n; });
  return z;
}

export interface Shape {
  region: number;
  loops: Seg[][];
  /** the planar-map loops behind it (raw boundary points: primitive detection) */
  raw: Loop[];
  /** any hole loop → even-odd fill */
  holes: boolean;
  blend?: 'multiply';
}

export interface StackOpts {
  tile?: boolean;
  /** regions drawn as their own outline (a primitive) instead of the stacked set */
  own?: Map<number, Seg[]>;
  /** regions drawn as exactly this set of regions (translucent layers: the region plus its overlaps), multiply */
  exact?: Map<number, number[]>;
  /** regions not drawn (dropped, text, placeholder) */
  skip?: Set<number>;
  /** for each region not drawn: the region whose shape covers it (default: its lower neighbour with the longest
   * shared boundary) — a dropped speck is filled by what it sits on, not by whatever runs under it */
  filler?: Map<number, number>;
}

/** the region that fills each skipped region: given, else the lower drawn neighbour with the longest shared edge */
export function fillers(regions: Region[], z: number[], skip: Set<number>, given: Map<number, number> = new Map()): Map<number, number> {
  const out = new Map<number, number>();
  for (const x of skip) {
    if (!regions[x]?.area) continue;
    const g = given.get(x);
    if (g === -1) continue; // "fill none": left empty
    if (g !== undefined && regions[g]?.area && !skip.has(g)) { out.set(x, g); continue; }
    let best = -1, bl = -1, any = -1, al = -1;
    for (const [n, len] of regions[x].nbrs) {
      if (!regions[n].area || skip.has(n)) continue;
      if (len > al) { al = len; any = n; }
      if (z[n] < z[x] && len > bl) { bl = len; best = n; }
    }
    const f = best >= 0 ? best : any;
    if (f >= 0) out.set(x, f);
  }
  // a skipped region surrounded only by skipped ones (a letter's counter inside a text box, a speck on a dropped
  // patch) takes the filler of the one it sits on — otherwise it would be a hole in what lies under it
  for (let changed = true; changed; ) {
    changed = false;
    for (const x of skip) {
      if (!regions[x]?.area || out.has(x) || given.get(x) === -1) continue;
      let best = -1, bl = -1, any = -1, al = -1;
      for (const [n, len] of regions[x].nbrs) {
        if (!out.has(n)) continue;
        if (len > al) { al = len; any = n; }
        if (z[n] < z[x] && len > bl) { bl = len; best = n; }
      }
      const via = best >= 0 ? best : any;
      if (via >= 0) { out.set(x, out.get(via)!); changed = true; }
    }
  }
  return out;
}

/** loop → its segments (shared edges reversed where the loop runs against them) */
export function loopSegs(pm: PlanarMap, fits: Seg[][], l: Loop): Seg[] {
  const out: Seg[] = [];
  for (const p of l.parts) out.push(...(p.reversed ? reverseSegs(fits[p.edge]) : fits[p.edge]));
  return out;
}

/** shapes bottom to top */
export function stacked(pm: PlanarMap, regions: Region[], z: number[], fits: Seg[][], o: StackOpts = {}): Shape[] {
  const ids = regions.map((r) => r.id).sort((a, b) => z[a] - z[b]);
  const out: Shape[] = [];
  for (const id of ids) {
    if (o.skip?.has(id) || !regions[id].area) continue;
    const own = o.own?.get(id);
    if (own) { out.push({ region: id, loops: [own], raw: [], holes: false }); continue; }
    let set: Set<number>;
    const exact = o.exact?.get(id);
    if (exact) set = new Set([id, ...exact]);
    else if (o.tile) set = new Set([id]);
    else {
      // the connected group of drawn regions at or above this one, reached from it
      set = new Set([id]);
      const q = [id];
      // a region not drawn is crossed only by the shape that fills it (and then what lies beyond it is reached too)
      const ok = (n: number) => !o.skip?.has(n) || (o.filler?.get(n) !== undefined && set.has(o.filler.get(n)!));
      while (q.length) for (const n of regions[q.pop()!].nbrs.keys()) if (!set.has(n) && z[n] >= z[id] && ok(n)) { set.add(n); q.push(n); }
    }
    // regions not drawn go with their filler
    if (!exact && o.filler) for (const [x, f] of o.filler) if (set.has(f)) set.add(x);
    const loops = loopsOf(pm, set);
    out.push({ region: id, loops: loops.map((l) => loopSegs(pm, fits, l)), raw: loops, holes: loops.some((l) => !l.outer), ...(exact ? { blend: 'multiply' as const } : {}) });
  }
  return out;
}

export { partPts };
