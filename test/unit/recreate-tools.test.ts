// Faster free-form recreation (roadmap 0.6): edge tracks (preview {profile}), curve fit and shading (create_path).
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { encodePng, type Img } from '../../src/image.js';
import { edgeTracks } from '../../src/edges.js';
import { fitCurve, fitToD, shadeToD, projective, segsToD, bez as bezAt, type Seg } from '../../src/fitcurve.js';
import { put, label } from '../../src/imageview.js';
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

describe('fit: fixed end tangents, segsToD (scene tool groundwork)', () => {
  // quarter circle r 100 around the origin, travelling from (100, 0) to (0, 100): true tangents (0, 1) and (-1, 0)
  const arc = Array.from({ length: 31 }, (_, i) => { const a = (i / 30) * Math.PI / 2; return [100 * Math.cos(a), 100 * Math.sin(a)]; });
  const cross = (a: number[], b: number[]) => a[0] * b[1] - a[1] * b[0];
  const dir = (a: number[], b: number[]) => [b[0] - a[0], b[1] - a[1]];
  it('t0 / t1 set the first and last handle directions; the ends stay exact', () => {
    const segs = fitCurve(arc, { tolerance: 0.5, t0: [0, 2], t1: [-3, 0] });
    const first = segs[0], last = segs[segs.length - 1];
    expect(first[0]).toEqual(arc[0]);
    expect(last[3][0]).toBeCloseTo(arc[30][0], 9); expect(last[3][1]).toBeCloseTo(arc[30][1], 9);
    const h0 = dir(first[0], first[1]), h1 = dir(last[2], last[3]);
    expect(Math.abs(cross(h0, [0, 1]))).toBeLessThan(1e-9); expect(h0[1]).toBeGreaterThan(0);
    expect(Math.abs(cross(h1, [-1, 0]))).toBeLessThan(1e-9); expect(h1[0]).toBeLessThan(0);
    // still on the arc
    for (const c of segs) for (let i = 0; i <= 20; i++) expect(Math.abs(Math.hypot(...bezAt(c, i / 20)) - 100)).toBeLessThan(1.5);
  });
  it('a tangent that disagrees with the points is still obeyed (a shared junction wins)', () => {
    const segs = fitCurve(arc, { tolerance: 0.5, t0: [1, 1] });
    const h0 = dir(segs[0][0], segs[0][1]);
    expect(Math.abs(cross(h0, [1, 1]))).toBeLessThan(1e-9); expect(h0[0]).toBeGreaterThan(0);
  });
  it('without t0 / t1 nothing changes', () => {
    expect(fitCurve(pts(), { tolerance: 1 })).toEqual(fitCurve(pts(), { tolerance: 1, t0: undefined, t1: undefined }));
  });
  it('two points honour the tangents and extend', () => {
    const [c] = fitCurve([[0, 0], [30, 0]], { t0: [0, 1], t1: [0, -1] });
    expect(c[1]).toEqual([0, 10]); expect(c[2]).toEqual([30, 10]);
    expect(fitCurve([[0, 0], [30, 0]], { extend: 5 })).toHaveLength(3);
  });
  it('segsToD: one subpath per loop', () => {
    const sq = (x: number): Seg[] => [[[x, 0], [x + 3, 0], [x + 7, 0], [x + 10, 0]], [[x + 10, 0], [x + 10, 3], [x + 10, 7], [x + 10, 10]]];
    expect(segsToD([sq(0), sq(20)])).toBe('M0 0 C3 0 7 0 10 0 C10 3 10 7 10 10 Z M20 0 C23 0 27 0 30 0 C30 3 30 7 30 10 Z');
    expect(segsToD([sq(0)], false)).not.toContain('Z');
    expect(segsToD([[], sq(0)])).toMatch(/^M0 0/);
  });
  it('put and label draw into an image, label in a given colour', () => {
    const img: Img = { w: 40, h: 20, rgb: new Uint8Array(40 * 20 * 3) };
    put(img, 1, 1, [10, 20, 30]); put(img, -1, 99, [1, 1, 1]);
    expect([...img.rgb.slice((1 * 40 + 1) * 3, (1 * 40 + 1) * 3 + 3)]).toEqual([10, 20, 30]);
    label(img, '12', 0, 0, 2, [0, 0, 255]);
    let blue = 0;
    for (let i = 0; i < img.rgb.length; i += 3) if (img.rgb[i] === 0 && img.rgb[i + 1] === 0 && img.rgb[i + 2] === 255) blue++;
    expect(blue).toBeGreaterThan(10);
  });
});

