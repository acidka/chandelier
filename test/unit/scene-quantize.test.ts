import { describe, it, expect } from 'vitest';
import { rgbToLab, rgbLab, de76 } from '../../src/scene/color.js';
import { bilateral } from '../../src/scene/smooth.js';
import { quantize, nearPairs } from '../../src/scene/quantize.js';
import { paint, rect, ellipse, type RGB } from './scene-fixtures.js';

const INKS: RGB[] = [[233, 203, 161], [217, 130, 43], [42, 42, 42], [40, 90, 170], [200, 40, 60]];
const poster = (noise = 3, jpeg?: number) => paint(160, 120, [
  rect(10, 10, 60, 40, INKS[1]), ellipse(110, 40, 30, 25, INKS[2]), rect(20, 70, 120, 30, INKS[3]), ellipse(80, 85, 15, 10, INKS[4]),
], { bg: INKS[0], noise, jpeg });

const close = (q: ReturnType<typeof quantize>, c: RGB) => {
  const t = rgbLab(...c);
  let best = Infinity;
  for (let i = 0; i < q.k; i++) best = Math.min(best, de76(q.centres[i * 3], q.centres[i * 3 + 1], q.centres[i * 3 + 2], t[0], t[1], t[2]));
  return best;
};

describe('bilateral', () => {
  it('flattens noise, keeps the edge', () => {
    const img = paint(60, 20, [rect(30, 0, 30, 20, [30, 30, 30])], { noise: 6 });
    const raw = rgbToLab(img), s = bilateral(raw, { passes: 2 });
    const sd = (P: Float32Array, x0: number) => { let m = 0, v = 0, n = 0; for (let y = 2; y < 18; y++) for (let x = x0; x < x0 + 20; x++) { m += P[y * 60 + x]; n++; } m /= n; for (let y = 2; y < 18; y++) for (let x = x0; x < x0 + 20; x++) v += (P[y * 60 + x] - m) ** 2; return Math.sqrt(v / n); };
    expect(sd(s.L, 4)).toBeLessThan(sd(raw.L, 4) / 2);
    // the edge stays within one pixel: column 28 light, column 31 dark
    expect(s.L[10 * 60 + 28]).toBeGreaterThan(80); expect(s.L[10 * 60 + 31]).toBeLessThan(30);
    expect(bilateral(raw, { passes: 0 })).toBe(raw);
  });
});

describe('quantize', () => {
  it('5 inks + noise → k = 5, centres within ΔE 2', () => {
    const q = quantize(bilateral(rgbToLab(poster())), { colors: 16, minDe: 6 });
    expect(q.k).toBe(5);
    for (const c of INKS) expect(close(q, c)).toBeLessThan(2);
    expect(q.counts.reduce((a, b) => a + b, 0)).toBe(160 * 120);
  });
  it('survives a JPEG round trip (chroma blocks may split a small ink: a speck cluster, merged later by regions)', () => {
    const q = quantize(bilateral(rgbToLab(poster(2, 75))), { colors: 16, minDe: 6 });
    for (const c of INKS) expect(close(q, c)).toBeLessThan(4);
    expect(q.counts.filter((n) => n > 160 * 120 * 0.01)).toHaveLength(5);
  });
  it('two inks ΔE ~3 apart merge at minDe 6, stay apart at 2', () => {
    const a: RGB = [180, 120, 60], b: RGB = [188, 125, 62];
    expect(de76(...rgbLab(...a), ...rgbLab(...b))).toBeGreaterThan(2.2);
    const img = paint(80, 40, [rect(0, 0, 40, 40, a), rect(40, 0, 40, 40, b)], { ss: 1 });
    const lab = rgbToLab(img);
    expect(quantize(lab, { minDe: 6 }).k).toBe(1);
    expect(quantize(lab, { minDe: 2 }).k).toBe(2);
    expect(nearPairs(quantize(lab, { minDe: 2 }), 9)).toHaveLength(1);
  });
  it('deterministic; colors caps k; skip leaves pixels out', () => {
    const lab = bilateral(rgbToLab(poster()));
    const q1 = quantize(lab), q2 = quantize(lab);
    expect(Buffer.from(q1.labels).equals(Buffer.from(q2.labels))).toBe(true);
    expect(quantize(lab, { colors: 3 }).k).toBeLessThanOrEqual(3);
    const skip = new Uint8Array(160 * 120).fill(1, 0, 160);
    const q3 = quantize(lab, { skip });
    expect(q3.labels[5]).toBe(255); expect(q3.labels[160 * 60]).not.toBe(255);
  });
  it('speed: 1000 × 1000 smooth + quantize well under budget', () => {
    const img = paint(1000, 1000, [rect(100, 100, 500, 300, INKS[1]), ellipse(600, 600, 250, 200, INKS[3])], { bg: INKS[0], ss: 1, noise: 3 });
    const t = performance.now();
    quantize(bilateral(rgbToLab(img)));
    expect(performance.now() - t).toBeLessThan(5000);
  });
});
