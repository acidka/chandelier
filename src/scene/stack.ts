// scene build geometry. Stacked (default, owner 2026-11-26): each region is drawn as itself plus every higher region
// it connects to, so a lower fill always runs on under the anti-aliased edge of the one above — no hairline seams on
// screen, an overlap against misregistration in print, whole layered shapes as a designer draws them. A dropped or
// text region stays in the stack and is filled by the shape below. Tiling: one shape per region, edges abutting.
import { loopsOf, partPts, type PlanarMap, type Loop } from './planar.js';
import { reverseSegs, type Seg } from './fitedges.js';
import type { Region } from './regions.js';

/** z per region id (0 = bottom): enclosing regions below what they enclose (filled area descending), lighter below
 * darker on ties. `over` lists ids to force to the top, last = topmost. */
export function zOrder(pm: PlanarMap, regions: Region[]): number[] {
  const filled = regions.map((r) => loopsOf(pm, new Set([r.id])).filter((l) => l.outer).reduce((a, l) => a - l.area, 0));
  const order = regions.map((r) => r.id).sort((a, b) => filled[b] - filled[a] || regions[b].L - regions[a].L || a - b);
  const z = new Array<number>(regions.length);
  order.forEach((id, n) => { z[id] = n; });
  return z;
}

export interface Shape {
  region: number;
  loops: Seg[][];
  /** any hole loop → even-odd fill */
  holes: boolean;
}

export interface StackOpts {
  tile?: boolean;
  /** regions not drawn (they stay in the stack) */
  skip?: Set<number>;
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
    let set: Set<number>;
    if (o.tile) set = new Set([id]);
    else {
      // the connected group of regions at or above this one, reached from it
      set = new Set([id]);
      const q = [id];
      while (q.length) for (const n of regions[q.pop()!].nbrs.keys()) if (!set.has(n) && z[n] >= z[id]) { set.add(n); q.push(n); }
    }
    const loops = loopsOf(pm, set);
    out.push({ region: id, loops: loops.map((l) => loopSegs(pm, fits, l)), holes: loops.some((l) => !l.outer) });
  }
  return out;
}

export { partPts };
