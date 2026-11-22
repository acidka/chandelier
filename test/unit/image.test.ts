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

describe('pure-JS image pipeline (W3: no sips)', async () => {
  const { decodeImage, decodeJpeg, crop, resize, fitLongest, encodePng, decodePng, sniff } = await import('../../src/image.js');
  const jpegjs = (await import('jpeg-js')).default;
  // 4×2 image: left half red, right half blue
  const w = 4, h = 2, rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { const left = i % w < 2; rgba.set(left ? [255, 0, 0, 255] : [0, 0, 255, 255], i * 4); }
  const jpg = jpegjs.encode({ data: rgba, width: w, height: h }, 100).data;

  it('decodes JPEG and sniffs formats', () => {
    expect(sniff(jpg)).toBe('jpeg');
    const img = decodeJpeg(jpg);
    expect([img.w, img.h]).toEqual([4, 2]);
    expect(img.rgb[0]).toBeGreaterThan(200); expect(img.rgb[2]).toBeLessThan(60);          // red-ish
    expect(img.rgb[3 * 3 + 2]).toBeGreaterThan(200);                                       // blue-ish
    expect(() => decodeImage(Buffer.from('GIF89a'))).toThrow(/not a PNG or JPEG/);
  });

  it('crops and resizes by area averaging', () => {
    const img = { w, h, rgb: new Uint8Array(w * h * 3) };
    for (let i = 0; i < w * h; i++) img.rgb.set(i % w < 2 ? [255, 0, 0] : [0, 0, 255], i * 3);
    const c = crop(img, 2, 0, 2, 2);
    expect([c.w, c.h, c.rgb[0], c.rgb[2]]).toEqual([2, 2, 0, 255]);
    const r = resize(img, 2, 1);
    expect(Array.from(r.rgb)).toEqual([255, 0, 0, 0, 0, 255]);
    const half = resize(img, 1, 1);                                                        // mean of red and blue
    expect(Array.from(half.rgb)).toEqual([128, 0, 128]);
    expect(fitLongest(img, 2).w).toBe(2);
    expect(fitLongest(img, 100)).toBe(img);                                                // never upscales
  });

  it('keeps alpha through resize and PNG round trip', () => {
    const img = { w: 2, h: 1, rgb: new Uint8Array([255, 0, 0, 255, 255, 255]), a: new Uint8Array([255, 0]) };
    const png = decodePng(encodePng(resize(img, 2, 1)));
    expect(png.a && Array.from(png.a)).toEqual([255, 0]);
    expect(Array.from(png.rgb.subarray(0, 3))).toEqual([255, 0, 0]);
  });
});
