import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodePng, encodePng, compare, type Img } from '../../src/image.js';

const solid = (w: number, h: number, v: number): Img => ({ w, h, rgb: new Uint8Array(w * h * 3).fill(v) });

describe('PNG codec', () => {
  it('round-trips RGB', () => {
    const img: Img = { w: 3, h: 2, rgb: Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 10, 20, 30, 40, 50, 60, 70, 80, 90]) };
    const back = decodePng(encodePng(img));
    expect([back.w, back.h]).toEqual([3, 2]);
    expect(Array.from(back.rgb)).toEqual(Array.from(img.rgb));
  });
  it('decodes a PNG written by macOS (filtered rows)', () => {
    const img = decodePng(readFileSync('test/unit/fixtures/sample.png'));
    expect([img.w, img.h]).toEqual([32, 24]);
    expect(Array.from(img.rgb.subarray(0, 3))).toEqual([255, 255, 255]); // white page corner
    const again = decodePng(encodePng(img));
    expect(Array.from(again.rgb)).toEqual(Array.from(img.rgb));
  });
  it('rejects what it cannot read', () => {
    expect(() => decodePng(Buffer.from('nope'))).toThrow(/not a PNG/);
  });
});

describe('compare', () => {
  it('identical images: rmse 0, composite three panels wide', () => {
    const a = solid(40, 20, 255);
    a.rgb.fill(0, (5 * 40 + 5) * 3, (5 * 40 + 15) * 3); // a dark line in row 5
    const c = compare(a, a);
    expect(c.rmse).toBe(0);
    expect(c.composite.w).toBe(40 * 3 + 2 * 4);
    expect(c.ink!.reference).toEqual(c.ink!.preview);
  });
  it('reports the most different region and the ink offset', () => {
    const ref = solid(40, 40, 255), prev = solid(40, 40, 255);
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) { ref.rgb.fill(0, ((y + 4) * 40 + x + 4) * 3, ((y + 4) * 40 + x + 4) * 3 + 3); prev.rgb.fill(0, ((y + 24) * 40 + x + 24) * 3, ((y + 24) * 40 + x + 24) * 3 + 3); }
    const c = compare(ref, prev);
    expect(c.rmse).toBeGreaterThan(0);
    expect(c.regions[0].diff).toBeGreaterThan(0.2);
    expect(c.ink!.reference.slice(0, 2)).toEqual([0.1, 0.1]);
    expect(c.ink!.preview.slice(0, 2)).toEqual([0.6, 0.6]);
    expect(c.ink!.preview[2]).toBe(0.25); // same size, shifted
  });
});
