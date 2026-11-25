// Regression tests for bugs #7, #8, #9 (docs/bugs.md, found in the recreate subagent tests 2026-11-25).
import { describe, it, expect } from 'vitest';
import { loadRuntime } from './shim.mjs';
import { compare, type Img } from '../../src/image.js';
import { frameNote } from '../../src/server.js';
import { defaultSettings } from '../../src/settings.js';
import { contentBoxStats } from '../../src/tools/preview.js';

describe('#7 delete_items: refs that find nothing', () => {
  it('a missing layer or name deletes nothing instead of failing', () => {
    const { dispatch } = loadRuntime();
    const env = dispatch({ cmd: 'delete_items', args: { refs: ['layer:Nope', 'name:Gone*'] } });
    expect(env).toMatchObject({ ok: true, data: { deleted: 0, not_found: ['layer:Nope', 'name:Gone*'] } });
    expect(env.warnings[0]).toMatch(/Nothing found/);
  });
  it('other ref errors still fail', () => {
    const { dispatch } = loadRuntime();
    expect(dispatch({ cmd: 'delete_items', args: { refs: 'bogus' } }).ok).toBe(false);
    expect(dispatch({ cmd: 'delete_items', args: {} }).ok).toBe(false);
  });
});

describe('#8 content_box against each image\'s own background', () => {
  const fill = (w: number, h: number, c: number[]): Img => { const rgb = new Uint8Array(w * h * 3); for (let i = 0; i < w * h; i++) rgb.set(c, i * 3); return { w, h, rgb }; };
  const rect = (img: Img, x0: number, y0: number, x1: number, y1: number, c: number[]) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) img.rgb.set(c, (y * img.w + x) * 3); };
  it('light colours count as content (the old "darker than 150" missed them)', () => {
    const ref = fill(100, 100, [255, 255, 255]), prev = fill(100, 100, [255, 255, 255]);
    rect(ref, 20, 30, 60, 50, [160, 220, 160]);   // light green: no channel under 150
    rect(prev, 20, 30, 60, 50, [160, 220, 160]);
    expect(compare(ref, prev).ink!.reference).toEqual([0.2, 0.3, 0.4, 0.2]);
  });
  it('content on a kraft background is measured against the kraft', () => {
    const ref = fill(100, 100, [240, 215, 175]), prev = fill(100, 100, [248, 219, 181]);
    rect(ref, 0, 40, 100, 60, [214, 107, 20]); rect(prev, 0, 40, 100, 60, [213, 100, 27]);
    const c = compare(ref, prev);
    expect(c.ink!.reference[1]).toBeCloseTo(0.4, 2);
    expect(c.ink!.preview).toEqual(c.ink!.reference);
  });
  it('boxes of different shape give a note, not a misleading shift and scale', () => {
    expect(contentBoxStats([0, 0, 100, 100], [0, 0, 100, 81])).toMatchObject({ note: expect.stringMatching(/differ in shape/) });
    expect(contentBoxStats([0, 0, 100, 100], [10, 0, 100, 100])).toMatchObject({ shift: [10, 0], scale: [1, 1] });
  });
});

describe('#9 frame note', () => {
  it('silent in the default frame, explicit when configure pinned one', () => {
    const s = defaultSettings('mac');
    expect(frameNote(s)).toBeNull();
    expect(frameNote({ ...s, artboard: 2, units: 'mm' })).toMatch(/^frame: artboard 2, mm/);
    expect(frameNote({ ...s, origin: 'document' })).toMatch(/document origin/);
  });
});
