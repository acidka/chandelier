#!/usr/bin/env node
// Live checks for 0.3 production automation (needs a running Illustrator; works only in documents and files it
// creates, in a temp folder): data_merge (dry run, artboards, grid, files, remove_template), swatches recolor and
// .ase import, batch {files} (copies, exports, dry run, failures, already-open files, in place).
//   npm run build && node test/live-production.mjs   (ONLY=merge|recolor|files runs one part: Illustrator 2027 in the
//   Windows VM crashes after many operations, quirk C30)
import { mkdtempSync, writeFileSync, existsSync, statSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodePng } from '../dist/image.js';
import { writeAse } from '../dist/ase.js';
import { connect, assert } from './live-lib.mjs';

const dir = mkdtempSync(join(tmpdir(), 'aia-live-prod-'));
const { call, done } = await connect('aia-live-production');
const solid = (w, h, r, g, b) => { const rgb = Buffer.alloc(w * h * 3); for (let i = 0; i < w * h; i++) { rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b; } return encodePng({ w, h, rgb }); };
mkdirSync(join(dir, 'img'));
writeFileSync(join(dir, 'img', 'red.png'), solid(40, 20, 220, 30, 30));
writeFileSync(join(dir, 'img', 'blue.png'), solid(20, 40, 30, 30, 220));
const script = (code) => call('run_script', { code });
const part = (p) => !process.env.ONLY || process.env.ONLY === p;

