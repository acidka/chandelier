#!/usr/bin/env node
// Live checks for the 0.1 release (needs a running Illustrator; works only in a document it creates):
// preview {region} measured from a given artboard, SVG export clipped to the artboard, preflight low_contrast;
// 0.5.2: gradient angles, region vs page reference, preview {image} of a PDF page, re-runnable batches;
// a locked active layer, gradient text refused (docs/bugs.md #13, #14).
//   npm run build && node test/live-release.mjs
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { connect, assert } from './live-lib.mjs';
import { decodePng } from '../dist/image.js';

const { call, done } = await connect('live-release');
const tmp = mkdtempSync(join(tmpdir(), 'chandelier-release-'));

await call('documents', { action: 'new', width: 200, height: 100, units: 'px', color: 'rgb', artboards: 2, columns: 2, spacing: 20, title: 'live-release' });
await call('artboards', { action: 'activate', index: 0 });

// a red box on artboard 1 only; the active artboard stays 0
await call('batch', { steps: [{ tool: 'create_shape', args: { shape: 'rect', x: 10, y: 10, w: 50, h: 30, fill: '#FF0000', name: 'red' }, artboard: 1 }] });
await call('preview', { artboard: 1, region: [0, 0, 100, 50], width: 100 }, { check: (v, r) => {
  assert(v.of === 'region' && v.rect.join() === '0,0,100,50', 'rect reported in artboard 1 frame: ' + v.rect);
  const png = decodePng(Buffer.from(r.content.find((c) => c.type === 'image').data, 'base64'));
  let red = 0; for (let i = 0; i < png.rgb.length; i += 3) if (png.rgb[i] > 200 && png.rgb[i + 1] < 60) red++;
  assert(red > 200, 'region of artboard 1 shows the red box (' + red + ' red px)');
} });

// SVG: art reaching far outside the artboard is clipped
await call('create_shape', { shape: 'ellipse', x: -300, y: -300, w: 800, h: 800, fill: '#3366CC', name: 'big' });
await call('export', { format: 'svg', artboards: [0], path: join(tmp, 'clip.svg') }, { check: () => {
  const svg = readFileSync(join(tmp, 'clip.svg'), 'utf8');
  assert(/<clipPath id="chandelier-artboard"><rect x="0" y="0" width="200" height="100"\/>/.test(svg), 'clip path = artboard');
} });
await call('delete_items', { refs: 'name:big' });

// contrast: light grey on white and dark grey on black fail; black on white and white on black pass
await call('create_shape', { shape: 'rect', x: 100, y: 0, w: 100, h: 100, fill: '#000000', name: 'dark' });
await call('create_text', { size: 10, font: 'Arial', items: [
  { text: 'low', x: 10, y: 20, fill: '#CCCCCC', name: 'low' },
  { text: 'ok', x: 10, y: 60, fill: '#000000', name: 'ok' },
  { text: 'dark', x: 110, y: 20, fill: '#333333', name: 'dark-on-dark' },
  { text: 'white', x: 110, y: 60, fill: '#FFFFFF', name: 'white-on-dark' },
] });
await call('preflight', { ignore: ['live_text', 'off_artboard'] }, { check: (v) => {
  const names = (v.checks.low_contrast?.items ?? []).map((i) => i.name).sort();
  assert(names.join() === 'dark-on-dark,low', 'low_contrast flags exactly low and dark-on-dark: ' + names);
} });

