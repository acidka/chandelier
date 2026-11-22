#!/usr/bin/env node
// Live checks for multi-artboard layout fixes (needs a running Illustrator; works only in a document it creates):
// spacing = gap between trim edges with bleed (C23), batch step `artboard`, AIA.at, renders hide non-printing
// layers (C22), preview {reference, save_to} also saves the plain render.
//   npm run build && node test/live-layout.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guard } from './live-lib.mjs';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { decodePng } from '../dist/image.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const c = new Client({ name: 'live-layout', version: '0' });
await c.connect(new StdioClientTransport({ command: process.execPath, args: [join(ROOT, 'dist/index.js')], stderr: 'inherit' }));
guard(c); // abort if another document becomes active mid-run
const call = async (name, args = {}) => {
  const r = await c.callTool({ name, arguments: args });
  const t = r.content.find((x) => x.type === 'text')?.text ?? '';
  if (r.isError) throw new Error(`${name}: ${t}`);
  try { return JSON.parse(t); } catch { return t; }
};
let failed = 0;
const check = (ok, what, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok ? '' : ' — got ' + JSON.stringify(got)}`); if (!ok) failed++; };
const near = (a, b, tol = 0.2) => Math.abs(a - b) <= tol;
const tmp = mkdtempSync(join(tmpdir(), 'chandelier-layout-'));

await call('configure', { units: 'mm', origin: 'artboard', artboard: null });
const doc = await call('documents', { action: 'new', width: 100, height: 50, artboards: 3, columns: 3, spacing: 20, bleed: 3, title: 'live-layout' });
try {
  const ab = (await call('document_info', {})).artboards;
  check(near(ab[1].rect[0] - (ab[0].rect[0] + ab[0].rect[2]), 20), 'spacing 20 mm with 3 mm bleed = 20 mm trim gap', ab.map((a) => a.rect));

  // batch step artboard: [5,5] on artboard 2 lands 5 mm inside its top-left
  const b = await call('batch', { steps: [{ tool: 'create_shape', args: { shape: 'rect', x: 5, y: 5, w: 10, h: 10, fill: 'gray(80)', name: 'on2' }, artboard: 2 }] });
  const boxOn = async (name, k) => { await call('configure', { artboard: k }); const r = await call('get_items', { refs: 'name:' + name }); return (r.items ?? r)[0].box; };
  const box = await boxOn('on2', 2);
  check(near(box[0], 5) && near(box[1], 5), 'batch step artboard: box relative to artboard 2', box);
  const b0 = await boxOn('on2', 0);
  check(near(b0[0], ab[2].rect[0] + 5), 'same item in artboard-0 frame', b0);

  // AIA.at
  const r = await call('run_script', { code: 'var t; AIA.at(1, function () { t = AIA.rect(2, 3, 4, 4, {name: "at1"}); }); return AIA.box(t);' });
  const at = await boxOn('at1', 1);
  check(near(at[0], 2) && near(at[1], 3), 'AIA.at(1) places relative to artboard 1', [r, at]);
  await call('configure', { artboard: 0 });

  // non-printing layer is not rendered by preview (imageCapture and the exportFile fallback) nor by PNG export
  await call('run_script', { code: 'var L = AIA.layer("np"); AIA.rect(0, 0, 100, 50, {fill: "gray(100)", parent: L}); L.printable = false; return 1;' });
  const darkness = (file) => { const p = decodePng(readFileSync(file)); let s = 0; for (let i = 0; i < p.rgb.length; i += 3) s += p.rgb[i]; return s / (p.rgb.length / 3); };
  for (const [what, args] of [['imageCapture', { max_px: 400 }], ['exportFile fallback', { max_px: 100 }]]) {
    const f = join(tmp, `pv-${args.max_px}.png`);
    await call('preview', { artboard: 0, ...args, save_to: f });
    check(darkness(f) > 200, `preview (${what}) hides the non-printing layer`, darkness(f));
  }
  const ex = await call('export', { format: 'png', artboards: [0], path: join(tmp, 'ex.png') });
  const exPath = ex.files[0].path;
  check(existsSync(exPath) && darkness(exPath) > 200, 'export png hides the non-printing layer', exPath);
  const lay = await call('layers', { action: 'list' });
  check(lay.layers.find((l) => l.name === 'np') && !lay.layers.find((l) => l.name === 'np').hidden, 'non-printing layer visible again afterwards', lay.layers);

  // preview {reference, save_to} saves the comparison and the plain render
  const pv = await call('preview', { artboard: 0, max_px: 200, save_to: join(tmp, 'ref0.png') });
  const cmp = await call('preview', { artboard: 0, max_px: 200, reference: join(tmp, 'ref0.png'), save_to: join(tmp, 'cmp.png') });
  check(existsSync(join(tmp, 'cmp.png')) && existsSync(join(tmp, 'cmp.preview.png')), 'preview reference + save_to also saves <name>.preview.png', [pv, cmp]);
} finally {
  await call('documents', { action: 'close', name: doc.name, discard: true });
  await call('configure', { units: 'pt', artboard: null });
  await c.close();
  rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
