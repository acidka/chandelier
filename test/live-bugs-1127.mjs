#!/usr/bin/env node
// Live checks for bugs #16–#26 and scene finding F46 (docs/bugs.md, found in the reply-mode runs 2026-11-26/27). Needs a running
// Illustrator; works only in a document it creates, which it closes without saving at the end.
//   npm run build && node test/live-bugs-1127.mjs
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { connect, assert, txt } from './live-lib.mjs';

const { call, done } = await connect('live-bugs-1127');
const tmp = mkdtempSync(join(tmpdir(), 'chandelier-bugs-'));
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 0.6);

await call('documents', { action: 'new', width: 200, height: 100, units: 'pt', color: 'cmyk', artboards: 2, columns: 2, spacing: 20, title: 'live-bugs-1127' });
await call('artboards', { action: 'activate', index: 0 });
await call('configure', { artboard: 0 }); // pinned, as in the case-01 runs

// #16, #22: path_ops in a step with artboard 1 replies in artboard 1's frame, and the frame note says so
await call('batch', { steps: [
  { tool: 'create_shape', args: { shape: 'rect', x: 10, y: 10, w: 20, h: 20, fill: 'cmyk(0,100,100,0)', stroke: 'none' }, artboard: 1 },
  { tool: 'create_shape', args: { shape: 'rect', x: 20, y: 10, w: 20, h: 20, fill: 'cmyk(0,100,100,0)', stroke: 'none' }, artboard: 1 },
  { tool: 'path_ops', args: { op: 'unite', refs: ['@0', '@1'], name: 'united' }, artboard: 1 },
  { tool: 'find_items', args: { name: 'united' } },
] }, { check: (v, r) => {
  const box = v.results[2].data.items[0].box, abs = v.results[3].data.items[0].box;
  assert(near(box, [10, 10, 30, 20]), '#16 path_ops box in artboard 1 frame: ' + box);
  assert(near(abs, [230, 10, 30, 20]), 'step without artboard: session frame (artboard 0): ' + abs);
  const note = txt(r);
  assert(/steps 0-2: artboard 1; other steps: artboard 0/.test(note), '#22 frame note names the step frames: ' + note.slice(-160));
} });

// #19: a shape on a hidden layer under the moved one is not named in differences
await call('layers', { action: 'add', name: 'Hid' });
await call('batch', { steps: [{ tool: 'create_shape', args: { shape: 'rect', x: 10, y: 10, w: 30, h: 20, fill: 'cmyk(100,0,0,0)', stroke: 'none', layer: 'Hid', name: 'hidden-one' }, artboard: 1 }] });
await call('layers', { action: 'update', name: 'Hid', visible: false });
const ref = join(tmp, 'ref.png');
// #23: an artboard render's rect is in that artboard's frame
await call('preview', { artboard: 1, width: 400, save_to: ref }, { check: (v, r) => {
  assert(near(v.rect, [0, 0, 200, 100]), '#23 rect of artboard 1 render: ' + v.rect);
  assert(/frame: artboard 1, pt$/.test(txt(r)), '#23 note: ' + txt(r).slice(-60));
} });
await call('transform_items', { refs: 'name:united', dx: 100 });
await call('preview', { artboard: 1, width: 400, reference: ref }, { check: (v) => {
  assert(v.differences?.length, 'differences found');
  for (const d of v.differences) {
    assert(d.rect[0] >= -1 && d.rect[0] + d.rect[2] <= 201, '#23 difference rect inside artboard 1 frame: ' + d.rect);
    assert(!(d.items ?? []).some((i) => i.name === 'hidden-one'), '#19 hidden layer item named: ' + JSON.stringify(d.items));
  }
} });

// preview {reference, sample}: the same points in both images, with ΔE (the shape moved 100 pt: at x 20 it is gone)
await call('preview', { artboard: 1, width: 400, reference: ref, sample: [[20, 20], [5, 90]] }, { check: (v) => {
  const [moved, paper] = v.samples ?? [];
  assert(moved?.reference !== '#ffffff' && moved?.preview === '#ffffff' && moved.de > 20, 'sample where the shape left: ' + JSON.stringify(moved));
  assert(paper?.de < 2, 'paper sample equal in both: ' + JSON.stringify(paper));
} });

