#!/usr/bin/env node
// Live checks for the short build loop (needs a running Illustrator; works only in a document it creates):
// documents new {units} sets the session units, preview {more, preflight, info} is one check call,
// documents save {export, close} saves, exports and closes in one call.
//   npm run build && node test/live-finish.mjs
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { connect, assert } from './live-lib.mjs';

const { call, done } = await connect('live-finish');
const tmp = mkdtempSync(join(tmpdir(), 'chandelier-finish-'));
const ai = join(tmp, 'finish.ai'), png = join(tmp, 'finish-a.png'), pdf = join(tmp, 'finish.pdf');

await call('configure', { units: 'pt' });
let name;
await call('documents', { action: 'new', width: 100, height: 50, units: 'mm', artboards: 2, bleed: 3, title: 'live-finish', artboard_names: ['a', 'b'] },
  { check: (v) => { name = v.name; return true; } });
await call('status', {}, { check: (v) => {
  assert(v.settings.units === 'mm', 'session units are mm after documents new {units}');
  assert(typeof v.mrap?.retried === 'number' && typeof v.mrap?.failed === 'number', 'status reports MRAP retries');
} });

// a failed build leaves no empty new document behind (M2 run A3)
let before;
await call('documents', { action: 'list' }, { check: (v) => { before = v.length; } });
await call('run_script', { code: 'app.documents.add(); throw new Error("build failed");' }, { expectError: true,
  check: (_v, r) => assert(/Closed .*the failed call created it/.test(JSON.stringify(r.content)), 'warns that it closed the empty document') });
await call('documents', { action: 'list' }, { check: (v) => assert(v.length === before, `no extra document (${v.length} vs ${before})`) });
await call('documents', { action: 'activate', name });
await call('create_shape', { shape: 'rect', x: 10, y: 10, w: 20, h: 20, fill: 'cmyk(0,100,100,0)' },
  { check: (v) => assert(Math.abs(v.items[0].box[2] - 20) < 0.01, 'rect is 20 mm wide') });

await call('preview', { artboard: 0, max_px: 300, more: [1], preflight: true, info: true }, { check: (_v, r) => {
  assert(r.content.filter((c) => c.type === 'image').length === 2, 'two images (artboard 0 and 1)');
  const t = r.content.filter((c) => c.type === 'text').map((c) => c.text);
  assert(t.some((x) => x.startsWith('preflight: {')), 'preflight result included');
  assert(t.some((x) => x.startsWith('document_info: {')), 'document_info included');
} });

await call('documents', { action: 'list', close: true }, { expectError: true });
await call('documents', { action: 'save', path: ai, export: [{ format: 'png', path: png, artboards: [0] }, { format: 'pdf', path: pdf, artboards: 'all' }], close: true }, { check: (v) => {
  assert(v.saved?.path && v.exported?.length === 2 && v.closed?.closed === v.saved.name, 'saved, 2 exports, closed');
  assert(existsSync(ai) && existsSync(png) && existsSync(pdf), 'files on disk');
  assert(v.exported[1].pages === 2, 'pdf has 2 pages');
  assert(!v.closed.open.includes(v.saved.name) && v.saved.renamed_from === name, 'document no longer open');
} });

rmSync(tmp, { recursive: true, force: true });
process.exitCode = (await done()) ? 1 : 0;
