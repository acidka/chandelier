import { describe, it, expect } from 'vitest';
import { planarMap, loopsOf, partPts, edgesByRegion, OUT } from '../../src/scene/planar.js';

/** a label map from rows of digits ('.' = transparent / outside) */
function grid(rows: string[]) {
  const h = rows.length, w = rows[0].length, map = new Int32Array(w * h);
  rows.forEach((r, y) => [...r].forEach((c, x) => { map[y * w + x] = c === '.' ? -2 : +c; }));
  return { map, w, h };
}
const closes = (pm: ReturnType<typeof planarMap>, loop: ReturnType<typeof loopsOf>[number]) => {
  const pts = loop.parts.flatMap((p) => partPts(pm, p));
  if (loop.parts.length === 1 && pm.edges[loop.parts[0].edge].closed) return true;
  const a = partPts(pm, loop.parts[0])[0], b = pts[pts.length - 1];
  return a[0] === b[0] && a[1] === b[1];
};

describe('planar map', () => {
  it('T configuration: three regions, junctions where they meet each other and the border', () => {
    const { map, w, h } = grid(['0000011111', '0000011111', '0000011111', '2222222222', '2222222222']);
    const pm = planarMap(map, w, h);
    // junctions: T inside (5,3), the 0|1 line meeting the top (5,0), the 0|2 / 1|2 line meeting both sides (0,3), (10,3)
    expect([...pm.junctions.values()].map((v) => v.join(',')).sort()).toEqual(['0,3', '10,3', '5,0', '5,3']);
    // edges: 0|1, 0|2, 1|2 inside; outside: 0|OUT, 1|OUT, 2|OUT
    expect(pm.edges).toHaveLength(6);
    for (const e of pm.edges) { expect(e.left).not.toBe(e.right); expect(e.closed).toBe(false); }
    const e01 = pm.edges.find((e) => new Set([e.left, e.right]).has(0) && new Set([e.left, e.right]).has(1))!;
    expect(e01.pts[0]).toEqual([5, 0]); expect(e01.pts[e01.pts.length - 1]).toEqual([5, 3]);
    expect(e01.pts.slice(1, -1).every((p) => p[0] === 5)).toBe(true);
  });
  it('sides are right: moving +x along the top of region 1, region 1 is on the right', () => {
    const { map, w, h } = grid(['000', '111']);
    const pm = planarMap(map, w, h);
    const e = pm.edges.find((x) => x.left !== OUT && x.right !== OUT)!;
    const goingRight = e.pts[e.pts.length - 1][0] > e.pts[0][0];
    expect(goingRight ? [e.left, e.right] : [e.right, e.left]).toEqual([0, 1]);
  });
  it('every region\'s loops close; outer negative, holes positive', () => {
    const { map, w, h } = grid(['00000000', '01111110', '01222210', '01222210', '01111110', '00000000']);
    const pm = planarMap(map, w, h);
    for (const r of [0, 1, 2]) for (const l of loopsOf(pm, new Set([r]))) expect(closes(pm, l)).toBe(true);
    const ring = loopsOf(pm, new Set([1]));
    expect(ring.filter((l) => l.outer)).toHaveLength(1); expect(ring.filter((l) => !l.outer)).toHaveLength(1);
    // crack midpoints cut each pixel corner by 1/8: a staircase becomes a straight line
    expect(ring.find((l) => l.outer)!.area).toBe(-23.5); expect(ring.find((l) => !l.outer)!.area).toBe(7.5);
    // ring ∪ inside: one outer loop, no hole
    const filled = loopsOf(pm, new Set([1, 2]));
    expect(filled).toHaveLength(1); expect(filled[0].area).toBe(-23.5);
  });
  it('an island inside one region is a closed edge; the outside counts as a region', () => {
    const { map, w, h } = grid(['0000', '0110', '0110', '0000']);
    const pm = planarMap(map, w, h);
    expect(pm.junctions.size).toBe(0);
    expect(pm.edges.filter((e) => e.closed)).toHaveLength(2); // 1|0 and 0|OUT
    const isl = loopsOf(pm, new Set([1]));
    expect(isl).toHaveLength(1); expect(isl[0].area).toBe(-3.5);
    expect(loopsOf(pm, new Set([0])).map((l) => l.area).sort()).toEqual([-15.5, 3.5]); // outer of 0 and its hole
  });
  it('saddle: diagonal pixels of one region make two separate loops', () => {
    const { map, w, h } = grid(['10', '01']);
    const pm = planarMap(map, w, h);
    expect(pm.junctions.has(1 * 3 + 1)).toBe(true);
    const l = loopsOf(pm, new Set([1]));
    expect(l).toHaveLength(2); expect(l.every((x) => x.area === -0.875 && closes(pm, x))).toBe(true);
  });
  it('Euler on a busy map: V − E + F = 2, and every edge is listed for both its regions', () => {
    const { map, w, h } = grid(['0011223', '0011223', '4455663', '4.55663', '7777777']);
    const pm = planarMap(map, w, h);
    const byR = edgesByRegion(pm);
    for (const e of pm.edges) { expect(byR.get(e.left)).toContain(e.id); expect(byR.get(e.right)).toContain(e.id); }
    // vertices: junctions; edges: open edges; faces: regions incl. outside; each closed edge adds one vertex + one edge
    const V = pm.junctions.size, E = pm.edges.filter((e) => !e.closed).length, F = new Set([...map].map((v) => Math.max(-1, v))).size + 1;
    // faces: regions 0–7, the '.' pixel (labelled OUT but enclosed) and the outer face; connected planar graph
    expect(V - E + F).toBe(2);
    for (const r of [0, 1, 2, 3, 4, 5, 6, 7]) for (const l of loopsOf(pm, new Set([r]))) expect(closes(pm, l)).toBe(true);
  });
  it('speed: 1000 × 1000 with 400 blobs', () => {
    const w = 1000, h = 1000, map = new Int32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) map[y * w + x] = ((Math.floor(x / 50) + Math.floor(y / 50) * 20) % 7) + (Math.hypot((x % 50) - 25, (y % 50) - 25) < 15 ? 10 : 0);
    const t = performance.now();
    const pm = planarMap(map, w, h);
    loopsOf(pm, new Set([0, 10]));
    expect(performance.now() - t).toBeLessThan(5000);
    expect(pm.edges.length).toBeGreaterThan(400);
  });
});
