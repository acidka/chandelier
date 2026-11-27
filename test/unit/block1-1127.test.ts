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

describe('F22 ramp stops where Illustrator puts its default gradient span', () => {
  it('an angled ramp on an ellipse: stops are fractions of the ellipse\'s own extent along the angle', async () => {
    const { buildSteps } = await import('../../src/scene/build.js');
    const W = 400, H = 300, th = (30 * Math.PI) / 180, ux = Math.cos(th), uy = Math.sin(th), rgb = new Uint8Array(W * H * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      if (((x - 200) / 150) ** 2 + ((y - 150) / 100) ** 2 > 1) { rgb.set([245, 240, 230], i); continue; }
      const t = Math.max(0, Math.min(1, (((x - 200) * ux + (y - 150) * uy) / 150 + 1) / 2));
      rgb.set([230 - 140 * t, 120 - 90 * t, 40 + 80 * t].map(Math.round), i);
    }
    const s = analyze({ w: W, h: H, rgb }, P, { dir: '/tmp', path: 'x' });
    const ids = s.rampGroups[0].ids;
    applyEdits(s, ['ramp ' + ids.map((i) => 'r' + i).join(' ')]);
    const id = ids[0], rp = s.ramps[id]!, steps = buildSteps(s, { rect: [0, 0, W, H] }).batches[0];
    const stops = steps.find((x) => x.tool === 'swatches' && x.args.kind === 'gradient')!.args.stops as { at: number }[];
    const a = Math.atan2(rp.uy, rp.ux), ext = 2 * Math.hypot(150 * Math.cos(a), 100 * Math.sin(a)), qc = rp.ux * (rp.cx - 200) + rp.uy * (rp.cy - 150);
    const want = (t: number) => 50 + (100 * (qc + t)) / ext;
    expect(Math.abs(stops[0].at - want(rp.t0))).toBeLessThan(1.5);
    expect(Math.abs(stops[1].at - want(rp.t1))).toBeLessThan(1.5);
  });
});

describe('F18 rN stroke: a thin band as a centreline stroke', () => {
  it('a ring of width 6 becomes one closed stroke of width ~6; an open band an open stroke', async () => {
    const { buildSteps } = await import('../../src/scene/build.js');
    const { summary } = await import('../../src/scene/summary.js');
    const { ring } = await import('./scene-fixtures.js');
    const im = paint(300, 200, [ring(100, 100, 57, 63, [30, 60, 120]), rect(180, 97, 100, 6, [200, 40, 40])], { bg: BG, noise: 1 });
    const s = analyze(im, P, { dir: '/tmp', path: 'x' });
    const ringId = s.seg.regions.find((r) => r.area > 0 && r.b < -20)!.id, barId = s.seg.regions.find((r) => r.area > 0 && r.a > 30)!.id;
    const before = s.estRmse;
    applyEdits(s, [`r${ringId} stroke`, `r${barId} stroke`]);
    const rs = s.shapes.find((sh) => sh.region === ringId)!.stroke!, bs = s.shapes.find((sh) => sh.region === barId)!.stroke!;
    expect(rs.closed).toBe(true);
    expect(Math.abs(rs.width - 6)).toBeLessThan(0.5);
    // the centreline runs on the ring's middle circle (r 60) all the way round
    const { bez } = await import('../../src/fitcurve.js');
    for (const c of rs.segs) for (const t of [0, 0.5]) { const p = bez(c, t); expect(Math.abs(Math.hypot(p[0] - 100, p[1] - 100) - 60)).toBeLessThan(1.2); }
    expect(bs.closed).toBe(false);
    expect(Math.abs(bs.width - 6)).toBeLessThan(0.7);
    expect(summary(s)).toMatch(new RegExp(`r${ringId} .* stroke \\d`));
    expect(s.estRmse).toBeLessThan(before + 0.04); // a stroke of the measured width: only the anti-aliased edges differ
    const items = buildSteps(s, { rect: [0, 0, 150, 100], ptPerUnit: 72 / 25.4 }).batches.flat().filter((x) => x.tool === 'create_path').flatMap((x) => x.args.items as any[]);
    const ri = items.find((i) => i.name === `Scene r${ringId}`);
    expect(ri).toMatchObject({ fill: 'none', join: 'miter' });
    expect(ri.stroke).toMatch(/^swatch:/);
    expect(ri.stroke_width).toBeCloseTo(rs.width * 0.5 * 72 / 25.4, 1);
    expect(ri.d).toMatch(/Z$/);
    expect(items.find((i) => i.name === `Scene r${barId}`).d).not.toMatch(/Z$/);
    applyEdits(s, [`r${ringId} fill`]);
    expect(s.shapes.find((sh) => sh.region === ringId)!.stroke).toBeUndefined();
  });
});