// ── data_merge ──
if (part('merge')) {
await call('documents', { action: 'new', width: 200, height: 120, title: 'aia-merge' });
await call('swatches', { action: 'add', name: 'Gold', color: 'cmyk(0,20,90,10)' });
await call('create_shape', { items: [
  { x: 0, y: 0, w: 200, h: 120, fill: 'gray(5)', stroke: 'none', name: 'Bg' },
  { x: 10, y: 90, w: 20, h: 20, fill: 'gray(50)', stroke: 'none', name: '{{color}}' },
] });
await call('create_text', { items: [
  { text: 'Hello {{name}}, from {{city}}!', x: 10, y: 30, font: 'Arial', size: 10, name: 'Greeting' },
  { text: 'VIP', x: 10, y: 60, font: 'Arial Bold', size: 14, name: '{{?vip}}' },
] });
await call('place', { path: join(dir, 'img', 'red.png'), x: 140, y: 10, w: 50, name: '{{photo}}' });
writeFileSync(join(dir, 'people.csv'), '﻿name,city,color,vip,photo\r\n"Андрій","Kyiv, UA",swatch:Gold,yes,img/red.png\r\nMaria,Lviv,"cmyk(100,0,0,0)",no,img/blue.png\r\n"Jo ""J"" Doe",Odesa,swatch:Gold,,img/missing.png\r\n');
await call('data_merge', { data: join(dir, 'people.csv'), dry_run: true }, { check: (v) => {
  assert(v.rows === 3 && v.missing_in_data.length === 0 && v.unused_columns.length === 0, 'dry run report ' + JSON.stringify(v));
  const as = Object.fromEntries(v.template.fields.map((f) => [f.field, f.as.join()]));
  assert(as.name === 'text' && as.city === 'text' && as.color === 'color' && as.vip === 'show' && as.photo === 'image', 'field kinds ' + JSON.stringify(as));
} });
await call('document_info', { checks: false }, { check: (v) => assert(v.artboards.length === 1, 'dry run changed nothing') });
await call('data_merge', { data: join(dir, 'people.csv'), name: 'Card {name}' }, { check: (v) => {
  assert(v.rows === 3 && v.artboards === 3 && v.first.i === 1 && v.last.i === 3 && v.first.name === 'Card Андрій', 'artboards ' + JSON.stringify(v));
  assert(v.problems?.length === 1 && v.problems[0].row === 3 && v.problems[0].field === 'photo', 'missing image reported ' + JSON.stringify(v.problems));
} });
await script(`var o = {}; for (var k = 0; k <= 3; k++) { var it = AIA.refs("artboard:" + k), r = {}; for (var i = 0; i < it.length; i++) { var x = it[i];
  if (x.typename === "TextFrame") r[x.name] = x.contents + (x.hidden ? " [hidden]" : "");
  if (x.typename === "PlacedItem") r.photo = decodeURI(x.file.name) + (x.hidden ? " [hidden]" : "");
  if (x.name === "color") r.color = AIA.colorStr(x.fillColor); } o[k] = r; } return o;`).then((r) => {
  const v = JSON.parse(r.content[0].text).result;
  assert(v[0].Greeting === 'Hello {{name}}, from {{city}}!', 'template unchanged ' + JSON.stringify(v[0]));
  assert(v[1].Greeting === 'Hello Андрій, from Kyiv, UA!' && v[1].vip === 'VIP' && v[1].photo === 'red.png' && v[1].color === 'swatch:Gold', 'row 1 ' + JSON.stringify(v[1]));
  assert(v[2].vip === 'VIP [hidden]' && v[2].photo === 'blue.png' && v[2].color === 'cmyk(100,0,0,0)', 'row 2 ' + JSON.stringify(v[2]));
  assert(v[3].Greeting === 'Hello Jo "J" Doe, from Odesa!' && v[3].vip === 'VIP [hidden]', 'row 3 (quotes, empty value) ' + JSON.stringify(v[3]));
  console.log('ok   merged contents', JSON.stringify(v[1]));
});
// the relinked image keeps its box (fit inside, centred): the template's photo box is 50 × 25
await script('var p = AIA.refs("artboard:2"), b; for (var i = 0; i < p.length; i++) if (p[i].typename === "PlacedItem") b = p[i]; return AIA.at(2, function () { return AIA.box(b); });').then((r) => {
  const b = JSON.parse(r.content[0].text).result;
  assert(Math.abs(b[3] - 25) < 0.1 && Math.abs(b[2] - 12.5) < 0.1 && Math.abs(b[0] - 158.75) < 0.2 && Math.abs(b[1] - 10) < 0.2, 'blue (1:2) fits the 50×25 box, centred ' + b);
});
// grid: 2 × 1 copies per page (each copy 100 pt to the right), 3 rows → 2 pages; rows given inline
await call('data_merge', { rows: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], mode: 'grid', grid: { cols: 2, rows: 1, dx: 100, dy: 0 }, refs: 'name:Greeting', artboard: 0 }, { check: (v) => assert(v.artboards === 2 && v.warnings?.length >= 1, 'grid pages + missing fields warned ' + JSON.stringify(v)) });
await script('var p = AIA.refs("artboard:4"), t = []; for (var i = 0; i < p.length; i++) t.push(p[i].contents); return t.sort();').then((r) => {
  const t = JSON.parse(r.content[0].text).result;
  assert(t.length === 2 && t[0].startsWith('Hello A') && t[1].startsWith('Hello B'), 'grid page 1 holds rows A and B ' + JSON.stringify(t));
});
// files: one PNG per row, the document left as it was
await call('data_merge', { data: join(dir, 'people.csv'), limit: 2, mode: 'files', export: { format: 'png', path: join(dir, 'cards', 'card-{name}.png'), dpi: 36 } }, { check: (v) => {
  assert(v.rows === 2 && v.files.length === 2 && v.files.every((f) => existsSync(f)) && v.files[0].endsWith('card-Андрій.png'), 'files ' + JSON.stringify(v));
} });
await call('document_info', { checks: false }, { check: (v) => assert(v.artboards.length === 6, 'files mode added no artboards ' + v.artboards.length) });
await script('var it = AIA.refs("artboard:0"), h = 0; for (var i = 0; i < it.length; i++) if (it[i].hidden) h++; return [it.length, h];').then((r) => {
  const [n, h] = JSON.parse(r.content[0].text).result;
  assert(n === 5 && h === 0, `template restored after files mode: ${n} items, ${h} hidden`);
});
await call('documents', { action: 'close', discard: true });
// remove_template: only the merged artboards stay
await call('documents', { action: 'new', width: 100, height: 50, title: 'aia-merge-2' });
await call('create_text', { text: 'No. {{n}}', x: 10, y: 30, size: 12, font: 'Arial', name: 'Num' });
await call('data_merge', { rows: [{ n: 1 }, { n: 2 }], remove_template: true }, { check: (v) => assert(v.removed_template_artboard === 0 && v.first.i === 0 && v.last.i === 1, 'remove_template ' + JSON.stringify(v)) });
await script('var o = []; for (var k = 0; k < AIA.doc().artboards.length; k++) { var it = AIA.refs("artboard:" + k); o.push(it.length + ":" + it[0].contents); } return o;').then((r) => {
  const o = JSON.parse(r.content[0].text).result;
  assert(o.join('|') === '1:No. 1|1:No. 2', 'two artboards, template gone ' + o.join('|'));
});
await call('data_merge', { rows: [{ x: 1 }] }, { expectError: true }); // no placeholders left: nothing to fill
await call('documents', { action: 'close', discard: true });

}