// #20: grid and samples on a render
await call('preview', { artboard: 1, width: 400, grid: true, sample: [[120, 20], [5, 90]] }, { check: (v) => {
  assert(typeof v.grid === 'number', '#20 grid step reported: ' + v.grid);
  assert(v.samples?.[0]?.cmyk && v.samples[0].hex !== '#ffffff', '#20 sample on the red shape: ' + JSON.stringify(v.samples?.[0]));
  assert(v.samples[1].hex === '#ffffff', 'white paper sample: ' + JSON.stringify(v.samples[1]));
} });
await call('preview', { artboard: 1, grid: true, reference: ref }, { expectError: true });

// #21: stops alone keep a radial gradient radial
await call('swatches', { action: 'add', kind: 'gradient', name: 'Glow', type: 'radial', stops: [{ color: 'cmyk(0,0,0,0)' }, { color: 'cmyk(0,50,100,0)' }] });
await call('swatches', { action: 'update', name: 'Glow', stops: [{ color: 'cmyk(0,0,0,0)' }, { color: 'cmyk(100,0,0,0)' }] }, { check: (v) => {
  assert(v.type === 'radial', '#21 still radial: ' + JSON.stringify(v));
} });
await call('swatches', { action: 'update', name: 'Glow', type: 'linear' }, { check: (v) => { assert(v.type === 'linear' && v.stops?.length === 2, 'type alone, stops kept: ' + JSON.stringify(v)); } });

// #18: a new layer below a locked one
await call('layers', { action: 'add', name: 'Locked', locked: true });
await call('layers', { action: 'add', name: 'Under', position: 'below:Locked' });
await call('layers', { action: 'list' }, { check: (v) => {
  const names = v.layers.map((l) => l.name), k = names.indexOf('Locked');
  assert(names[k + 1] === 'Under', '#18 Under right below Locked: ' + names);
  assert(v.layers[k].locked === true, 'Locked stays locked');
} });
await call('layers', { action: 'update', name: 'Locked', locked: false });

// #17, #26: 30 shade items on artboard 0 → one grouped transparency line; scoped preflight
await call('create_shape', { shape: 'rect', w: 4, h: 4, fill: 'cmyk(0,0,0,100)', opacity: 40, blend: 'multiply', layer: 'Under',
  items: Array.from({ length: 30 }, (_, i) => ({ x: 5 + (i % 10) * 6, y: 50 + Math.floor(i / 10) * 6 })) });
await call('preflight', {}, { check: (v) => {
  const t = v.checks.transparency;
  assert(t && t.count === 30 && t.items.length === 1 && t.items[0].count === 30 && t.items[0].layer === 'Under', '#17 grouped: ' + JSON.stringify(t));
} });
await call('preflight', { artboard: 1 }, { check: (v) => { assert(!v.checks.transparency, '#26 artboard 1 has no shade items: ' + JSON.stringify(v.checks.transparency)); } });
await call('preflight', { refs: 'name:united' }, { check: (v) => { assert(!v.checks.transparency, '#26 refs scope'); } });
await call('preview', { artboard: 1, preflight: true }, { check: (v, r) => { assert(!/transparency/.test(txt(r)), '#26 preview {artboard, preflight} checks that artboard only'); } });

// #24: grid cells named by a pattern; issues list a few items
await call('create_text', { size: 9, font: 'Arial', layer: 'Under', name: 'Day {row}-{col}', grid: { x: 100, y: 20, cols: 3, dx: 20, dy: 12, cells: [1, 2, 3, 4, 5, 6] } }, { check: (v) => {
  assert(v.count === 6, 'six cells');
} });
await call('find_items', { name: 'Day 2-3' }, { check: (v) => { assert(v.total === 1, '#24 cell Day 2-3 named'); } });
await call('create_text', { text: 'stray', x: 150, y: 80, size: 9, font: 'Arial', layer: 'Under' });
await call('document_info', {}, { check: (v) => {
  assert(v.issues.unnamedText === 1, '#24 only the stray text unnamed: ' + JSON.stringify(v.issues));
  assert(v.issueItems?.unnamedText?.[0]?.text === 'stray', '#24 issueItems names it: ' + JSON.stringify(v.issueItems));
} });