describe('fit: gaps, extension, map', () => {
  const W = (x: number) => 100 + 40 * Math.sin(x / 120);
  it('a long gap: no extreme anchor at its edge, the curve stays near the truth inside it', () => {
    const p: number[][] = [];
    for (let x = 0; x <= 1000; x += 17) if (x < 300 || x > 650) p.push([x, Math.round(W(x) + Math.sin(x * 7.3) * 0.8)]);
    const segs = fitCurve(p, { tolerance: 2 });
    let m = 0;
    for (const c of segs) for (let i = 0; i <= 40; i++) { const [x, y] = bez(c, i / 40); m = Math.max(m, Math.abs(y - W(x))); }
    expect(m).toBeLessThan(4); // was 22.6 px before gaps were handled
  });
  it('extend runs on straight along the end directions', () => {
    const segs = fitCurve([[0, 0], [10, 0], [20, 0], [30, 0]], { extend: [5, 8] });
    expect(segs[0][0]).toEqual([-5, 0]);
    expect(segs[segs.length - 1][3]).toEqual([38, 0]);
  });
  it('extend: only the outer ends of an edge made of sub-lists; both edges of a band', () => {
    const one = fitToD([[[0, 0], [10, 1], [20, 3], [30, 4]], [[30, 4], [40, 4], [50, 3], [60, 1]]], false, { extend: 5 }).d;
    expect(one.match(/C/g)!.length).toBe(4); // 2 fitted + 2 extensions, none at the joint (v6: spikes there)
    const band = fitToD([[[0, 0], [30, -5], [60, 0]], [[60, 20], [30, 15], [0, 20]]], true, { extend: 5 }).d;
    expect(band.match(/C/g)!.length).toBe(6);
  });
  it('projective map sends the four corners where asked', () => {
    const m = projective([[10, 0], [90, 0], [100, 120], [0, 120]], [[0, 0], [100, 0], [100, 130], [0, 130]]);
    for (const [a, b] of [[[10, 0], [0, 0]], [[100, 120], [100, 130]], [[50, 60]]] as number[][][]) {
      const r = m(a);
      if (b) { expect(r[0]).toBeCloseTo(b[0], 6); expect(r[1]).toBeCloseTo(b[1], 6); }
    }
    expect(() => projective([[0, 0], [1, 1], [2, 2], [3, 3]], [[0, 0], [1, 0], [1, 1], [0, 1]])).toThrow(/quadrilateral/);
  });
});

describe('shadeToD', () => {
  it('stacked steps that add up to the opacity, the last one stopping just short of the far edge', () => {
    const edge = pts(), far = pts().map(([x, y]) => [x, y + 50]);
    const { ds, opacity } = shadeToD([edge], { to: far, opacity: 30 });
    expect(ds.length).toBe(20); // 30 % in steps of ~1.5 %
    expect(1 - Math.pow(1 - opacity / 100, ds.length)).toBeCloseTo(0.3, 2);
    // far side of the last step at the far edge: its lowest y ≈ the far edge's lowest (130 + 50)
    const ys = ds[ds.length - 1].match(/L[\d.]+ ([\d.]+)/g)!.map((s) => Number(s.split(' ')[1]));
    // 20/21 of the 50 gap below the edge's lowest point (130): ≈ 178
    expect(Math.max(...ys)).toBeGreaterThan(174);
    expect(Math.max(...ys)).toBeLessThan(180);
    expect(ds[0].startsWith('M0 100 C')).toBe(true); // near side = the exact fitted edge
  });
  it('several edge lists, taper and lift', () => {
    const e = pts();
    const { ds } = shadeToD([e.slice(0, 21), e.slice(20)], { to: 30, steps: 6, opacity: 12, taper: 60, lift: 2 });
    expect(ds).toHaveLength(6);
    // tapered: the deepest step is the shortest
    const xs = (d: string) => d.match(/[ML]([-\d.]+) /g)!.map((t) => Number(t.slice(1)));
    expect(Math.min(...xs(ds[5]))).toBeGreaterThan(Math.min(...xs(ds[0])));
  });
  it('a distance instead of an edge; steps given', () => {
    const { ds } = shadeToD([pts()], { to: -20, steps: 4, opacity: 10 });
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
  it('map, extend and clip_to pass through; scale per axis is the runtime\'s', () => {
    const a = step({ fit: pts(), extend: 20, map: { from: [[0, 0], [1, 0], [1, 1], [0, 1]], to: [[0, 0], [2, 0], [2, 2], [0, 2]] }, clip_to: '@0', scale: [1, 2] });
    // mapped ×2 (start [0, 100] → [0, 200]), then extended 20 back along the start direction
    const [x0, y0] = a.d.match(/^M([-\d.]+) ([-\d.]+)/).slice(1).map(Number);
    expect(Math.hypot(x0, y0 - 200)).toBeCloseTo(20, 1);
    expect(x0).toBeLessThan(0);
    expect(a).toMatchObject({ clip_to: '@0', scale: [1, 2] });
    expect(a.map).toBeUndefined();
  });
  it('clear errors', () => {
    expect(() => step({ fit: pts(), d: 'M0 0' })).toThrow(/give one/);
    expect(() => step({ fit: [[1, 2]] })).toThrow(/≥ 2 points/);
    expect(() => step({ points: [[0, 0], [1, 1]], shade: { to: 3 } })).toThrow(/shade needs fit/);
    expect(() => step({ points: [[0, 0], [1, 1]], extend: 3 })).toThrow(/extend needs fit/);
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
