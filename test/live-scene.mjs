#!/usr/bin/env node
// Live checks for the scene tool (0.6, S1; needs a running Illustrator; works only in a document it creates):
// analyze a synthetic image, build it as one undo step, compare with the image, re-build without duplicates, edit +
// rebuild. Prints build time and payload.
//   npm run build && node test/live-scene.mjs
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { connect, assert } from './live-lib.mjs';
import { encodePng, resize } from '../dist/image.js';

const { call, done } = await connect('live-scene');
const tmp = mkdtempSync(join(tmpdir(), 'chandelier-scene-'));

// a poster at 4× then averaged down: paper, two wave bands, a box, a ring (hole), a dot
const W = 400, H = 300, S = 4, rgb = new Uint8Array(W * S * H * S * 3);
const shapes = [
  [(x, y) => true, [240, 230, 210]],
  [(x, y) => y >= 170 + 15 * Math.sin(x / 40), [233, 160, 90]],
  [(x, y) => y >= 220 + 18 * Math.sin(x / 55 + 1), [190, 90, 35]],
  [(x, y) => x >= 30 && x < 150 && y >= 30 && y < 110, [40, 90, 170]],
  [(x, y) => Math.hypot(x - 290, y - 75) <= 50 && Math.hypot(x - 290, y - 75) >= 25, [40, 40, 40]],
  [(x, y) => Math.hypot(x - 200, y - 130) <= 12, [200, 40, 60]],
];
for (let y = 0; y < H * S; y++) for (let x = 0; x < W * S; x++) {
  let c; for (const [f, col] of shapes) if (f((x + 0.5) / S, (y + 0.5) / S)) c = col;
  rgb.set(c, (y * W * S + x) * 3);
}
const png = join(tmp, 'poster.png');
writeFileSync(png, encodePng(resize({ w: W * S, h: H * S, rgb }, W, H)));
const first = (r) => r.content.find((c) => c.type === 'text').text;

