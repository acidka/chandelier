// Faster free-form recreation (roadmap 0.6): edge tracks (preview {profile}), curve fit and shading (create_path).
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { encodePng, type Img } from '../../src/image.js';
import { edgeTracks } from '../../src/edges.js';
import { fitCurve, fitToD, shadeToD } from '../../src/fitcurve.js';
import { create_path } from '../../src/tools/create_path.js';
import { preview } from '../../src/tools/preview.js';

const wave = (x: number) => 100 + 30 * Math.sin(x / 50);
// a curve sampled every 10 units, with or without ±0.8 pixel noise (deterministic)
const pts = (noise = 0) => Array.from({ length: 41 }, (_, i) => [i * 10, wave(i * 10) + noise * Math.sin(i * 7.3)]);
const bez = (c: number[][], t: number) => { const u = 1 - t; return [0, 1].map((k) => u * u * u * c[0][k] + 3 * u * u * t * c[1][k] + 3 * u * t * t * c[2][k] + t * t * t * c[3][k]); };
/** largest distance from the true curve to the fitted one (dense samples) */
function miss(segs: number[][][]): number {
  let m = 0;
  for (const c of segs) for (let i = 0; i <= 50; i++) { const [x, y] = bez(c, i / 50); m = Math.max(m, Math.abs(y - wave(x))); }
  return m;
}

describe('fitCurve', () => {
  it('puts anchors on peaks and troughs with level handles, within tolerance', () => {
    const segs = fitCurve(pts(), { tolerance: 1 });
    expect(miss(segs)).toBeLessThan(1.5);
    // sin(x/50) peaks at x = 78.5 and 314, trough at 235.6 → anchors there (nearest samples 80, 310 / 320, 240)
    const inner = segs.slice(1).map((c) => c[0]);
    for (const x of [80, 240]) {
      const a = inner.find((p) => Math.abs(p[0] - x) <= 10);
      expect(a, `anchor near x=${x}`).toBeTruthy();
      const seg = segs.find((c) => c[0] === a)!;
      expect(Math.abs(seg[1][1] - seg[0][1])).toBeLessThan(1e-9); // level handle
    }
    expect(segs.length + 1).toBeLessThanOrEqual(7);
  });
  it('noise does not add anchors or bumps', () => {
    const clean = fitCurve(pts(), { tolerance: 2 }), noisy = fitCurve(pts(0.8), { tolerance: 2 });
    expect(noisy.length).toBeLessThanOrEqual(clean.length + 1);
    expect(miss(noisy)).toBeLessThan(2.5);
  });
  it('a straight line is one segment; two points work; repeats are dropped', () => {
    expect(fitCurve([[0, 0], [10, 10], [20, 20], [30, 30]])).toHaveLength(1);
    expect(fitCurve([[0, 0], [9, 3]])).toHaveLength(1);
    expect(fitCurve([[0, 0], [0, 0], [10, 0]])).toHaveLength(1);
    expect(() => fitCurve([[1, 1], [1, 1]])).toThrow(/2 different/);
  });
  it('several lists → one band joined by lines, closed', () => {
    const top = pts(), bottom = pts().map(([x, y]) => [x, y + 40]).reverse();
    const { d, anchors } = fitToD([top, bottom], true);
    expect(d).toMatch(/^M0 100 C.* L400 .* Z$/);
    expect(anchors).toBeGreaterThanOrEqual(6);
  });
});

describe('shadeToD', () => {
  it('stacked steps that add up to the opacity, the last one stopping just short of the far edge', () => {
    const edge = pts(), far = pts().map(([x, y]) => [x, y + 50]);
    const { ds, opacity } = shadeToD(edge, { to: far, opacity: 30 });
    expect(ds.length).toBe(15); // 30 % in steps of ~2 %
    expect(1 - Math.pow(1 - opacity / 100, ds.length)).toBeCloseTo(0.3, 2);
    // far side of the last step at the far edge: its lowest y ≈ the far edge's lowest (130 + 50)
    const ys = ds[ds.length - 1].match(/L[\d.]+ ([\d.]+)/g)!.map((s) => Number(s.split(' ')[1]));
    // 15/16 of the 50 gap below the edge's lowest point (130): ≈ 177
    expect(Math.max(...ys)).toBeGreaterThan(174);
    expect(Math.max(...ys)).toBeLessThan(180);
    expect(ds[0].startsWith('M0 100 C')).toBe(true); // near side = the exact fitted edge
  });
  it('a distance instead of an edge; steps given', () => {
    const { ds } = shadeToD(pts(), { to: -20, steps: 4, opacity: 10 });
    expect(ds).toHaveLength(4);
  });
});