// a call that outlives its timeout: the error tells the agent Illustrator is busy, then status.last_call shows it finished
let callNo;
await call('run_script', { code: 'var t = new Date().getTime(); while (new Date().getTime() - t < 7000) {} return "slow done";', timeout: 2 },
  { expectError: true, check: (v) => { const t = typeof v === 'string' ? v : JSON.stringify(v); callNo = +(t.match(/call #(\d+)/) || [])[1];
    assert(/not answering|answers again/.test(t) && callNo > 0, 'timeout error carries a hint and the call number: ' + t.slice(0, 200)); } });
await new Promise((r) => setTimeout(r, 7000));
await call('status', {}, { check: (v) => assert(v.last_call && v.last_call.call === callNo && v.last_call.finished === true && v.last_call.cmd === 'script',
  'last_call shows the timed-out call finished: ' + JSON.stringify(v.last_call)) });

// bugs.md #1: a gradient fill gets the asked angle (set, changed, read back; no angle = 0)
await call('swatches', { action: 'add', kind: 'gradient', name: 'LiveG', type: 'linear', stops: [{ color: '#FFFFFF', at: 0 }, { color: '#000000', at: 100 }] });
await call('create_shape', { x: 10, y: 10, w: 40, h: 40, fill: 'gradient:LiveG@90', name: 'grad' });
for (const [spec, want] of [['gradient:LiveG@-45', 'gradient:LiveG@-45'], ['gradient:LiveG@180', 'gradient:LiveG@180'], ['gradient:LiveG', 'gradient:LiveG']]) {
  await call('modify_items', { refs: 'name:grad', fill: spec });
  await call('get_items', { refs: 'name:grad', props: ['fill'] }, { check: (v) => assert(v.items[0].fill === want, `gradient angle: ${spec} → ${v.items[0].fill}`) });
}
await call('delete_items', { refs: 'name:grad' });

// bugs.md #2: a region compared with a page reference lines up (the same part of the reference is cut)
await call('export', { format: 'png', artboards: [0], path: join(tmp, 'page.png'), scale: 2 });
await call('preview', { artboard: 0, region: [100, 0, 100, 100], reference: join(tmp, 'page.png') }, { check: (v) =>
  assert(v.rmse < 0.06, 'region vs page reference lines up: rmse ' + v.rmse) });

// bugs.md V1: preview {image} of a PDF page renders through Illustrator, closes the PDF, leaves this document active
await call('export', { format: 'pdf', artboards: [0], path: join(tmp, 'page.pdf') });
await call('preview', { image: join(tmp, 'page.pdf'), grid: true, sample: [[150, 50], [500, 500]] }, { check: (v) => {
  assert(v.pages === 1 && v.page_size.join() === '200,100', 'pdf page size in session units: ' + JSON.stringify(v.page_size));
  assert(v.samples[0].hex === '#000000' && v.samples[1].outside, 'pdf samples: ' + JSON.stringify(v.samples));
} });
await call('documents', { action: 'list' }, { check: (v) => {
  assert(v.filter((d) => /page\.pdf/.test(d.name)).length === 0, 'the PDF was closed');
  assert(v.find((d) => d.active).name === 'live-release', 'live-release is active again');
} });

// bugs.md #7, #10: a re-runnable batch (clear the layer, add it, draw) works on the first run and the second
for (const run of [1, 2]) {
  await call('batch', { steps: [
    { tool: 'delete_items', args: { refs: 'layer:rerun' } },
    { tool: 'layers', args: { action: 'add', name: 'rerun', printable: false } },
    { tool: 'create_shape', args: { shape: 'rect', x: 0, y: 0, w: 10, h: 10, fill: '#00FF00', layer: 'rerun' } },
  ] }, { check: (v) => assert(v.failed_step === undefined, `re-runnable batch, run ${run}: ` + JSON.stringify(v).slice(0, 300)) });
}
await call('layers', { action: 'list' }, { check: (v) => {
  const l = v.layers.filter((x) => x.name === 'rerun');
  assert(l.length === 1 && l[0].items === 1 && l[0].printable === false, 'one layer "rerun" with one item: ' + JSON.stringify(l));
} });

// bugs.md #13: with a locked active layer (a locked reference layer), tools still create on the layer they're given
await call('layers', { action: 'add', name: 'locked ref', locked: true }); // add activates it
await call('batch', { steps: [
  { tool: 'create_shape', args: { x: 0, y: 0, w: 10, h: 10, fill: '#00FF00', layer: 'new from shape' } },
  { tool: 'create_path', args: { points: [[0, 0], [10, 0], [5, 10]], closed: true, fill: '#00FF00', layer: 'new from path' } },
  { tool: 'create_text', args: { text: 'x', x: 0, y: 20, layer: 'new from text' } },
  { tool: 'create_shape', args: { x: 20, y: 0, w: 10, h: 10, fill: '#00FF00', layer: 'rerun' } },
] }, { check: (v) => assert(v.failed_step === undefined, 'creating with a locked active layer: ' + JSON.stringify(v).slice(0, 300)) });

// bugs.md #14: a gradient on live text renders black, so it is refused with a hint (and skipped with a warning in groups)
await call('create_text', { text: 'grad', x: 10, y: 80, fill: 'gradient:LiveG@90', layer: 'new from text' }, { expectError: true,
  check: (v) => assert(/outline_text/.test(typeof v === 'string' ? v : JSON.stringify(v)), 'gradient text refused with a hint: ' + JSON.stringify(v).slice(0, 200)) });
await call('modify_items', { refs: 'layer:new from text', fill: 'gradient:LiveG' }, { check: (v, r) =>
  assert(/kept its fill/.test(JSON.stringify(r)), 'modify_items warns about text it skipped: ' + JSON.stringify(r).slice(0, 300)) });

await call('documents', { action: 'close', discard: true });
rmSync(tmp, { recursive: true, force: true });
process.exitCode = (await done()) ? 1 : 0;