await call('documents', { action: 'new', width: 400, height: 300, units: 'px', color: 'rgb', title: 'live-scene' });
let id;
await call('scene', { action: 'analyze', image: png }, { check: (v, r) => {
  const head = JSON.parse(first(r).split('\n')[0]);
  id = head.id;
  assert(head.regions === 7, 'regions: paper, 2 bands, box, ring, ring hole, dot → ' + head.regions);
  assert(r.content[0].type === 'image', 'overlay image');
} });
let built;
await call('scene', { action: 'build', id }, { check: (v) => { built = v; assert(v.items === 7 && v.undo === 'one step', JSON.stringify(v)); } });
console.log(`build: ${built.ms} ms, ${built.bytes} bytes, ${built.anchors} segments`);
// one undo step removes the whole build; redo brings it back
await call('history', { action: 'undo' });
await call('find_items', { refs: 'layer:Scene' }, { check: (v) => assert(!v.total, 'undo removed the build: ' + JSON.stringify(v).slice(0, 120)) });
await call('history', { action: 'redo' });
await call('find_items', { refs: 'layer:Scene' }, { check: (v) => assert(v.total === 7, 'redo: ' + v.total) });
await call('layers', { action: 'list' }, { check: (v) => assert(JSON.stringify(v).includes('"Scene"'), 'layer Scene') });
await call('swatches', { action: 'list', kind: 'global' }, { check: (v) => assert(JSON.stringify(v).includes('Scene c0'), 'global swatches') });
await call('preview', { reference: png, width: 400 }, { check: (v) => assert(v.rmse < 0.05, 'rmse vs the image ' + v.rmse) });
// seams: a close-up of the band edges at full size must show no light pixel between the bands
await call('preview', { region: [150, 160, 100, 100], width: 400 }, { check: (v, r) => assert(r.content[0].type === 'image', 'close-up') });
// re-build: the layer is replaced, no duplicates
await call('scene', { action: 'build', id }, { check: (v) => assert(v.items === 7, 'rebuild items ' + v.items) });
await call('find_items', { refs: 'layer:Scene' }, { check: (v) => assert(v.total === 7, 'items on the layer after rebuild: ' + v.total) });
// edit: drop the dot, the band below fills its place
await call('scene', { action: 'edit', id, edits: ['drop r6', 'name c0 Paper'] });
await call('scene', { action: 'build', id }, { check: (v) => assert(v.items === 6, 'after drop ' + v.items) });
await call('swatches', { action: 'list', kind: 'global' }, { check: (v) => assert(JSON.stringify(v).includes('Paper'), 'named swatch') });
// hand work around a scene: a hand layer above it, an item added to the scene layer, a scene item deleted by hand;
// a rebuild (and refine) keeps the layer's place and the added item, and the deleted region stays dropped
await call('layers', { action: 'add', name: 'Hand', position: 'top' });
await call('create_shape', { shape: 'rect', x: 10, y: 10, w: 20, h: 20, fill: '#00aa00', layer: 'Hand', name: 'hand box' });
await call('create_shape', { shape: 'rect', x: 40, y: 10, w: 20, h: 20, fill: '#aa00aa', layer: 'Scene', name: 'added box' });
await call('delete_items', { refs: 'name:Scene r1' });
await call('scene', { action: 'build', id }, { check: (v, r) => {
  assert(v.dropped_deleted === 'r1', 'deleted region reported: ' + v.dropped_deleted);
  assert(v.items === 5, 'rebuild without r1: ' + v.items);
  assert(r.content.length === 1, 'no warnings: ' + JSON.stringify(r.content.slice(1)));
} });
await call('find_items', { name: 'added box' }, { check: (v) => assert(v.total === 1, 'item added to the scene layer survives the rebuild') });
await call('find_items', { name: 'Scene r1' }, { check: (v) => assert(!v.total, 'r1 stays deleted') });
await call('layers', { action: 'list' }, { check: (v) => {
  const names = v.layers.map((l) => l.name);
  assert(names.indexOf('Hand') < names.indexOf('Scene'), 'the scene layer stays below the hand layer: ' + names.join(','));
} });
await call('scene', { action: 'refine', id });
await call('find_items', { name: 'added box' }, { check: (v) => assert(v.total === 1, 'added item survives refine') });
await call('layers', { action: 'list' }, { check: (v) => {
  const names = v.layers.map((l) => l.name);
  assert(names.indexOf('Hand') < names.indexOf('Scene'), 'refine keeps the layer order: ' + names.join(','));
} });
// a new layer placed by position, no "nothing found" warning on the first build
await call('scene', { action: 'build', id, layer: 'Scene 2', position: 'bottom' }, { check: (v, r) => assert(r.content.length === 1, 'first build: no warning ' + JSON.stringify(r.content.slice(1))) });
await call('layers', { action: 'list' }, { check: (v) => assert(v.layers[v.layers.length - 1].name === 'Scene 2', 'position bottom: ' + v.layers.map((l) => l.name).join(',')) });

// more than 100 items: the runtime lists 100 created items per step; a rebuild must still replace every one
{
  const GW = 480, GH = 360, dots = new Uint8Array(GW * 4 * GH * 4 * 3);
  for (let y = 0; y < GH * 4; y++) for (let x = 0; x < GW * 4; x++) {
    const px = (x + 0.5) / 4, py = (y + 0.5) / 4, cx = Math.round((px - 20) / 36) * 36 + 20, cy = Math.round((py - 20) / 28) * 28 + 20;
    const on = px > 6 && py > 6 && Math.hypot(px - cx, py - cy) <= 8;
    dots.set(on ? [30, 60, 160] : [245, 240, 230], (y * GW * 4 + x) * 3);
  }
  const grid = join(tmp, 'dots.png');
  writeFileSync(grid, encodePng(resize({ w: GW * 4, h: GH * 4, rgb: dots }, GW, GH)));
  let gid, drawn;
  await call('scene', { action: 'analyze', image: grid }, { check: (v, r) => { const head = JSON.parse(first(r).split('\n')[0]); gid = head.id; assert(head.regions > 100, 'many regions: ' + head.regions); } });
  await call('scene', { action: 'build', id: gid, layer: 'Dots' }, { check: (v) => { drawn = v.items; assert(v.items > 100, 'items ' + v.items); } });
  await call('scene', { action: 'edit', id: gid, edits: ['drop r60-r120'] });
  await call('scene', { action: 'build', id: gid, layer: 'Dots' }, { check: (v) => { drawn = v.items; } });
  await call('find_items', { layer: 'Dots', count_only: true }, { check: (v) => assert(v.total === drawn, 'rebuild left no stale items: ' + v.total + ' on the layer, ' + drawn + ' drawn') });
}
await call('documents', { action: 'close', discard: true });
process.exit(await done() ? 1 : 0);
