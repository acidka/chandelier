// Regression tests for the scene findings fixed 2026-11-27 (docs/research/scene-plan.md § 9): F28, F31, F37, F42,
// F44/F50, F45, F47, F48.
import { describe, it, expect } from 'vitest';
import { analyze } from '../../src/scene/analyze.js';
import { applyEdits } from '../../src/scene/edits.js';
import { measure, refine } from '../../src/scene/refine.js';
import { buildSteps } from '../../src/scene/build.js';
import { paint, rect, ellipse, type RGB } from './scene-fixtures.js';

const P = { image: 'x', colors: 16, minDe: 6, detail: 'normal' as const, maxPx: 1000 };
const BG: RGB = [240, 230, 210], DARK: RGB = [30, 30, 30], BLUE: RGB = [40, 90, 170], GREY: RGB = [90, 90, 90], WHITE: RGB = [252, 252, 252];

describe('scene text boxes (F44, F47, F50)', () => {
  it('the ink is the text, not the paper around it, and cap is the letters\' height', () => {
    // a white label (wholly inside the box, larger than the letters) with grey letters of two heights on it
    const im = paint(300, 200, [rect(10, 10, 200, 80, WHITE), rect(20, 30, 10, 30, GREY), rect(40, 30, 10, 30, GREY), rect(60, 30, 10, 30, GREY), rect(80, 42, 10, 18, GREY)], { bg: BG, noise: 1 });
    const s = analyze(im, P, { dir: '/tmp', path: 'x' });
    applyEdits(s, ['text 5 5 210 90']);
    const tb = buildSteps(s, { rect: [0, 0, 300, 200] }).textBoxes[0];
    expect(tb.colour).toMatch(/^#5[89a]5[89a]5[89a]$/);
    expect(tb.cap).toBeGreaterThan(28);
    expect(tb.cap).toBeLessThan(32);
  });
});

describe('scene drop in a box (F48)', () => {
  it('nothing wholly inside: an error naming the regions it cuts; with fill rF their part is repainted', () => {
    const im = paint(300, 200, [rect(0, 100, 300, 100, DARK), rect(140, 90, 20, 20, DARK)], { bg: BG, noise: 1 });
    const s = analyze(im, P, { dir: '/tmp', path: 'x' });
    const dark = s.seg.regions.find((r) => r.area > 0 && r.L < 20)!.id, bg = s.seg.regions.find((r) => r.area > 0 && r.L > 80)!.id;
    expect(() => applyEdits(s, ['drop in 135 85 30 15'])).toThrow(new RegExp(`cuts .*r${dark}.*fill rF`));
    const before = s.seg.regions[dark].area;
    applyEdits(s, [`drop in 135 85 30 15 fill r${bg}`]);
    expect(s.seg.regions[dark].area).toBeLessThanOrEqual(before - 190);
    expect(s.seg.map[95 * s.work.w + 150]).toBe(bg);
  });
});

describe('scene refine (F31, F42, F45)', () => {
  const two = () => paint(300, 200, [rect(10, 10, 120, 180, [217, 130, 43]), ellipse(220, 100, 50, 50, BLUE)], { bg: BG, noise: 1 });
  it('a single region far off its ink is reported, not moved', () => {
    const s = analyze(two(), P, { dir: '/tmp', path: 'x' });
    const id = s.seg.regions.findIndex((r) => r.area > 0 && r.b < -20), c = s.meta[id].colour, was = { ...s.colours[c] };
    s.colours[c] = { ...was, L: was.L + 25 };
    applyEdits(s, ['tolerance 1']);
    const rep = refine(s, measure(s, s.render));
    expect(rep.fixed.some((f) => f.what === `c${c}`)).toBe(false);
    expect(rep.left.some((x) => /too far for a conversion shift/.test(x.why))).toBe(true);
  });
  it('one ink: no darkest / lightest pair (they would be one region)', () => {
    const s = analyze(paint(200, 200, [rect(0, 0, 200, 200, [217, 130, 43])], { noise: 1 }), P, { dir: '/tmp', path: 'x' });
    const rep = refine(s, measure(s, s.render));
    expect(rep.checks.darkest).toBeUndefined();
    expect(rep.checks.max_segments).toBeDefined();
  });
  it('when all fixes together are worse, the helping kind is kept instead of reverting everything', () => {
    const s = analyze(two(), P, { dir: '/tmp', path: 'x' });
    const id = s.seg.regions.findIndex((r) => r.area > 0 && r.b < -20), c = s.meta[id].colour, was = { ...s.colours[c] };
    s.colours[c] = { ...was, L: was.L + 10 };
    applyEdits(s, ['tolerance 1']);
    const m = measure(s, s.render);
    // an edge that "misses" by a lot, whose tightening can't help: forces a mixed fix set
    m.edges.push({ e: m.edges[0].e, left: m.edges[0].left, right: m.edges[0].right, dev: 50 });
    const rep = refine(s, m);
    expect(rep.reverted).not.toBe(true);
    expect(Math.abs(s.colours[c].L - was.L)).toBeLessThan(3);
  });
});

describe('scene analyze options (F28, F37)', () => {
  it('photo: false keeps ramp hints on a noisy image; max_px upscales a small crop only when given', () => {
    const im = paint(120, 80, [rect(10, 10, 50, 50, BLUE)], { bg: BG, noise: 6 });
    expect(analyze(im, { ...P, photo: false }, { dir: '/tmp', path: 'x' }).photo).toBe(false);
    expect(analyze(im, { ...P, photo: true }, { dir: '/tmp', path: 'x' }).photo).toBe(true);
    // the crop's own px (inner); the working image adds a margin (F25)
    expect(analyze(im, { ...P, crop: [0, 0, 60, 40] }, { dir: '/tmp', path: 'x' }).inner![2]).toBe(60);
    expect(analyze(im, { ...P, crop: [0, 0, 60, 40], maxPx: 240, upscale: true }, { dir: '/tmp', path: 'x' }).inner![2]).toBe(240);
    expect(analyze(im, { ...P, crop: [0, 0, 60, 40], margin: 0 }, { dir: '/tmp', path: 'x' }).work.w).toBe(60);
  });
});