// ── swatches: import (.ase) and recolor ──
if (part('recolor')) {
await call('documents', { action: 'new', width: 300, height: 200, title: 'aia-recolor' });
writeFileSync(join(dir, 'brand.ase'), writeAse([
  { name: 'Brand Red', model: 'CMYK', values: [0, 0.95, 0.85, 0], type: 0, group: 'Brand' },
  { name: 'Brand Blue', model: 'CMYK', values: [1, 0.7, 0, 0], type: 0, group: 'Brand' },
  { name: 'Brand Spot', model: 'RGB ', values: [0, 0.5, 0.25], type: 1, group: 'Brand' },
]));
await call('swatches', { action: 'import', path: join(dir, 'brand.ase') }, { check: (v) => assert(v.added === 3, 'imported ' + JSON.stringify(v)) });
await call('swatches', { action: 'list', group: 'Brand' }, { check: (v) => {
  const k = Object.fromEntries(v.swatches.map((s) => [s.name, s.kind + ' ' + s.color]));
  assert(k['Brand Red'] === 'global cmyk(0,95,85,0)' && k['Brand Spot']?.startsWith('spot'), 'kinds and colours ' + JSON.stringify(k));
} });
await call('swatches', { action: 'import', path: join(dir, 'brand.ase') }, { check: (v) => assert(v.updated === 3 && v.added === 0, 're-import updates') });
await call('swatches', { action: 'add', name: 'Old Red', color: 'cmyk(5,90,80,0)' });
await call('swatches', { action: 'add', name: 'Fade', kind: 'gradient', stops: [{ color: 'cmyk(0,90,85,5)' }, { color: 'cmyk(95,70,5,0)' }] });
await call('create_shape', { items: [
  { x: 10, y: 10, w: 40, h: 40, fill: 'cmyk(0,90,80,5)', stroke: 'cmyk(95,65,5,0)', stroke_width: 2, name: 'near' },
  { x: 60, y: 10, w: 40, h: 40, fill: 'cmyk(0,0,100,0)', stroke: 'none', name: 'yellow' },
  { x: 110, y: 10, w: 40, h: 40, fill: 'swatch:Old Red@40', stroke: 'none', name: 'tint' },
  { x: 160, y: 10, w: 40, h: 40, fill: 'gradient:Fade', stroke: 'none', name: 'grad' },
] });
await call('create_text', { text: 'Red words', x: 10, y: 90, font: 'Arial', size: 14, fill: 'cmyk(0,92,82,2)', name: 'words' });
const fills = async () => JSON.parse((await call('find_items', { fields: ['name', 'fill', 'stroke'] })).content[0].text);
await call('swatches', { action: 'recolor', to: ['group:Brand'], dry_run: true }, { check: (v) => {
  const m = Object.fromEntries(v.colors.map((c) => [c.from, c.to]));
  assert(v.dry_run && m['cmyk(0,90,80,5)'] === 'Brand Red' && m['cmyk(95,65,5,0)'] === 'Brand Blue' && v.unmatched.some((u) => u.color === 'cmyk(0,0,100,0)'), 'dry run plan ' + JSON.stringify(v));
} });
await fills().then((v) => assert(v.items.find((i) => i.name === 'near').fill === 'cmyk(0,90,80,5)', 'dry run changed nothing ' + JSON.stringify(v)));
await call('swatches', { action: 'recolor', to: ['group:Brand'] }, { check: (v) => assert(v.changed >= 5 && v.gradients === 1, 'recolor ' + JSON.stringify(v)) });
await fills().then((v) => {
  const by = Object.fromEntries((v.items ?? v).map((i) => [i.name, i]));
  assert(by.near.fill === 'swatch:Brand Red' && by.near.stroke === 'swatch:Brand Blue', 'paths ' + JSON.stringify(by.near));
  assert(by.yellow.fill === 'cmyk(0,0,100,0)', 'far colour untouched');
  assert(by.tint.fill === 'swatch:Brand Red@40', 'tint kept ' + by.tint.fill);
  assert(by.words.fill === 'swatch:Brand Red', 'text run ' + by.words.fill);
});
await call('swatches', { action: 'list', kind: 'gradient' }, { check: (v) => { const f = v.swatches.find((s) => s.name === 'Fade'); assert(f.stops[0].color === 'swatch:Brand Red' && f.stops[1].color === 'swatch:Brand Blue', 'gradient stops ' + JSON.stringify(f)); } });
await call('swatches', { action: 'recolor', map: { 'cmyk(0,0,100,0)': 'swatch:Brand Spot' } }, { check: (v) => assert(v.changed === 1, 'map ' + JSON.stringify(v)) });
await fills().then((v) => assert((v.items ?? v).find((i) => i.name === 'yellow').fill === 'swatch:Brand Spot', 'mapped'));
await call('swatches', { action: 'recolor', to: ['Nope'] }, { expectError: true });
await call('documents', { action: 'close', discard: true });

}

