// Fewer turns (2026-11-27): several preview regions in one call, the run_script helper reference, create_path fit
// {onto} (a list's end lands exactly on another fitted curve).
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { create_path, nearestOn } from '../../src/tools/create_path.js';
import { fitCurve } from '../../src/fitcurve.js';
import { helperReference, run_script } from '../../src/tools/run_script.js';
import { preview } from '../../src/tools/preview.js';
import { encodePng } from '../../src/image.js';

describe('create_path fit {onto}', () => {
  const wall = Array.from({ length: 21 }, (_, i) => [100 + 0.002 * (i * 5 - 50) ** 2, i * 5]); // a gently curved "wall" near x = 100
  it('a list that stops short or overshoots ends exactly on the other curve', () => {
    const segs = fitCurve(wall, { tolerance: 0.2 });
    for (const endX of [90, 112]) {
      const p = nearestOn(segs, [endX, 40], [endX - 10, 40]);
      expect(Math.abs(p[1] - 40)).toBeLessThan(0.01); // along the list's own direction
      expect(Math.abs(p[0] - (100 + 0.002 * (40 - 50) ** 2))).toBeLessThan(0.3);
    }
  });
  it('create_path: {onto} after a list moves that list\'s end, the path starts where it did', () => {
    const st = create_path.step!({ fit: [[[0, 40], [30, 41], [60, 40], [90, 40]], { onto: wall }], tolerance: 0.5 } as any, {} as any) as any;
    const nums = st.args.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(nums.slice(0, 2)).toEqual([0, 40]);
    expect(Math.abs(nums[nums.length - 2] - 100.2)).toBeLessThan(0.5);
    expect(() => create_path.step!({ fit: [[[0, 0], [1, 1]], { onto: [[0, 0]] }] } as any, {} as any)).toThrow(/onto/);
  });
});

describe('run_script {recipe: "help"}', () => {
  it('lists every AIA helper with the options it reads, from the runtime itself', async () => {
    const h = helperReference();
    expect(h).toMatch(/^AIA\.text\(str, o\) \{[^}]*\bfont\b[^}]*\bsize\b[^}]*\}/m);
    expect(h).toMatch(/^AIA\.pstyle\(name, o\) \{[^}]*\bleading\b/m);
    expect(h).toMatch(/^AIA\.fresh\(name\) — /m);
    const r = await run_script.run!({ recipe: 'help' }, {} as any);
    expect((r.content[0] as any).text).toMatch(/^AIA helpers/);
  });
});

describe('preview {image, region: [list]}', () => {
  it('one zoom per region in one call, each labelled', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'turns-')), f = join(dir, 'a.png'), w = 200, h = 100, rgb = new Uint8Array(w * h * 3).fill(255);
    for (let y = 20; y < 60; y++) for (let x = 20; x < 60; x++) rgb.set([200, 30, 30], (y * w + x) * 3);
    writeFileSync(f, encodePng({ w, h, rgb }));
    const r = await preview.run!({ image: f, region: [[0, 0, 100, 100], [100, 0, 100, 100]], sample: [[30, 30]] }, { tmp: dir } as any);
    expect(r.isError).toBeFalsy();
    expect(r.content.filter((c) => c.type === 'image')).toHaveLength(2);
    const texts = r.content.filter((c) => c.type === 'text').map((c: any) => c.text);
    expect(texts[0]).toMatch(/^region 0 \[0, 0, 100, 100\]: .*"samples":\[\{"at":\[30,30\],"hex":"#c81e1e"/);
    expect(texts[1]).toMatch(/^region 1 \[100, 0, 100, 100\]: /);
    expect(texts[1]).not.toMatch(/samples/);
    expect((await preview.run!({ image: f, region: [[0, 0, 10, 10]], save_to: join(dir, 'x.png') }, { tmp: dir } as any)).isError).toBe(true); // save_to: one region
  });
});
