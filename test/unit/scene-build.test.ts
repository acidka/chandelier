import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { encodePng } from '../../src/image.js';
import { analyze } from '../../src/scene/analyze.js';
import { applyEdits } from '../../src/scene/edits.js';
import { buildSteps } from '../../src/scene/build.js';
import { scene } from '../../src/tools/scene.js';
import { paint, rect, ellipse, type RGB } from './scene-fixtures.js';
import type { Params } from '../../src/scene/types.js';

const BG: RGB = [240, 230, 210], ORANGE: RGB = [217, 130, 43], DARK: RGB = [40, 40, 40];
const P: Params = { image: 'x.png', colors: 16, minDe: 6, detail: 'normal', maxPx: 1000 };
const img = () => paint(200, 100, [rect(20, 20, 60, 60, ORANGE), ellipse(140, 50, 30, 30, DARK), ellipse(140, 50, 10, 10, BG)], { bg: BG, noise: 1 });

const wave = () => paint(200, 100, [{ inside: (x: number, y: number) => y >= 50 + 15 * Math.sin(x / 25), c: ORANGE }, ellipse(150, 30, 12, 12, DARK)], { bg: BG, noise: 1 });

describe('buildSteps', () => {
  it('clear layer, layer, one swatch per ink; live shapes for primitives, paths for the rest, bottom to top', () => {
    const s = analyze(img(), P, { dir: '/tmp/x', path: 'x.png' });
    const b = buildSteps(s, { rect: [10, 5, 100, 50], layer: 'Art' });
    expect(b.batches).toHaveLength(1);
    const st = b.batches[0];
    expect(st[0]).toEqual({ tool: 'delete_items', args: { refs: 'layer:Art' } });
    expect(st[1]).toEqual({ tool: 'layers', args: { action: 'add', name: 'Art' } });
    const sw = st.filter((x) => x.tool === 'swatches');
    expect(sw).toHaveLength(3); // paper, orange, dark (the hole is paper again)
    expect(sw[0].args).toMatchObject({ kind: 'global', name: 'Art c0', color: expect.stringMatching(/^#[0-9a-f]{6}$/) });
    // all four regions are primitives: background rect, square, ring disc, hole disc
    const shapes = st.filter((x) => x.tool === 'create_shape').flatMap((x) => x.args.items as any[]);
    expect(shapes.map((x) => x.shape)).toEqual(['rect', 'rect', 'ellipse', 'ellipse']);
    expect(shapes[0]).toMatchObject({ x: 10, y: 5, w: 100, h: 50 });
    expect(shapes[1].x).toBeCloseTo(20, 0); expect(shapes[1].w).toBeCloseTo(30, 0);
    expect(shapes[2].w).toBeCloseTo(30, 0); expect(shapes[3].w).toBeCloseTo(10, 0);
    expect(shapes.map((x) => x.name)).toEqual(b.regions.map((r) => `Art r${r}`));
    expect(b.regions.map((r) => s.z[r])).toEqual([...b.regions.map((r) => s.z[r])].sort((x, y) => x - y));
  });
  it('free-form regions are paths placed by scale and x, y; bleed pushes border points out', () => {
    const s = analyze(wave(), P, { dir: '/tmp/x', path: 'x.png' });
    const b = buildSteps(s, { rect: [0, 0, 400, 200], bleed: 6 });
    const tools = b.batches[0].slice(2).filter((x) => x.tool !== 'swatches').map((x) => x.tool);
    expect(tools).toEqual(['create_shape', 'create_path', 'create_shape']); // paper rect, wave, dot — in z order
    const bgRect = (b.batches[0].find((x) => x.tool === 'create_shape')!.args.items as any[])[0];
    expect(bgRect).toMatchObject({ shape: 'rect', x: -6, y: -6, w: 412, h: 212 });
    const p = b.batches[0].find((x) => x.tool === 'create_path')!;
    expect(p.args).toMatchObject({ x: 0, y: 0, scale: [2, 2], stroke: 'none' });
    expect((p.args.items as any[])[0].d).toMatch(/[ M]-3 /); // the wave runs out past the left edge (6 / scale 2)
  });
  it('swatch inks are not re-created; dropped regions not drawn; "free" turns a primitive into a path', () => {
    const s = analyze(img(), P, { dir: '/tmp/x', path: 'x.png' });
    applyEdits(s, ['c0 = swatch:Paper', 'drop r2', 'r1 free']);
    const b = buildSteps(s, { rect: [0, 0, 200, 100] });
    expect(b.batches[0].filter((x) => x.tool === 'swatches').some((x) => x.args.name === 'Paper')).toBe(false);
    expect(b.regions).not.toContain(2);
    const path = b.batches[0].find((x) => x.tool === 'create_path')!;
    expect((path.args.items as any[]).map((i) => i.name)).toEqual(['Scene r1']);
  });
});

describe('scene tool', () => {
  it('analyze → edit → build through a stub Illustrator', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'scene-tool-')), png = join(dir, 'in.png');
    writeFileSync(png, encodePng(img()));
    const calls: any[] = [];
    const ctx: any = {
      tmp: dir, settings: { units: 'mm' },
      rt: { cmd: async (name: string) => (name === 'artboards' ? { ok: true, data: { active: 0, artboards: [{ i: 0, rect: [0, 0, 300, 150] }] } } : { ok: false }) },
      tools: new Map([['batch', { run: async (a: any) => { calls.push(a); return { content: [{ type: 'text', text: JSON.stringify({ completed: a.steps.length, total: a.steps.length, results: a.steps.map((st: any) => ({ ok: true, data: st.tool === 'create_path' ? { items: st.args.items.map((_: unknown, i: number) => ({ uuid: 'u' + i })) } : {} })) }) }] }; } }]]),
    };
    const r1 = await scene.run!({ action: 'analyze', image: png, dir }, ctx);
    expect(r1.isError).toBeFalsy();
    expect(r1.content[0].type).toBe('image');
    const head = JSON.parse((r1.content[1] as any).text.split('\n')[0]);
    expect(head.file).toBe(join(dir, head.id, 'scene.json'));
    const r2 = await scene.run!({ action: 'edit', id: head.id, edits: ['name r0 Paper'] }, ctx);
    expect(r2.content).toHaveLength(1);
    const r3 = await scene.run!({ action: 'build', id: head.id }, ctx);
    const out = JSON.parse((r3.content[0] as any).text);
    expect(out).toMatchObject({ layer: 'Scene', rect: [0, 0, 300, 150], units: 'mm', undo: 'one step', calls: 1 });
    expect(calls[0]).toMatchObject({ rollback: true, stop_on_error: true });
    expect((await scene.run!({ action: 'build' }, ctx)).isError).toBe(true);
    expect((await scene.run!({ action: 'analyze', image: join(dir, 'nope.png') }, ctx)).content[0]).toMatchObject({ text: expect.stringMatching(/not found/) });
  });
});
