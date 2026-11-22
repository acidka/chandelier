import { describe, it, expect } from 'vitest';
import { loadRuntime } from './shim.mjs';

const { A } = loadRuntime();
const plain = (v: unknown) => JSON.parse(JSON.stringify(v));
const anchors = (sub: any) => sub.pts.map((p: any) => p.a.map((n: number) => Math.round(n * 1000) / 1000));

describe('AIA.svgPath', () => {
  it('lines, closing, relative and H/V', () => {
    const s = plain(A.svgPath('M0 0 L10 0 L10 10 Z'));
    expect(s).toHaveLength(1);
    expect(s[0].closed).toBe(true);
    expect(anchors(s[0])).toEqual([[0, 0], [10, 0], [10, 10]]);
    expect(anchors(plain(A.svgPath('m5 5 h10 v10 h-10 z'))[0])).toEqual([[5, 5], [15, 5], [15, 15], [5, 15]]);
  });
  it('implicit line-tos after M, and a closing point equal to the start is merged', () => {
    const s = plain(A.svgPath('M0 0 10 0 10 10 0 0z'));
    expect(anchors(s[0])).toEqual([[0, 0], [10, 0], [10, 10]]);
  });
  it('cubic curves and S reflection', () => {
    const s = plain(A.svgPath('M0 0 C0 10 10 10 10 0 S20 -10 20 0'))[0];
    expect(s.pts[0].o).toEqual([0, 10]);
    expect(s.pts[1].i).toEqual([10, 10]);
    expect(s.pts[1].o).toEqual([10, -10]); // reflected
    expect(s.pts[2].i).toEqual([20, -10]);
  });
  it('quadratics become cubics (and T reflects)', () => {
    const s = plain(A.svgPath('M0 0 Q10 10 20 0 T40 0'))[0];
    expect(s.pts[0].o.map((n: number) => +n.toFixed(3))).toEqual([6.667, 6.667]);
    expect(s.pts[1].i.map((n: number) => +n.toFixed(3))).toEqual([13.333, 6.667]);
    expect(s.pts[1].o.map((n: number) => +n.toFixed(3))).toEqual([26.667, -6.667]);
  });
  it('arcs: a clockwise half circle goes over the top (y down) in 2 segments', () => {
    const s = plain(A.svgPath('M0 0 A10 10 0 0 1 20 0'))[0];
    expect(anchors(s)).toEqual([[0, 0], [10, -10], [20, 0]]);
  });
  it('arcs with packed flags and a full circle from two arcs', () => {
    const s = plain(A.svgPath('M0 0a10 10 0 0120 0a10 10 0 0 1-20 0z'))[0];
    expect(s.closed).toBe(true);
    expect(anchors(s)).toEqual([[0, 0], [10, -10], [20, 0], [10, 10]]);
  });
  it('several subpaths (for compound paths)', () => {
    const s = plain(A.svgPath('M0 0h10v10h-10z M2 2h6v6h-6z'));
    expect(s).toHaveLength(2);
    expect(s.every((x: any) => x.closed)).toBe(true);
  });
  it('scientific numbers and no separators', () => {
    expect(anchors(plain(A.svgPath('M1e1-5L.5.5'))[0])).toEqual([[10, -5], [0.5, 0.5]]);
  });
  it('explains bad data', () => {
    expect(() => A.svgPath('M0')).toThrow(/number expected/);
    expect(() => A.svgPath('10 10')).toThrow(/must start with M/);
  });
});