// scene F46: get_items {points} on a compound path gives each sub-path's points
await call('create_path', { d: 'M0 0 L50 0 L50 50 L0 50 Z M10 10 L40 10 L40 40 L10 40 Z', fill_rule: 'evenodd', name: 'cp', x: 120, y: 40, layer: 'Under' });
await call('get_items', { refs: 'name:cp', points: true }, { check: (v) => {
  const sp = v.items[0].subpaths;
  assert(sp?.length === 2 && sp.every((p) => p.closed && p.path.length === 4), 'F46 subpaths: ' + JSON.stringify(sp));
} });
await call('delete_items', { refs: 'name:cp' });

// scene F18: a ring drawn as a centreline stroke (width 6 px of a 300 px image on a 150 pt wide rect = 3 pt)
{
  const W = 300, H = 200, rgb = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = Math.hypot(x + 0.5 - 100, y + 0.5 - 100); rgb.set(d >= 57 && d <= 63 ? [30, 60, 120] : [240, 230, 210], (y * W + x) * 3); }
  const { encodePng } = await import('../dist/image.js');
  const png = join(tmp, 'ring.png');
  (await import('node:fs')).writeFileSync(png, encodePng({ w: W, h: H, rgb }));
  let id, ringId;
  await call('scene', { action: 'analyze', image: png }, { check: (v, r) => {
    const text = r.content.find((c) => c.type === 'text').text;
    id = JSON.parse(text.split('\n')[0]).id;
    ringId = text.split('\n').find((l) => /^r\d+ +#(1|2)/.test(l))?.split(' ')[0];
    assert(ringId, 'ring region found: ' + text.slice(0, 400));
  } });
  await call('scene', { action: 'edit', id, edits: [`${ringId} stroke`] });
  await call('scene', { action: 'build', id, rect: [0, 0, 150, 100], layer: 'Ring' });
  await call('get_items', { refs: `name:Ring ${ringId}`, fields: ['fill', 'stroke', 'sw', 'closed'] }, { check: (v) => {
    const it = v.items[0];
    assert(it.fill === 'none' && /^swatch:/.test(it.stroke) && Math.abs(it.sw - 3) < 0.3, 'F18 stroked ring: ' + JSON.stringify(it));
  } });
  await call('delete_items', { refs: 'layer:Ring' });
}

// fewer turns: two zooms of a render in one call; a fitted edge that ends exactly on another curve
await call('preview', { artboard: 1, region: [[0, 0, 100, 50], [100, 50, 100, 50]], width: 200 }, { check: (v, r) => {
  assert(r.content.filter((c) => c.type === 'image').length === 2, 'two images');
  assert(/^region 1 \[100, 50, 100, 50\]: /.test(r.content.filter((c) => c.type === 'text')[1].text), 'second labelled');
} });
await call('preview', { artboard: 1, region: [[0, 0, 100, 50], [100, 50, 100, 50]], reference: ref, width: 200 }, { check: (v, r) => {
  const t = r.content.filter((c) => c.type === 'text' && /^region \d/.test(c.text)).map((c) => c.text);
  assert(t.length === 2 && t.every((x) => /"rmse":/.test(x)), 'each region compared: ' + t.map((x) => x.slice(0, 60)));
} });
await call('create_path', { fit: [[[0, 40], [30, 41], [60, 40], [80, 40]], { onto: [[100, 0], [101, 20], [100.5, 50], [100, 80]] }], stroke: '#000000', name: 'snapped', layer: 'Under' });
await call('get_items', { refs: 'name:snapped', points: true }, { check: (v) => {
  const p = v.items[0].path, last = p[p.length - 1], end = Array.isArray(last) ? last : last.a;
  assert(Math.abs(end[0] - 100.8) < 0.8 && Math.abs(end[1] - 40) < 0.5, 'end on the other curve: ' + JSON.stringify(end));
} });

// #25: save says saved
await call('documents', { action: 'save', path: join(tmp, 'bugs.ai') }, { check: (v) => { assert(v.saved === true, '#25 saved flag: ' + JSON.stringify(v)); } });
await call('documents', { action: 'save' }, { check: (v) => { assert(v.saved === true, '#25 plain save'); } });

await call('configure', { artboard: null });
await call('documents', { action: 'close', discard: true });
rmSync(tmp, { recursive: true, force: true });
process.exit(await done() ? 1 : 0);
