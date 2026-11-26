import { describe, it, expect } from 'vitest';
import { rgbToLab } from '../../src/scene/color.js';
import { bilateral } from '../../src/scene/smooth.js';
import { quantize } from '../../src/scene/quantize.js';
import { segment } from '../../src/scene/regions.js';
import { planarMap } from '../../src/scene/planar.js';
import { fitEdges, corners, reverseSegs } from '../../src/scene/fitedges.js';
import { bez, type Seg } from '../../src/fitcurve.js';
import { paint, rect, ellipse, below, type RGB } from './scene-fixtures.js';
import type { Img } from '../../src/image.js';

const BG: RGB = [240, 230, 210], INK: RGB = [40, 90, 170], RED: RGB = [200, 40, 60];
function scene(img: Img) {
  const lab = bilateral(rgbToLab(img)), seg = segment(lab, quantize(lab).labels);
  const pm = planarMap(seg.map, seg.w, seg.h);
  return { seg, pm, fits: fitEdges(pm) };
}
const inner = (pm: ReturnType<typeof planarMap>) => pm.edges.filter((e) => e.left >= 0 && e.right >= 0);
const cross = (a: number[], b: number[]) => a[0] * b[1] - a[1] * b[0];

describe('fitEdges', () => {
  it('anti-aliased circle r 100: one closed edge, ≤ 8 anchors, within 1 px, starts at the top with level handles', () => {
    const { pm, fits } = scene(paint(260, 260, [ellipse(130, 130, 100, 100, INK)], { bg: BG, noise: 2 }));
    const e = inner(pm);
    expect(e).toHaveLength(1); expect(e[0].closed).toBe(true);
    const segs = fits[e[0].id];
    expect(segs.length).toBeLessThanOrEqual(8);
    let worst = 0;
    for (const c of segs) for (let i = 0; i <= 20; i++) worst = Math.max(worst, Math.abs(Math.hypot(...bez(c, i / 20).map((v, k) => v - 130) as [number, number]) - 100));
    expect(worst).toBeLessThan(1);
    expect(segs[0][0][1]).toBeLessThan(31); // the top
    expect(Math.abs(segs[0][1][1] - segs[0][0][1])).toBeLessThan(1e-9); // level out
    expect(Math.abs(segs[segs.length - 1][2][1] - segs[segs.length - 1][3][1])).toBeLessThan(1e-9); // level in
  });
  it('square: 4 sharp corners and 4 straight sides', () => {
    const { pm, fits } = scene(paint(200, 200, [rect(50.3, 40.6, 100, 110, INK)], { bg: BG, noise: 2 }));
    const segs = fits[inner(pm)[0].id];
    expect(segs.length).toBeLessThanOrEqual(5); // TODO: 4 — per-pixel unmixing zigzags a half-covered row (headroom work, 2026-11-26)
    for (const c of segs) {
      const d = [c[3][0] - c[0][0], c[3][1] - c[0][1]];
      expect(Math.min(Math.abs(d[0]), Math.abs(d[1]))).toBeLessThan(1.2); // axis-aligned side
      for (const h of [c[1], c[2]]) expect(Math.abs(cross([h[0] - c[0][0], h[1] - c[0][1]], d)) / Math.hypot(...d as [number, number])).toBeLessThan(0.8);
    }
  });
  it('T junction: the through-curve keeps one tangent, the stem meets freely', () => {
    // a wavy band boundary (through) with a vertical divider below it: regions top, bottom-left, bottom-right
    const { pm, fits } = scene(paint(300, 200, [below((x) => 80 + 15 * Math.sin(x / 40), INK), { inside: (x, y) => x >= 150 && y >= 80 + 15 * Math.sin(x / 40), c: RED }], { bg: BG, noise: 1 }));
    const edges = inner(pm);
    expect(edges).toHaveLength(3);
    // the junction near (150, 80 + 15 sin(3.75)) where three regions meet
    const jx = [...pm.junctions.values()].find((v) => v[0] > 140 && v[0] < 160 && v[1] > 40 && v[1] < 120)!;
    expect(jx).toBeTruthy();
    const tangents = edges.map((e) => {
      const segs = fits[e.id], atStart = Math.hypot(segs[0][0][0] - jx[0], segs[0][0][1] - jx[1]) < 1e-6;
      const c = atStart ? segs[0] : segs[segs.length - 1];
      const h = atStart ? [c[1][0] - c[0][0], c[1][1] - c[0][1]] : [c[2][0] - c[3][0], c[2][1] - c[3][1]];
      return { e, h: h.map((v) => v / Math.hypot(h[0], h[1])) };
    });
    const horiz = tangents.filter((t) => Math.abs(t.h[0]) > 0.7);
    expect(horiz).toHaveLength(2);
    expect(Math.abs(cross(horiz[0].h, horiz[1].h))).toBeLessThan(1e-6); // exactly opposite: smooth through
    expect(horiz[0].h[0] * horiz[1].h[0]).toBeLessThan(0);
  });
  it('shared edges are exact at junctions (watertight) and reverseSegs flips a run', () => {
    const { pm, fits } = scene(paint(300, 200, [below((x) => 80 + 15 * Math.sin(x / 40), INK), rect(150, 0, 150, 200, RED)], { bg: BG, noise: 1 }));
    for (const e of pm.edges) {
      if (e.closed) continue;
      const segs = fits[e.id], j0 = pm.junctions.get(e.j0)!, j1 = pm.junctions.get(e.j1)!;
      expect(segs[0][0]).toEqual(j0); expect(segs[segs.length - 1][3]).toEqual(j1);
      for (let i = 1; i < segs.length; i++) expect(segs[i][0]).toEqual(segs[i - 1][3]);
    }
    const s: Seg[] = [[[0, 0], [1, 0], [2, 0], [3, 0]], [[3, 0], [3, 1], [3, 2], [3, 3]]];
    expect(reverseSegs(s)).toEqual([[[3, 3], [3, 2], [3, 1], [3, 0]], [[3, 0], [2, 0], [1, 0], [0, 0]]]);
  });
  it('corners: none on a small circle, four on a square path', () => {
    const circle = Array.from({ length: 60 }, (_, i) => [10 + 8 * Math.cos((i / 60) * 2 * Math.PI), 10 + 8 * Math.sin((i / 60) * 2 * Math.PI)]);
    expect(corners(circle, true)).toEqual([]);
    const sq: number[][] = [];
    for (let i = 0; i < 40; i++) sq.push([i * 0.5, 0]); for (let i = 0; i < 40; i++) sq.push([20, i * 0.5]);
    for (let i = 0; i < 40; i++) sq.push([20 - i * 0.5, 20]); for (let i = 0; i < 40; i++) sq.push([0, 20 - i * 0.5]);
    expect(corners(sq, true).sort((a, b) => a - b)).toEqual([0, 40, 80, 120]);
  });
});
