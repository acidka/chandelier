#!/usr/bin/env node
// Live checks for the 0.1 release (needs a running Illustrator; works only in a document it creates):
// preview {region} measured from a given artboard, SVG export clipped to the artboard, preflight low_contrast.
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

await call('documents', { action: 'close', discard: true });
rmSync(tmp, { recursive: true, force: true });
process.exitCode = (await done()) ? 1 : 0;
