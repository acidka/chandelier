import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { decodePng, encodePng, compare, resize, crop, cropPad, type Img } from '../../src/image.js';

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

describe('preview {image} view (imageview)', async () => {
  const { view, niceStep, rgbToCmyk, contentBox, sampleAt } = await import('../../src/imageview.js');
  const { imagePpi } = await import('../../src/imagefile.js');
  // grey 100×50 page with a black 20×10 block at (30, 20)
  const page = (): Img => {
    const img = solid(100, 50, 128);
    for (let y = 20; y < 30; y++) img.rgb.fill(0, (y * 100 + 30) * 3, (y * 100 + 50) * 3);
    return img;
  };
  it('round grid steps', () => {
    expect([niceStep(1000), niceStep(1220), niceStep(37), niceStep(3)]).toEqual([100, 100, 5, 0.2]);
  });
  it('naive CMYK', () => {
    expect(rgbToCmyk([255, 255, 255])).toEqual([0, 0, 0, 0]);
    expect(rgbToCmyk([0, 0, 0])).toEqual([0, 0, 0, 100]);
    expect(rgbToCmyk([255, 0, 0])).toEqual([0, 100, 100, 0]);
  });
  it('content box against the border colour, in frame units', () => {
    expect(contentBox({ img: page(), ox: 0, oy: 0, k: 1 })).toEqual({ box: [30, 20, 20, 10], background: '#808080' });
    // a frame cut out at (10, 5) and rendered at 2 px per unit
    const box = contentBox({ img: resize(page(), 200, 100), ox: 10, oy: 5, k: 2 }).box!; // edges anti-aliased by the resize
    [40, 25, 20, 10].forEach((v, i) => expect(Math.abs(box[i] - v)).toBeLessThanOrEqual(0.5));
  });
  it('samples a point and a rect', () => {
    const f = { img: page(), ox: 0, oy: 0, k: 1 };
    expect(sampleAt(f, [35, 25]).hex).toBe('#000000');
    expect(sampleAt({ ...f, ox: 50 }, [10, 10])).toEqual({ at: [10, 10], outside: true });
    expect(sampleAt(f, [30, 20, 40, 10]).rgb).toEqual([64, 64, 64]); // half block, half page
  });
  it('samples the whole image even outside the shown region (bugs.md #15)', () => {
    const whole = { img: page(), ox: 0, oy: 0, k: 1 };
    const region = { img: crop(page(), 60, 0, 40, 50), ox: 60, oy: 0, k: 1 }; // no block in it
    const v = view(region, { sample: [[35, 25], [80, 10]], sampleFrame: whole });
    expect(v.samples!.map((s) => s.hex)).toEqual(['#000000', '#808080']);
    expect(view(region, { sample: [[35, 25]] }).samples![0].outside).toBe(true); // without the whole image: as before
  });
  it('shrinks big images and zooms small regions (≤ 8×, sharp)', () => {
    const big = view({ img: solid(4000, 2000, 255), ox: 0, oy: 0, k: 1 }, { max_px: 1000 });
    expect(big.shown_px).toEqual([1000, 500]);
    const small = view({ img: page(), ox: 0, oy: 0, k: 1 }, { max_px: 1024 });
    expect(small.zoom).toBe(8);
    expect(small.shown_px).toEqual([800, 400]);
    expect(Array.from(small.img.rgb.subarray(((20 * 8) * 800 + 30 * 8) * 3, ((20 * 8) * 800 + 30 * 8) * 3 + 3))).toEqual([0, 0, 0]);
  });
  it('draws the grid and marks samples', () => {
    const v = view({ img: solid(100, 100, 255), ox: 0, oy: 0, k: 1 }, { grid: true, sample: [[50, 50]], max_px: 100 });
    expect(v.grid).toBe(10);
    expect(v.samples![0].hex).toBe('#ffffff'); // sampled before drawing
    const px = (x: number, y: number) => Array.from(v.img.rgb.subarray((y * 100 + x) * 3, (y * 100 + x) * 3 + 3));
    expect(px(10, 60)).not.toEqual([255, 255, 255]); // a grid line
    expect(px(75, 85)).toEqual([255, 255, 255]);
  });
  it('reads the stated resolution', () => {
    expect(imagePpi('test/unit/fixtures/sample.png')).toBe(imagePpi('test/unit/fixtures/sample.png')); // no throw
    const png = encodePng(solid(2, 2, 255));
    const phys = Buffer.alloc(9); phys.writeUInt32BE(11811, 0); phys.writeUInt32BE(11811, 4); phys[8] = 1; // 300 ppi
    const len = Buffer.alloc(4); len.writeUInt32BE(9);
    const withPhys = Buffer.concat([png.subarray(0, 33), len, Buffer.from('pHYs'), phys, Buffer.alloc(4), png.subarray(33)]);
    const f = join(tmpdir(), `ppi-${process.pid}.png`); writeFileSync(f, withPhys);
    expect(imagePpi(f)).toBe(300);
  });
});

describe('fixes 2026-11-25 (docs/bugs.md)', async () => {
  const { view } = await import('../../src/imageview.js');
  it('#3 zooms by any factor up to 8× (not only whole steps)', () => {
    const v = view({ img: solid(400, 200, 128), ox: 0, oy: 0, k: 1 }, { max_px: 1000 });
    expect(v.shown_px).toEqual([1000, 500]);
    expect(v.zoom).toBe(2.5);
  });
  it('#2 cropPad cuts a part that may lie outside, white there', () => {
    const img = solid(10, 10, 0);
    const c = cropPad(img, -2, 8, 4, 4);
    expect([c.w, c.h]).toEqual([4, 4]);
    expect(Array.from(c.rgb.subarray(0, 3))).toEqual([255, 255, 255]);             // (-2, 8): outside
    expect(Array.from(c.rgb.subarray((0 * 4 + 2) * 3, (0 * 4 + 2) * 3 + 3))).toEqual([0, 0, 0]); // (0, 8): inside
    expect(Array.from(c.rgb.subarray((3 * 4 + 3) * 3, (3 * 4 + 3) * 3 + 3))).toEqual([255, 255, 255]); // (1, 11): below
  });
});