// ── batch {files}: two scratch files, never anything else ──
if (part('files')) {
const src = join(dir, 'src'), out = join(dir, 'out'); mkdirSync(src);
for (const n of ['a', 'b']) {
  await call('documents', { action: 'new', width: 100, height: 100, title: 'aia-files-' + n });
  await call('create_shape', { x: 10, y: 10, w: 50, h: 50, fill: 'gray(50)', stroke: 'none', name: 'Box' });
  await call('documents', { action: 'save', path: join(src, n + '.ai'), close: true });
}
const mtime = () => ['a', 'b'].map((n) => statSync(join(src, n + '.ai')).mtimeMs).join();
const before = mtime();
const steps = [{ tool: 'modify_items', args: { refs: 'name:Box', fill: 'cmyk(100,0,0,0)' } }];
await call('batch', { files: [join(src, '*.ai')], steps, dry_run: true }, { check: (v) => assert(v.files === 2 && v.ok === 2 && v.dry_run && !v.results[0].saved, 'dry run ' + JSON.stringify(v)) });
await call('batch', { files: [src], steps }, { expectError: true }); // copy without out_dir
await call('batch', { files: [src], steps, out_dir: src }, { expectError: true }); // copies onto the originals
await call('batch', { files: [join(src, '*.ai')], steps, out_dir: out, export: [{ format: 'png', path: join(dir, 'png', '{name}.png'), dpi: 36 }] }, { check: (v) => {
  assert(v.ok === 2 && v.results.every((r) => r.saved && r.saved.startsWith(out) && r.exported?.length === 1 && existsSync(r.exported[0])), 'copies + exports ' + JSON.stringify(v));
} });
assert(mtime() === before, 'originals untouched');
await call('documents', { action: 'list' }, { check: (v) => assert(!v.some((d) => /^[ab]\.ai$/.test(d.name)), 'all files closed ' + JSON.stringify(v)) });
await call('batch', { files: [out], steps: [{ tool: 'modify_items', args: { refs: 'name:Nope', fill: 'none' } }], save: 'none' }, { expectError: true, check: (v) => assert(v.failed === 2 && v.results[0].error.step === 0, 'step failure per file ' + JSON.stringify(v)) });
await call('documents', { action: 'open', path: join(out, 'a.ai') });
await call('get_items', { refs: 'name:Box', fields: ['fill'] }, { check: (v) => assert(JSON.stringify(v).includes('cmyk(100,0,0,0)'), 'the copy has the change ' + JSON.stringify(v)) });
await call('batch', { files: [out], steps, save: 'in_place' }, { check: (v) => assert(v.ok === 1 && v.skipped === 1 && /already open/.test(v.results.find((r) => r.skipped).skipped), 'open file skipped ' + JSON.stringify(v)) });
await call('documents', { action: 'close', discard: true });
assert(readdirSync(out).sort().join() === 'a.ai,b.ai', 'out holds the two copies');
}

console.log('files in', dir);
process.exit((await done()) ? 1 : 0);
