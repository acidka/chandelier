import { describe, it, expect } from 'vitest';
import { analyze } from '../../src/scene/analyze.js';
import { applyEdits } from '../../src/scene/edits.js';
import { summary } from '../../src/scene/summary.js';
import { buildSteps } from '../../src/scene/build.js';
import { findOverlaps, multiplied, multiplyFill } from '../../src/scene/overlap.js';
import { rgbLab, de76 } from '../../src/scene/color.js';
import { paint, ellipse, type RGB } from './scene-fixtures.js';

const P = { image: 'x', colors: 16, minDe: 6, detail: 'normal' as const, maxPx: 1000 };
const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const enc = (c: number) => Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255);
const PAPER: RGB = [240, 225, 200], A: RGB = [230, 150, 70], B: RGB = [200, 120, 140];
// what multiply really gives: a and b as seen over the paper, their overlap = a·b/paper in linear light
const X = [0, 1, 2].map((k) => enc((lin(A[k]) * lin(B[k])) / lin(PAPER[k]))) as RGB;
const img = () => paint(300, 200, [ellipse(120, 100, 70, 60, A), ellipse(190, 100, 70, 60, B), { inside: (x, y) => ((x - 120) / 70) ** 2 + ((y - 100) / 60) ** 2 <= 1 && ((x - 190) / 70) ** 2 + ((y - 100) / 60) ** 2 <= 1, c: X }], { bg: PAPER, noise: 1 });

describe('translucent layers', () => {
  it('colour maths: a over b over s, and the fill that gives a over s', () => {
    const m = multiplied(rgbLab(...A), rgbLab(...B), rgbLab(...PAPER));
    expect(de76(...(m as [number, number, number]), ...rgbLab(...X))).toBeLessThan(1);
    const f = multiplyFill(rgbLab(...A), rgbLab(...PAPER));
    expect(de76(...(multiplied(f, rgbLab(...PAPER), [100, 0, 0]) as [number, number, number]), ...rgbLab(...A))).toBeLessThan(1.5); // f over the paper = a
  });
  it('finds the overlap, hints it; "layers" makes two multiply shapes over it and renders close', () => {
    const s = analyze(img(), P, { dir: '/tmp', path: 'x' });
    const o = findOverlaps(s)[0];
    expect(o).toBeTruthy();
    expect(summary(s)).toMatch(new RegExp(`r${o.x} ≈ r${o.a} × r${o.b} over r${o.s}`));
    const before = s.estRmse;
    applyEdits(s, [`layers r${o.a} r${o.b}`]);
    expect(s.meta[o.x].drop).toBe(true);
    expect(s.meta[o.a].multiply).toEqual([o.x]);
    expect(summary(s)).toMatch(new RegExp(`^r${o.a} .* (flat|ellipse|circle)× `, 'm'));
    expect(s.estRmse).toBeLessThan(before + 0.01);
    const steps = buildSteps(s, { rect: [0, 0, 300, 200] }).batches[0];
    const items = steps.filter((x) => x.tool === 'create_path' || x.tool === 'create_shape').flatMap((x) => x.args.items as any[]);
    expect(items.filter((i) => i.blend === 'multiply')).toHaveLength(2);
    expect(items.some((i) => i.name === `Scene r${o.x}`)).toBe(false);
    expect(() => applyEdits(s, [`layers r${o.s} r${o.a}`])).toThrow(/no region between/);
  });
});