describe('F29 ramp hints on grainy soft gradients', () => {
  const grad = (c0: number[], c1: number[]) => Array.from({ length: 260 }, (_, i) => rect(20 + i, 30, 1, 140, c0.map((c, k) => Math.round(c + ((c1[k] - c) * i) / 259)) as RGB));
  it('a gradient is a ramp at noise σ 1–8; a step between two flat inks never is', { timeout: 30_000 }, () => {
    for (const noise of [1, 4, 8]) {
      const g = analyze(paint(300, 200, grad([220, 160, 120], [120, 60, 40]), { bg: [245, 245, 245], noise, jpeg: 70 }), { ...P, photo: false }, { dir: '/tmp', path: 'x' });
      expect(g.rampGroups.length).toBeGreaterThan(0);
      const st = analyze(paint(300, 200, [rect(20, 30, 130, 140, [200, 140, 100]), rect(150, 30, 130, 140, [170, 110, 75])], { bg: [245, 245, 245], noise, jpeg: 70 }), { ...P, photo: false }, { dir: '/tmp', path: 'x' });
      expect(st.rampGroups).toEqual([]);
    }
  });
});

describe('curve fit: curvature continuity and fixed anchors', () => {
  const curvEnd = (c: number[][], end: boolean) => {
    const [a, b, q] = end ? [c[3], c[2], c[1]] : [c[0], c[1], c[2]];
    const d1 = [b[0] - a[0], b[1] - a[1]], d2 = [q[0] - b[0], q[1] - b[1]], L = Math.hypot(d1[0], d1[1]);
    return ((end ? -1 : 1) * (2 / 3) * (d1[0] * d2[1] - d1[1] * d2[0])) / L ** 3;
  };
  const gaps = (segs: number[][][]) => segs.slice(1).map((B, k) => { const a = curvEnd(segs[k], true), b = curvEnd(B, false); return a * b > 0 ? Math.abs(a - b) / (Math.abs(a) + Math.abs(b)) : 0; });
  it('a joint whose bend jumps is evened out within the tolerance', async () => {
    const { fitCurve, matchCurvature, bez } = await import('../../src/fitcurve.js');
    const pts = Array.from({ length: 200 }, (_, i) => [i * 2, 60 + 40 * Math.sin(i / 20)]);
    const segs = fitCurve(pts, { tolerance: 1 }) as any;
    expect(Math.max(...gaps(segs))).toBeLessThan(0.35);
    // spoil one joint: A's last handle 1.2× longer
    const k = 0, A = segs[k], d = [A[2][0] - A[3][0], A[2][1] - A[3][1]];
    const bad = segs.map((c: any) => c.map((q: any) => [...q]));
    bad[k][2] = [A[3][0] + 1.2 * d[0], A[3][1] + 1.2 * d[1]];
    const before = gaps(bad)[k];
    matchCurvature(bad, pts as any, 3);
    expect(gaps(bad)[k]).toBeLessThan(before);
    const miss = Math.max(...pts.map((q) => Math.min(...bad.flatMap((c: any) => Array.from({ length: 33 }, (_, i) => { const p = bez(c, i / 32); return Math.hypot(p[0] - q[0], p[1] - q[1]); })))));
    expect(miss).toBeLessThan(3.2);
  });
  it('anchors: the nearest measured point becomes an anchor', async () => {
    const { fitCurve } = await import('../../src/fitcurve.js');
    const pts = Array.from({ length: 101 }, (_, i) => [i, 0.002 * (i - 50) ** 2]);
    const free = fitCurve(pts, { tolerance: 0.5 }), fixed = fitCurve(pts, { tolerance: 0.5, anchors: [[25.2, 1.3], [80, 2]] });
    const at = (segs: any[]) => segs.slice(1).map((c) => c[0][0]);
    expect(at(fixed)).toEqual(expect.arrayContaining([25, 80]));
    expect(at(free)).not.toContain(25);
  });
});
