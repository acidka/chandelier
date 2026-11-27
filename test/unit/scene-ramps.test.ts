import { describe, it, expect } from 'vitest';
import { analyze } from '../../src/scene/analyze.js';
import { applyEdits } from '../../src/scene/edits.js';
import { summary } from '../../src/scene/summary.js';
import { buildSteps } from '../../src/scene/build.js';
import { planeStats, fitPlane } from '../../src/scene/ramps.js';
import { rgbToLab } from '../../src/scene/color.js';
import { paint, rect, type RGB } from './scene-fixtures.js';
import type { Img } from '../../src/image.js';

const P = { image: 'x', colors: 16, minDe: 6, detail: 'normal' as const, maxPx: 1000 };
/** a horizontal gradient square (dark left → light right) on white, with a flat blue box */
function gradient(noise: number): Img {
  const w = 300, h = 200, rgb = new Uint8Array(w * h * 3).fill(255);
  for (let y = 20; y < 180; y++) for (let x = 20; x < 180; x++) { const f = (x - 20) / 160; rgb.set([Math.round(120 + 110 * f), Math.round(60 + 90 * f), Math.round(20 + 60 * f)], (y * w + x) * 3); }
  const base = { w, h, rgb };
  const box = paint(w, h, [rect(210, 60, 60, 80, [40, 90, 170])], { ss: 1 });
  for (let y = 60; y < 140; y++) for (let x = 210; x < 270; x++) base.rgb.set(box.rgb.subarray((y * w + x) * 3, (y * w + x) * 3 + 3), (y * w + x) * 3);
  if (!noise) return base;
  let seed = 3;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) - 0.5;
  for (let i = 0; i < base.rgb.length; i++) base.rgb[i] = Math.max(0, Math.min(255, Math.round(base.rgb[i] + rnd() * noise * 3.4)));
  return base;
}

describe('ramps', () => {
  it('plane fit: exact on a gradient, a step leaves a residual', () => {
    const lab = rgbToLab(gradient(0)), w = 300, h = 200, map = new Int32Array(w * h).fill(-1);
    for (let y = 20; y < 180; y++) for (let x = 20; x < 180; x++) map[y * w + x] = 0;
    expect(fitPlane(planeStats(map, w, h, lab, 1)[0]).rms).toBeLessThan(1.5);
    for (let y = 60; y < 140; y++) for (let x = 210; x < 270; x++) map[y * w + x] = 0; // gradient ∪ blue box
    expect(fitPlane(planeStats(map, w, h, lab, 1)[0]).rms).toBeGreaterThan(5);
  });
  it('artwork: the bands are offered as one ramp; "ramp" makes one region with a gradient that renders close', () => {
    const s = analyze(gradient(0), P, { dir: '/tmp', path: 'x' });
    expect(s.photo).toBe(false);
    const g = s.rampGroups[0];
    expect(g.ids.length).toBeGreaterThan(2);
    expect(summary(s)).toMatch(/hints: .*ramp r\d+[- ]r\d+/);
    // every band in the hint (F22: only the first 6 were listed), as ranges
    const listed = summary(s).match(/ramp ([r0-9 -]+?) \(/)![1].split(' ').flatMap((x) => { const m = x.match(/^r(\d+)(?:-r(\d+))?$/)!; const a = +m[1], b = m[2] ? +m[2] : a; return Array.from({ length: b - a + 1 }, (_, k) => a + k); });
    expect(new Set(listed)).toEqual(new Set(g.ids));
    const before = s.estRmse;
    applyEdits(s, ['ramp ' + g.ids.map((i) => 'r' + i).join(' ')]);
    const rp = s.ramps[g.ids[0]]!;
    expect(Math.abs(rp.ux)).toBeGreaterThan(0.99); // horizontal
    expect((rp.c1[0] - rp.c0[0]) * rp.ux).toBeGreaterThan(20); // lighter along +x
    expect(s.estRmse).toBeLessThan(before);
    expect(summary(s)).toMatch(/ rect\+ramp /);
    const b = buildSteps(s, { rect: [0, 0, 300, 200] }).batches[0];
    const sw = b.find((x) => x.tool === 'swatches' && x.args.kind === 'gradient')!;
    expect(sw.args).toMatchObject({ type: 'linear', name: `Scene r${g.ids[0]} ramp` });
    const stops = sw.args.stops as { at: number }[];
    expect(stops[0].at).toBeGreaterThan(0); expect(stops[1].at).toBeLessThan(100);
    const item = b.filter((x) => x.tool === 'create_shape').flatMap((x) => x.args.items as any[]).find((i) => i.name === `Scene r${g.ids[0]}`);
    expect(item.fill).toMatch(new RegExp(`^gradient:Scene r${g.ids[0]} ramp@(0|-?180)$`));
    applyEdits(s, [`r${g.ids[0]} flat`]);
    expect(s.ramps[g.ids[0]]).toBeNull();
  });
  it('photo: lighting bands are merged into one flat region, with a hint to keep the gradient', () => {
    const s = analyze(gradient(4), P, { dir: '/tmp', path: 'x' });
    expect(s.photo).toBe(true);
    expect(JSON.parse(summary(s).split('\n')[0]).photo).toBe(true);
    const live = s.seg.regions.filter((r) => r.area > 0);
    expect(live.length).toBeLessThanOrEqual(4); // white, the merged ramp, the blue box (+ maybe a rim)
    expect(summary(s)).toMatch(/lighting flattened \(ΔL \d+; "ramp r\d+" keeps it as a gradient\)/);
  });
});
