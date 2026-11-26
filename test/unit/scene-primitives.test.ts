import { describe, it, expect } from 'vitest';
import { detectPrimitive, primSegs } from '../../src/scene/primitives.js';
import { analyze } from '../../src/scene/analyze.js';
import { applyEdits } from '../../src/scene/edits.js';
import { summary } from '../../src/scene/summary.js';
import { bez } from '../../src/fitcurve.js';
import { paint, rect, ellipse, type RGB } from './scene-fixtures.js';

const ring = (n: number, f: (t: number) => number[]) => Array.from({ length: n }, (_, i) => f((i / n) * 2 * Math.PI));
const P = { image: 'x', colors: 16, minDe: 6, detail: 'normal' as const, maxPx: 1000 };
const BG: RGB = [240, 230, 210], INK: RGB = [40, 90, 170];

describe('detectPrimitive', () => {
  it('ellipse (rotated), circle, rect (rotated 12°), rounded rect, hexagon within 1 %', () => {
    const e = detectPrimitive(ring(200, (t) => { const u = 60 * Math.cos(t), v = 30 * Math.sin(t), c = Math.cos(0.5), s = Math.sin(0.5); return [100 + u * c - v * s, 80 + u * s + v * c]; }))!;
    expect(e.kind).toBe('ellipse'); expect(e.a).toBeCloseTo(60, -0.2); expect(e.b).toBeCloseTo(30, -0.2); expect(e.angle).toBeCloseTo(0.5, 1);
    expect(detectPrimitive(ring(200, (t) => [50 + 40 * Math.cos(t), 50 + 40 * Math.sin(t)]))!.kind).toBe('circle');
    const sq: number[][] = [];
    const c = Math.cos(0.21), s = Math.sin(0.21);
    for (const [u0, v0, u1, v1] of [[-50, -30, 50, -30], [50, -30, 50, 30], [50, 30, -50, 30], [-50, 30, -50, -30]]) for (let i = 0; i < 50; i++) { const u = u0 + ((u1 - u0) * i) / 50, v = v0 + ((v1 - v0) * i) / 50; sq.push([200 + u * c - v * s, 100 + u * s + v * c]); }
    const r = detectPrimitive(sq)!;
    expect(r.kind).toBe('rect'); expect(Math.max(r.a, r.b)).toBeCloseTo(50, 0); expect(Math.min(r.a, r.b)).toBeCloseTo(30, 0);
    // rounded rect r 20: sample its own outline
    const rr = { kind: 'rounded' as const, cx: 100, cy: 100, a: 80, b: 50, angle: 0, r: 20, err: 0 };
    const pts = primSegs(rr).flatMap((g) => Array.from({ length: 20 }, (_, i) => bez(g, i / 20)));
    const got = detectPrimitive(pts)!;
    expect(got.kind).toBe('rounded'); expect(got.r!).toBeCloseTo(20, -0.5);
    const hex = { kind: 'polygon' as const, cx: 100, cy: 100, a: 50, b: 50, angle: 0.3, n: 6, err: 0 };
    const hp = primSegs(hex).flatMap((g) => Array.from({ length: 20 }, (_, i) => bez(g, i / 20)));
    const h = detectPrimitive(hp)!;
    expect(h.kind).toBe('polygon'); expect(h.n).toBe(6); expect(h.a).toBeCloseTo(50, -0.3);
  });
  it('a wavy blob is no primitive; force gives the best of a kind anyway', () => {
    const blob = ring(300, (t) => { const r = 50 + 12 * Math.sin(3 * t); return [100 + r * Math.cos(t), 100 + r * Math.sin(t)]; });
    expect(detectPrimitive(blob)).toBeNull();
    expect(detectPrimitive(blob, 'ellipse')!.kind).toMatch(/ellipse|circle/);
  });
  it('from pixels: an anti-aliased disc and a box become primitives; the summary says so; free / auto edits', () => {
    const s = analyze(paint(300, 200, [ellipse(90, 100, 50, 50, INK), rect(170.4, 50.6, 100, 90, [200, 40, 60])], { bg: BG, noise: 2 }), P, { dir: '/tmp', path: 'x' });
    const kinds = s.prims.map((p) => p?.kind);
    expect(kinds.filter(Boolean).sort()).toEqual(['circle', 'rect', 'rect']);
    const disc = s.prims.find((p) => p?.kind === 'circle')!;
    expect(disc.a).toBeCloseTo(50, -0.3); expect(disc.cx).toBeCloseTo(90, -0.3);
    expect(summary(s)).toMatch(/ circle /);
    const id = s.prims.findIndex((p) => p?.kind === 'circle');
    applyEdits(s, [`r${id} free`]);
    expect(s.prims[id]).toBeNull();
    applyEdits(s, [`r${id} auto`]);
    expect(s.prims[id]?.kind).toBe('circle');
    expect(s.estRmse).toBeLessThan(0.03);
  });
});
