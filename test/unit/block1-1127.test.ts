// Block of measurable fixes 2026-11-27: F19 robust forced circle, F32 short curved edges, F36 split edit, F17 refine keeps
// tolerances that don't help, preview {reference, sample} (pure parts; the Illustrator side runs in live-bugs-1127).
import { describe, it, expect } from 'vitest';
import { fitCircle, fitCircleRobust, detectPrimitive } from '../../src/scene/primitives.js';
import { fitEdges } from '../../src/scene/fitedges.js';
import { analyze } from '../../src/scene/analyze.js';
import { applyEdits } from '../../src/scene/edits.js';
import { measure, refine } from '../../src/scene/refine.js';
import { paint, rect, ellipse, below, mulberry32, type RGB } from './scene-fixtures.js';

const P = { image: 'x', colors: 16, minDe: 6, detail: 'normal' as const, maxPx: 1000 };
const BG: RGB = [240, 230, 210];

describe('F19 forced circle on a disc with a lobe', () => {
  it('fits the round stretch, not the lobe', () => {
    // a circle r 50 at (100, 100); a quarter of its outline bulges out 15 px (the lobe)
    const pts: number[][] = [];
    for (let i = 0; i < 360; i++) {
      const t = (i * Math.PI) / 180, bump = i < 90 ? 15 * Math.sin(2 * t) : 0;
      pts.push([100 + (50 + bump) * Math.cos(t), 100 + (50 + bump) * Math.sin(t)]);
    }
    const plain = fitCircle(pts), robust = fitCircleRobust(pts), pr = detectPrimitive(pts, 'circle')!;
    expect(Math.hypot(plain[0] - 100, plain[1] - 100)).toBeGreaterThan(3); // the old fit is pulled toward the lobe
    expect(Math.hypot(robust[0] - 100, robust[1] - 100)).toBeLessThan(1);
    expect(Math.abs(robust[2] - 50)).toBeLessThan(1);
    expect(Math.hypot(pr.cx - 100, pr.cy - 100)).toBeLessThan(1);
  });
  it('a clean circle stays the same', () => {
    const rnd = mulberry32(3), pts = Array.from({ length: 200 }, (_, i) => { const t = (i / 200) * 2 * Math.PI; return [60 + 30 * Math.cos(t) + (rnd() - 0.5) * 0.4, 40 + 30 * Math.sin(t) + (rnd() - 0.5) * 0.4]; });
    const c = fitCircleRobust(pts);
    expect(Math.hypot(c[0] - 60, c[1] - 40)).toBeLessThan(0.2);
  });
});

describe('F32 short edges between junctions', () => {
  const pm = (pts: number[][]) => ({ w: 50, h: 50, junctions: new Map(), edges: [{ id: 0, left: 0, right: 1, j0: 0, j1: 1, pts, closed: false }] });
  it('a short bowed edge gets a curve, a short straight one stays a line', () => {
    const bowed = fitEdges(pm([[0, 0], [2, 1.2], [4, 1.6], [6, 1.2], [8, 0]]) as any)[0];
    const mid = (s: number[][]) => [(s[0][1] + 3 * s[1][1] + 3 * s[2][1] + s[3][1]) / 8];
    expect(bowed.some((sg) => Math.abs(sg[1][1]) > 0.3 || Math.abs(sg[2][1]) > 0.3)).toBe(true);
    expect(Math.max(...bowed.map((sg) => mid(sg)[0]))).toBeGreaterThan(1);
    const straight = fitEdges(pm([[0, 0], [2, 0.1], [4, 0], [6, -0.1], [8, 0]]) as any)[0];
    expect(straight).toHaveLength(1);
    expect(Math.abs(straight[0][1][1]) + Math.abs(straight[0][2][1])).toBeLessThan(0.01);
  });
});

describe('F36 split rN in x y w h', () => {
  it('the part in the box becomes a new region with the same ink; undo brings back the same ids', () => {
    // a frame line (dark bar) with a dark leaf touching it: one region
    const im = paint(200, 120, [rect(10, 50, 180, 6, [30, 60, 30]), ellipse(100, 40, 10, 14, [30, 60, 30])], { bg: BG, noise: 1 });
    const s = analyze(im, P, { dir: '/tmp', path: 'x' });
    const line = s.seg.regions.find((r) => r.area > 0 && r.L < 40)!.id, before = s.seg.regions.length;
    const res = applyEdits(s, [`split r${line} in 85 20 30 30`]);
    const nid = before;
    expect(s.seg.regions).toHaveLength(before + 1);
    expect(s.seg.regions[nid].area).toBeGreaterThan(300);
    expect(s.meta[nid].colour).toBe(s.meta[line].colour);
    expect(res.show).toContain(nid);
    applyEdits(s, [`drop r${line}`]);
    expect(s.shapes.some((sh) => sh.region === nid)).toBe(true); // the leaf stays when the line goes
    applyEdits(s, ['undo']);
    expect(s.seg.regions).toHaveLength(before + 1);
    applyEdits(s, ['reset']);
    expect(s.seg.regions).toHaveLength(before);
    expect(() => applyEdits(s, [`split r${line} in 0 0 3 3`])).toThrow(/no pixels/);
  });
});

describe('F17 refine on a noisy edge', () => {
  it('an edge whose tighter fit does not come closer keeps its tolerance and is reported', () => {
    // heavy noise and a low-quality JPEG round trip: several edges "miss" by ~2 px that a tighter fit can't remove
    const im = paint(300, 200, [below((x) => 100 + 30 * Math.sin(x / 30), [217, 130, 43]), ellipse(220, 50, 30, 30, [40, 90, 170])], { bg: BG, noise: 25, jpeg: 30 });
    const s = analyze(im, P, { dir: '/tmp', path: 'x' });
    const rep = refine(s, measure(s, s.render));
    const kept = rep.left.filter((x) => /tolerance kept/.test(x.why));
    expect(kept.length).toBeGreaterThan(0);
    for (const x of kept) { const [, a, b] = x.why.match(/edge r(\d+)\|r(\d+)/)!; expect(s.edgeTol?.[`${Math.min(+a, +b)},${Math.max(+a, +b)}`]).toBeUndefined(); }
  });
});
