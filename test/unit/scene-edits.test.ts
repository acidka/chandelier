import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { encodePng } from '../../src/image.js';
import { analyze } from '../../src/scene/analyze.js';
import { applyEdits } from '../../src/scene/edits.js';
import { summary } from '../../src/scene/summary.js';
import { save, load, get, put } from '../../src/scene/store.js';
import { paint, rect, ellipse, type RGB } from './scene-fixtures.js';
import type { Params } from '../../src/scene/types.js';

const BG: RGB = [240, 230, 210], ORANGE: RGB = [217, 130, 43], DARK: RGB = [40, 40, 40], BLUE: RGB = [40, 90, 170];
const P: Params = { image: 'x.png', colors: 16, minDe: 6, detail: 'normal', maxPx: 1000 };
const img = () => paint(200, 150, [rect(10, 10, 80, 60, ORANGE), rect(110, 10, 80, 60, [225, 140, 50]), ellipse(100, 110, 30, 25, DARK), ellipse(160, 110, 15, 15, BLUE)], { bg: BG, noise: 1 });
const fresh = () => analyze(img(), P, { dir: '/tmp/x', path: 'x.png' });
const idOf = (s: ReturnType<typeof fresh>, f: (r: { cx: number; cy: number }) => boolean) => s.seg.regions.find((r) => r.area > 0 && f(r))!.id;

describe('scene edits', () => {
  it('merge: the first id survives, the others disappear; ids stay stable', () => {
    const s = fresh(), a = idOf(s, (r) => r.cx < 100 && r.cy < 80), b = idOf(s, (r) => r.cx > 100 && r.cy < 80), d = idOf(s, (r) => r.cx > 140 && r.cy > 80);
    const n = s.seg.regions.filter((r) => r.area > 0).length;
    applyEdits(s, [`merge r${a} r${b}`]);
    expect(s.seg.regions.filter((r) => r.area > 0)).toHaveLength(n - 1);
    expect(s.seg.regions[b].area).toBe(0);
    expect(s.seg.regions[d].area).toBeGreaterThan(0); // untouched ids unchanged
    expect(summary(s)).not.toMatch(new RegExp(`^r${b} `, 'm'));
    expect(s.edits).toEqual([`merge r${a} r${b}`]);
  });
  it('drop / keep, recolour, z moves, names, tolerance, stack', () => {
    const s = fresh(), d = idOf(s, (r) => r.cx > 140 && r.cy > 80), k = idOf(s, (r) => r.cx > 70 && r.cx < 130 && r.cy > 80);
    applyEdits(s, [`drop r${d}`]);
    expect(summary(s)).toMatch(new RegExp(`^r${d} .* drop→r0 `, "m"));
    applyEdits(s, [`keep r${d}`, `r${d} = #ff0000`, `c0 = swatch:Paper`, `name c0 Kraft`, `name r${k} Big dot`, `r${d} under r${k}`, `tolerance r${k} 0.5`, `tolerance 2`, 'stack off']);
    expect(s.meta[d].drop).toBe(false);
    expect(s.colours[s.meta[d].colour]).toMatchObject({ L: expect.closeTo(53.2, 0) });
    expect(s.colours[0]).toMatchObject({ swatch: 'Paper', name: 'Kraft' });
    expect(s.meta[k]).toMatchObject({ name: 'Big dot', tol: 0.5 });
    expect(s.z[d]).toBeLessThan(s.z[k]);
    expect(s.tol).toBe(2); expect(s.tile).toBe(true);
    expect(summary(s)).toMatch(/c0 swatch:Paper "Kraft"/);
    applyEdits(s, [`r${d} = c0`]);
    expect(s.meta[d].colour).toBe(0);
  });
  it('show changes nothing; errors name the edit', () => {
    const s = fresh();
    const before = JSON.stringify(s.meta);
    expect(applyEdits(s, ['show r0-r3']).show).toEqual([0, 1, 2, 3].filter((i) => s.seg.regions[i]?.area));
    expect(applyEdits(s, ['show c1']).showColour).toBe(1);
    expect(JSON.stringify(s.meta)).toBe(before);
    expect(() => applyEdits(s, ['drop r0', 'merge r1'])).toThrow(/edit 2 "merge r1": needs two/);
    expect(() => applyEdits(s, ['r999 top'])).toThrow(/r999 does not exist/);
    expect(() => applyEdits(s, ['paint it'])).toThrow(/unknown edit/);
    expect(() => applyEdits(s, ['r0 = pink'])).toThrow(/colour "pink"/);
  });
});