describe('create_path {fit, shade}', () => {
  const step = (a: any) => (create_path.step!(a, {} as any) as any).args;
  it('fit becomes d (alone and in items)', () => {
    expect(step({ fit: pts() }).d).toMatch(/^M0 100 C/);
    const a = step({ items: [{ fit: pts() }, { points: [[0, 0], [1, 1]] }], tolerance: 2 });
    expect(a.items[0].d).toMatch(/^M/);
    expect(a.items[1].points).toBeTruthy();
    expect(a.tolerance).toBeUndefined();
  });
  it('shade → one multiply item per step', () => {
    const a = step({ fit: pts(), shade: { to: 40, steps: 5 }, fill: '#333', opacity: 20 });
    expect(a.items).toHaveLength(5);
    expect(a.items[0]).toMatchObject({ blend: 'multiply', stroke: 'none' });
    expect(a.fit).toBeUndefined();
  });
  it('clear errors', () => {
    expect(() => step({ fit: pts(), d: 'M0 0' })).toThrow(/give one/);
    expect(() => step({ fit: [[1, 2]] })).toThrow(/≥ 2 points/);
    expect(() => step({ points: [[0, 0], [1, 1]], shade: { to: 3 } })).toThrow(/shade needs fit/);
  });
});

/** light top, dark below a sine edge (columns) */
function edgeImage(w = 300, h = 200): Img {
  const rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dark = y > wave(x), i = (y * w + x) * 3;
    rgb[i] = dark ? 60 : 230; rgb[i + 1] = dark ? 30 : 210; rgb[i + 2] = dark ? 10 : 190;
  }
  return { w, h, rgb };
}

describe('edgeTracks', () => {
  it('one track along the edge, with tone and both colours', () => {
    const t = edgeTracks(edgeImage(), { step: 10 });
    expect(t).toHaveLength(1);
    expect(t[0].tone).toBeLessThan(-100); // darker below
    expect(t[0].above).toBe('#e6d2be');
    expect(t[0].below).toBe('#3c1e0a');
    expect(t[0].n).toBeGreaterThanOrEqual(28);
    for (const [x, y] of t[0].pts) expect(Math.abs(y - wave(x))).toBeLessThan(2);
  });
  it('rows mode finds the same edge on a turned image; frame mapping applies', () => {
    const a = edgeImage(), w = a.h, h = a.w, rgb = new Uint8Array(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) rgb[(y * w + x) * 3 + k] = a.rgb[(x * a.w + y) * 3 + k];
    const t = edgeTracks({ w, h, rgb }, { step: 10, rows: true }, 1000, 0, 2); // 2 px per unit, origin x 1000
    expect(t).toHaveLength(1);
    // interior points (the first column sits at the image border, where the edge is blurred against it)
    for (const [x, y] of t[0].pts.slice(1, -1)) expect(Math.abs((x - 1000) * 2 - wave(y * 2))).toBeLessThan(2);
  });
  it('preview {image, profile} returns the tracks', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'prof-')), f = join(dir, 'edge.png');
    writeFileSync(f, encodePng(edgeImage()));
    const r: any = await preview.run!({ image: f, profile: { step: 10 } }, { tmp: dir, settings: { units: 'pt' } } as any);
    expect(r.isError).toBeFalsy();
    const j = JSON.parse(r.content[1].text);
    expect(j.tracks).toHaveLength(1);
    expect(j.tracks[0].pts.length).toBeGreaterThan(20);
    const bad: any = await preview.run!({ profile: true }, {} as any);
    expect(bad.isError).toBe(true);
  });
});
