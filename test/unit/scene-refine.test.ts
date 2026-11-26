import { describe, it, expect } from 'vitest';
import { analyze } from '../../src/scene/analyze.js';
import { applyEdits } from '../../src/scene/edits.js';
import { measure, refine } from '../../src/scene/refine.js';
import { rgbLab } from '../../src/scene/color.js';
import { paint, below, ellipse, rect, type RGB } from './scene-fixtures.js';

const P = { image: 'x', colors: 16, minDe: 6, detail: 'normal' as const, maxPx: 1000 };
const BG: RGB = [240, 230, 210], ORANGE: RGB = [217, 130, 43], BLUE: RGB = [40, 90, 170];
const img = () => paint(300, 200, [below((x) => 100 + 30 * Math.sin(x / 30), ORANGE), ellipse(220, 50, 30, 30, BLUE)], { bg: BG, noise: 1 });

describe('refine', () => {
  it('an edge that misses the image edge is flagged and re-fitted tighter', () => {
    const s = analyze(img(), P, { dir: '/tmp', path: 'x' });
    const e = s.pm.edges.find((x) => x.left >= 0 && x.right >= 0 && !x.closed && x.pts.length > 100)!; // the wave
    const segs = s.fits[e.id];
    const a = segs[0][0], b = segs[segs.length - 1][3];
    s.fits[e.id] = [[a, [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3], [a[0] + (2 * (b[0] - a[0])) / 3, a[1] + (2 * (b[1] - a[1])) / 3], b]]; // a bad fit: one straight segment
    const m1 = measure(s, s.render), bad = m1.edges.find((x) => x.e === e.id)!;
    expect(bad.dev).toBeGreaterThan(1.5); // the search spans ±3 px around the curve
    const rep = refine(s, m1);
    expect(rep.fixed.some((f) => f.what === `edge r${e.left}|r${e.right}`)).toBe(true);
    expect(s.edgeTol![e.left < e.right ? `${e.left},${e.right}` : `${e.right},${e.left}`]).toBe(0.75);
    const now = measure(s, s.render).edges.find((x) => x.left === e.left && x.right === e.right)!;
    expect(now.dev).toBeLessThan(1);
  });
  it('an ink shifted ΔE 8 (as colour conversion would) is corrected back', () => {
    const s = analyze(img(), P, { dir: '/tmp', path: 'x' });
    const id = s.seg.regions.findIndex((r) => r.area > 0 && r.b < -20); // blue disc
    const c = s.meta[id].colour, true0 = { ...s.colours[c] };
    s.colours[c] = { ...true0, L: true0.L + 8 };
    applyEdits(s, ['show r0']); // no change; render still old: recompute through an edit that changes nothing visible
    applyEdits(s, ['tolerance 1']);
    const rep = refine(s, measure(s, s.render));
    expect(rep.fixed.some((f) => f.what === `c${c}`)).toBe(true);
    expect(Math.abs(s.colours[c].L - true0.L)).toBeLessThan(2);
    expect(rep.checks.darkest.ref).toBeLessThan(rep.checks.lightest.ref);
  });
  it('nothing to do on a good scene', () => {
    const s = analyze(img(), P, { dir: '/tmp', path: 'x' });
    const rep = refine(s, measure(s, s.render));
    expect(rep.fixed).toEqual([]);
    expect(rgbLab(0, 0, 0)[0]).toBe(0);
  });
  it('an ink whose regions miss in different directions (shading) is left alone and reported', () => {
    // two orange areas of one ink, one of them in shadow: their image colours differ by ~ΔE 15
    const im = paint(300, 200, [rect(10, 10, 120, 180, [217, 130, 43]), rect(170, 10, 120, 180, [190, 108, 30])], { bg: BG, noise: 1 });
    const s = analyze(im, { ...P, minDe: 20 }, { dir: '/tmp', path: 'x' }); // one ink for both
    const ids = s.seg.regions.filter((r) => r.area > 0 && r.a > 15).map((r) => r.id);
    expect(new Set(ids.map((i) => s.meta[i].colour)).size).toBe(1);
    const c = s.meta[ids[0]].colour, before = { ...s.colours[c] };
    const rep = refine(s, measure(s, s.render), 4);
    expect(s.colours[c]).toEqual(before);
    expect(rep.left.some((x) => /disagree/.test(x.why))).toBe(true);
  });
});
