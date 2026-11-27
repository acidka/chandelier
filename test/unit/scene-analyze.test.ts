import { describe, it, expect } from 'vitest';
import { analyze, cutToCrop } from '../../src/scene/analyze.js';
import { summary } from '../../src/scene/summary.js';
import { overlay } from '../../src/scene/overlay.js';
import { paint, rect, ellipse, below, type RGB } from './scene-fixtures.js';
import type { Params } from '../../src/scene/types.js';

const BG: RGB = [240, 230, 210], ORANGE: RGB = [217, 130, 43], DARK: RGB = [40, 40, 40], BLUE: RGB = [40, 90, 170], RED: RGB = [200, 40, 60];
const P = (o: Partial<Params> = {}): Params => ({ image: 'x.png', colors: 16, minDe: 6, detail: 'normal', maxPx: 1000, ...o });
// a poster: rectangles, circles, three wave bands
const poster = (w = 400, h = 300, noise = 2) => paint(w, h, [
  below((x) => h * 0.55 + 12 * Math.sin(x / 40), [233, 160, 90]), below((x) => h * 0.7 + 15 * Math.sin(x / 50 + 1), ORANGE), below((x) => h * 0.85 + 10 * Math.sin(x / 35 + 2), [160, 80, 30]),
  rect(w * 0.08, h * 0.08, w * 0.3, h * 0.25, BLUE), ellipse(w * 0.7, h * 0.25, w * 0.1, w * 0.1, DARK), ellipse(w * 0.7, h * 0.25, w * 0.04, w * 0.04, RED),
], { bg: BG, noise });

describe('analyze', () => {
  it('poster: exact region count, low error, summary and overlay in budget', { timeout: 20_000 }, () => { // ~1.5 s alone; the full suite runs files in parallel
    const s = analyze(poster(), P(), { dir: '/tmp/x', path: 'x.png' });
    expect(s.seg.regions.filter((r) => r.area > 0)).toHaveLength(7); // bg, 3 bands, rect, disc, dot
    expect(s.estRmse).toBeLessThan(0.02);
    expect(s.fits.reduce((a, f) => a + f.length, 0)).toBeLessThan(60);
    const text = summary(s, { file: '/tmp/x/s1/scene.json' });
    expect(text.length).toBeLessThan(3000);
    const head = JSON.parse(text.split('\n')[0]);
    expect(head).toMatchObject({ id: s.id, px: [400, 300], regions: 7, colours: 7 });
    expect(text).toMatch(/^r0 /m); expect(text).toMatch(/colours: c0 /);
    const ov = overlay(s);
    expect(Math.max(ov.w, ov.h)).toBeLessThanOrEqual(1600);
    expect(ov.w).toBe(2 * Math.round(400 * Math.min(4, 1600 / 808)) + 8); // small images are enlarged to fit
  });
  it('a 4-point map and maxPx; ids by area; z: background bottom', () => {
    const s = analyze(poster(), P({ map: [[0, 0], [400, 0], [400, 300], [0, 300]], maxPx: 200 }), { dir: '/tmp/x', path: 'x.png' });
    expect([s.work.w, s.work.h]).toEqual([200, 150]);
    expect(s.z[0]).toBe(0);
  });
  it('transparent pixels stay out', () => {
    const img = poster(200, 150);
    img.a = new Uint8Array(200 * 150).fill(255);
    for (let i = 0; i < 200 * 30; i++) img.a[i] = 0;
    const s = analyze(img, P(), { dir: '/tmp/x', path: 'x.png' });
    expect(s.seg.map[5]).toBeLessThan(0);
  });
  it('speed: 1000 × 750 with 50 shapes in bounded time (real numbers: bench/scene-bench.mjs)', () => {
    const shapes = Array.from({ length: 50 }, (_, i) => ellipse(60 + (i % 10) * 90, 80 + Math.floor(i / 10) * 140, 30 + (i % 3) * 8, 25, ([ORANGE, BLUE, DARK, RED] as RGB[])[i % 4]));
    const t = performance.now();
    const s = analyze(paint(1000, 750, shapes, { bg: BG, ss: 2, noise: 2 }), P(), { dir: '/tmp/x', path: 'x.png' });
    expect(performance.now() - t).toBeLessThan(20000); // CI runners and a parallel suite are slow
    expect(s.seg.regions.filter((r) => r.area > 0).length).toBe(51);
  }, 60000);

  it('a small region of its own colour gets its own ink; the others keep theirs (ownInks)', { timeout: 20_000 }, () => {
    // four inks allowed: background, skin, dark and brown win; the small red patch (lips) gets brown, the nearest
    const img = paint(400, 300, [rect(40, 40, 200, 200, [233, 190, 160]), rect(260, 40, 120, 100, DARK), rect(260, 150, 120, 90, [130, 75, 50]), rect(110, 150, 40, 18, [190, 30, 40])], { bg: BG, noise: 2 });
    const s = analyze(img, P({ colors: 4 }), { dir: '/tmp/x', path: 'x.png' });
    const at = (x: number, y: number) => s.seg.map[y * 400 + x], col = (x: number, y: number) => s.colours[s.meta[at(x, y)].colour];
    expect(s.quant.k).toBe(4);
    expect(col(130, 159).a).toBeGreaterThan(50); // red, not brown
    expect(s.colours.length).toBe(5);
    expect(s.meta[at(300, 200)].colour).toBeLessThan(4); // brown keeps its own ink
    const off = analyze(img, P({ colors: 4, ownInks: false }), { dir: '/tmp/x', path: 'x.png' });
    expect(off.colours[off.meta[off.seg.map[159 * 400 + 130]].colour].a).toBeLessThan(35);
    expect(s.estRmse).toBeLessThan(off.estRmse);
  });

  it('cutToCrop: a piece that ends in the margin stays whole, one that runs to the margin edge is cut, one only in the margin goes', () => {
    const w = 10, h = 6, map = new Int32Array(w * h).fill(0);
    const set = (x0: number, x1: number, y: number, r: number) => { for (let x = x0; x <= x1; x++) map[y * w + x] = r; };
    set(1, 6, 1, 1); // crosses the crop's left edge (x 3), ends at x 1: whole
    set(0, 9, 3, 2); // runs from edge to edge: cut to x 3..6
    set(0, 1, 5, 3); // only in the margin: gone
    cutToCrop(map, w, h, [3, 0, 4, 6]); // crop x 3..6, full height
    const row = (y: number) => Array.from(map.subarray(y * w, y * w + w));
    expect(row(1)).toEqual([-1, 1, 1, 1, 1, 1, 1, -1, -1, -1]);
    expect(row(3)).toEqual([-1, -1, -1, 2, 2, 2, 2, -1, -1, -1]);
    expect(row(5)).toEqual([-1, -1, -1, 0, 0, 0, 0, -1, -1, -1]);
  });
});

