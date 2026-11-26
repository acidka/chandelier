import { describe, it, expect } from 'vitest';
import { rgbToLab } from '../../src/scene/color.js';
import { bilateral } from '../../src/scene/smooth.js';
import { quantize } from '../../src/scene/quantize.js';
import { segment, modeFilter, components } from '../../src/scene/regions.js';
import { paint, rect, ellipse, ring, below, type RGB } from './scene-fixtures.js';
import type { Img } from '../../src/image.js';

const BG: RGB = [240, 230, 210], ORANGE: RGB = [217, 130, 43], BLUE: RGB = [40, 90, 170], DARK: RGB = [30, 30, 30];
function run(img: Img, minDe = 6) {
  const lab = bilateral(rgbToLab(img));
  const q = quantize(lab, { minDe });
  return segment(lab, q.labels, { minDe });
}

describe('regions', () => {
  it('two blobs of one ink → 2 regions, one group; anti-aliased rims leave no slivers', () => {
    const s = run(paint(200, 120, [ellipse(50, 60, 35, 30, ORANGE), ellipse(150, 60, 30, 40, ORANGE)], { bg: BG, noise: 3 }));
    expect(s.regions).toHaveLength(3);
    expect(s.regions[1].group).toBe(s.regions[2].group);
    expect(s.regions[0].nbrs.size).toBe(2);
  });
  it('touching inks with soft edges: exactly the true shapes, no rim regions between them', () => {
    // orange over blue over dark, each edge anti-aliased: the in-between colours must not become regions
    const img = paint(240, 160, [rect(0, 0, 240, 160, DARK), below((x) => 40 + 15 * Math.sin(x / 30), BLUE), below((x) => 90 + 20 * Math.sin(x / 40 + 1), ORANGE)], { noise: 2, jpeg: 85 });
    const s = run(img);
    expect(s.regions).toHaveLength(3);
    expect(s.regions.every((r) => r.homog > 0.9)).toBe(true);
  });
  it('a real thin line (its own ink) stays', () => {
    const s = run(paint(200, 100, [rect(20, 49, 160, 1.6, DARK)], { bg: BG, noise: 1 }));
    expect(s.regions).toHaveLength(2);
    expect(s.regions[1].area).toBeGreaterThan(140);
  });
  it('salt noise is voted away; a ring encloses a region; stats', () => {
    const img = paint(160, 160, [ring(80, 80, 30, 50, BLUE)], { bg: BG, ss: 4 });
    for (let k = 0; k < 40; k++) img.rgb.set(DARK, ((7 + ((k * 37) % 140)) * 160 + 5 + ((k * 53) % 150)) * 3);
    const s = run(img);
    expect(s.regions).toHaveLength(3); // outside, ring, inside
    const ringR = s.regions.find((r) => Math.abs(r.L - rgbToLab({ w: 1, h: 1, rgb: new Uint8Array(BLUE) }).L[0]) < 5)!;
    expect(ringR.nbrs.size).toBe(2);
    const inside = s.regions.find((r) => r !== ringR && !r.touchesBorder)!;
    expect(Math.hypot(inside.pole[0] - 80, inside.pole[1] - 80)).toBeLessThan(3);
    expect(inside.depth).toBeGreaterThan(25);
    expect(inside.area).toBeCloseTo(Math.PI * 30 * 30, -2);
  });
  it('small regions join the closest neighbour; similar neighbours merge', () => {
    // a 3×3 speck of light orange in blue, beside orange: joins blue (its only neighbour); two halves ΔE ~2 → one
    const img = paint(120, 60, [rect(0, 0, 60, 60, BLUE), rect(60, 0, 60, 60, [228, 225, 206]), rect(20, 20, 3, 3, [250, 170, 80])], { bg: BG, ss: 1 });
    const s = run(img);
    expect(s.regions).toHaveLength(2);
  });
  it('modeFilter keeps corners, removes specks; components are 4-connected', () => {
    const w = 6, h = 6, L = new Uint8Array(w * h);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) L[y * w + x] = 1; // 3×3 square in a corner
    L[4 * w + 4] = 2; // speck
    const m = modeFilter(L, w, h, 1);
    expect(m[0]).toBe(1); expect(m[2 * w + 2]).toBe(1); expect(m[4 * w + 4]).toBe(0);
    const d = new Uint8Array([1, 0, 0, 1]); // diagonal pair: two components
    expect(components(d, 2, 2).count).toBe(4);
  });
  it('ids by area, largest first; skipped pixels stay out', () => {
    const s = run(paint(100, 100, [rect(10, 10, 20, 20, ORANGE), rect(50, 50, 40, 40, BLUE)], { bg: BG }));
    expect(s.regions.map((r) => r.area)).toEqual([...s.regions.map((r) => r.area)].sort((a, b) => b - a));
  });
});
