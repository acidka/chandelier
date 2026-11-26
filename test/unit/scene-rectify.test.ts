import { describe, it, expect } from 'vitest';
import { rgbLab, labToRgb, rgbToLab, de76, labHex, labSpec } from '../../src/scene/color.js';
import { rectify } from '../../src/scene/rectify.js';
import { projective } from '../../src/fitcurve.js';
import { px } from './scene-fixtures.js';
import type { Img } from '../../src/image.js';

describe('scene colour', () => {
  it('sRGB → Lab reference values and the round trip', () => {
    const w = rgbLab(255, 255, 255), k = rgbLab(0, 0, 0), r = rgbLab(255, 0, 0);
    expect(w[0]).toBeCloseTo(100, 1); expect(Math.abs(w[1]) + Math.abs(w[2])).toBeLessThan(0.05);
    expect(k[0]).toBeCloseTo(0, 5);
    expect(r[0]).toBeCloseTo(53.24, 1); expect(r[1]).toBeCloseTo(80.09, 1); expect(r[2]).toBeCloseTo(67.2, 1);
    for (const c of [[12, 200, 77], [217, 130, 43], [128, 128, 128], [1, 2, 3]]) expect(labToRgb(...rgbLab(c[0], c[1], c[2]))).toEqual(c);
  });
  it('planes, ΔE, formats', () => {
    const img: Img = { w: 2, h: 1, rgb: new Uint8Array([255, 0, 0, 0, 0, 255]) };
    const lab = rgbToLab(img);
    expect(lab.L[0]).toBeCloseTo(53.24, 1); expect(lab.B[1]).toBeLessThan(-100);
    expect(de76(50, 0, 0, 53, 4, 0)).toBe(5);
    expect(labHex(...rgbLab(217, 130, 43))).toBe('#d9822b');
    expect(labSpec(53.2408, 80.0925, -0.04)).toBe('lab(53.2,80.1,0)');
  });
});

// a photographed face: four coloured quadrants and a black mid-line, seen in perspective
const QUAD = [[50, 40], [330, 60], [350, 260], [30, 240]];
function photo(): Img {
  const w = 400, h = 300, rgb = new Uint8Array(w * h * 3).fill(255), toFace = projective(QUAD, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [u, v] = toFace([x + 0.5, y + 0.5]);
    if (u < 0 || u > 1 || v < 0 || v > 1) continue;
    const c = Math.abs(v - 0.5) < 0.012 ? [0, 0, 0] : u < 0.5 ? (v < 0.5 ? [220, 30, 30] : [230, 210, 20]) : (v < 0.5 ? [30, 180, 40] : [30, 40, 200]);
    rgb.set(c, (y * w + x) * 3);
  }
  return { w, h, rgb };
}

describe('rectify', () => {
  it('projective map: corners land at the corners, quadrants in place, the mid-line stays one straight row', () => {
    const { img, toSource } = rectify(photo(), { map: QUAD, size: [1, 1], maxPx: 200 });
    expect([img.w, img.h]).toEqual([200, 200]);
    const tl = toSource(0, 0), br = toSource(200, 200);
    expect(Math.hypot(tl[0] - 50, tl[1] - 40)).toBeLessThan(1); expect(Math.hypot(br[0] - 350, br[1] - 260)).toBeLessThan(1);
    expect(px(img, 50, 50)[0]).toBeGreaterThan(180); expect(px(img, 150, 50)[1]).toBeGreaterThan(150);
    expect(px(img, 150, 150)[2]).toBeGreaterThan(160); expect(px(img, 50, 150)[1]).toBeGreaterThan(180);
    for (let x = 10; x < 190; x += 15) {
      let dark = 0;
      for (let y = 0; y < 200; y++) if (px(img, x, y)[0] + px(img, x, y)[1] + px(img, x, y)[2] < 120) dark = dark || y;
      expect(Math.abs(dark - 98)).toBeLessThanOrEqual(2);
    }
  });
  it('size from the face when not given; never larger than the face or maxPx', () => {
    const a = rectify(photo(), { map: QUAD, maxPx: 1000 });
    expect(Math.max(a.img.w, a.img.h)).toBeLessThanOrEqual(301);
    expect(a.img.w / a.img.h).toBeCloseTo(((280.7 + 320) / 2) / ((200 + 200.1) / 2), 1);
    expect(Math.max(rectify(photo(), { map: QUAD, maxPx: 120 }).img.w, 0)).toBe(120);
  });
  it('bilinear: rows run between the interpolated sides', () => {
    const trap = [[100, 50], [300, 50], [380, 250], [20, 250]];
    const { img, toSource } = rectify(photo(), { map: trap, bilinear: true, size: [2, 1], maxPx: 200 });
    expect([img.w, img.h]).toEqual([200, 100]);
    expect(toSource(0, 50)).toEqual([60, 150]); expect(toSource(200, 50)).toEqual([340, 150]);
    expect(toSource(100, 0)).toEqual([200, 50]);
  });
  it('crop, maxPx and size; toSource maps back', () => {
    const r = rectify(photo(), { crop: [100, 100, 200, 100], maxPx: 100 });
    expect([r.img.w, r.img.h]).toEqual([100, 50]);
    expect(r.toSource(50, 25)).toEqual([200, 150]);
    const s = rectify(photo(), { crop: [100, 100, 200, 100], size: [1, 1], maxPx: 80 });
    expect([s.img.w, s.img.h]).toEqual([80, 80]);
    expect(rectify(photo(), { maxPx: 2000 }).img.w).toBe(400);
  });
  it('bad map', () => {
    expect(() => rectify(photo(), { map: [[0, 0], [1, 0], [2, 0], [0, 1]], maxPx: 100 })).toThrow(/quadrilateral/);
  });
});
