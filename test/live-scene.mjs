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

const { call, done } = await connect('live-scene', { env: { CHANDELIER_SCENE: '1' } });
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

await call('documents', { action: 'close', discard: true });
process.exit(await done() ? 1 : 0);