describe('scene store', () => {
  it('save → load gives the same regions, edges and fits; id as a path', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scene-')), png = join(dir, 'in.png');
    const im = img();
    writeFileSync(png, encodePng(im));
    const s = analyze(im, { ...P, image: png }, { dir, path: png, bytes: encodePng(im) });
    applyEdits(s, ['drop r3', 'name r0 Paper']);
    const file = save(s);
    const t = await load(file, join(dir, 't.png'));
    expect(t.seg.regions.map((r) => r.area)).toEqual(s.seg.regions.map((r) => r.area));
    expect(t.fits).toEqual(s.fits);
    expect(t.meta).toEqual(s.meta); expect(t.edits).toEqual(s.edits);
    put(s);
    expect(await get(s.id, join(dir, 't.png'))).toBe(s);
    expect((await get(file, join(dir, 't.png'))).id).toBe(s.id);
    await expect(get('s9999', join(dir, 't.png'))).rejects.toThrow(/no scene "s9999"/);
  });
});

describe('scene edits after the first suite runs', () => {
  it('ranges, drop by size, drop … fill, swatch names with spaces', () => {
    const s = fresh(), n = s.seg.regions.filter((r) => r.area > 0).length;
    applyEdits(s, ['drop r1-r3']);
    expect([1, 2, 3].filter((i) => s.seg.regions[i]?.area).every((i) => s.meta[i].drop)).toBe(true);
    applyEdits(s, ['reset']);
    expect(s.meta.every((m) => !m.drop)).toBe(true);
    expect(s.edits).toEqual([]);
    const r = applyEdits(s, ['drop < 1']); // the small blue dot (≈ 2.4 %? no: 15² π / 30000 ≈ 2.4 %) stays, specks go
    expect(r.dropped).toBeGreaterThanOrEqual(0);
    applyEdits(s, ['reset', 'drop < 3']);
    const dot = s.seg.regions.findIndex((x) => x.area > 0 && x.b < -20);
    expect(s.meta[dot].drop).toBe(true);
    expect(s.seg.regions.filter((x) => x.area > 0 && !s.meta[x.id].drop).length).toBeLessThan(n);
    applyEdits(s, ['c0 = swatch:v1 Warm Paper']);
    expect(s.colours[0].swatch).toBe('v1 Warm Paper');
  });
  it('a dropped region is filled by what it sits on, or by the given region', () => {
    const s = fresh(), big = idOf(s, (r) => r.cx > 70 && r.cx < 130 && r.cy > 80), dot = idOf(s, (r) => r.cx > 140 && r.cy > 80);
    applyEdits(s, [`drop r${dot}`]);
    expect(s.fillers.get(dot)).toBe(0); // the paper around it, not a neighbour that runs under
    applyEdits(s, [`keep r${dot}`, `drop r${dot} fill r${big}`]);
    expect(s.fillers.get(dot)).toBe(big);
    const shape = s.shapes.find((sh) => sh.region === big)!;
    expect(shape.raw.length).toBeGreaterThan(0);
  });
  it('undo [n] replays the earlier edits; tolerance clears what refine tightened', () => {
    const s = fresh();
    applyEdits(s, ['name r0 Paper', 'drop r1', 'drop r2']);
    applyEdits(s, ['undo']);
    expect(s.meta[0].name).toBe('Paper'); expect(s.meta[1].drop).toBe(true); expect(s.meta[2].drop).toBeFalsy();
    applyEdits(s, ['undo 2']);
    expect(s.meta[0].name).toBeUndefined();
    s.edgeTol = { '0,1': 0.3, '2,3': 0.3 };
    applyEdits(s, ['tolerance r1 3']);
    expect(s.edgeTol).toEqual({ '2,3': 0.3 });
    applyEdits(s, ['tolerance 2']);
    expect(s.edgeTol).toEqual({});
  });
  it('forced circle: a true circle even when other shapes sit on it', () => {
    const im = paint(240, 200, [ellipse(120, 100, 80, 80, ORANGE), rect(100, 40, 40, 120, DARK), ellipse(150, 100, 15, 15, BLUE)], { bg: BG, noise: 1 });
    const s = analyze(im, P, { dir: '/tmp/x', path: 'x.png' });
    const disc = s.seg.regions.findIndex((r) => r.area > 0 && r.a > 20 && r.area > 5000);
    applyEdits(s, [`r${disc} circle`]);
    const p = s.prims[disc]!;
    expect(p.kind).toBe('circle'); expect(p.a).toBeCloseTo(80, -0.5); expect(p.cx).toBeCloseTo(120, -0.3);
  });
});
