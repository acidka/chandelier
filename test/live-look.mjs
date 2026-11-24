#!/usr/bin/env node
// Live checks for 0.4 look and print depth (needs a running Illustrator; works only in documents it creates, files in a
// temp folder): effects (every type, clear), path_ops trap, swatches convert, export {output_intent}, preview
// {reference} differences.   npm run build && node test/live-look.mjs   (ONLY=effects|print|diff runs one part)
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect, assert } from './live-lib.mjs';

const dir = mkdtempSync(join(tmpdir(), 'aia-live-look-'));
const { call, done } = await connect('aia-live-look');
const part = (p) => !process.env.ONLY || process.env.ONLY === p;
const J = (r) => JSON.parse(r.content.find((c) => c.type === 'text').text);

// ── effects ──
if (part('effects')) {
  await call('documents', { action: 'new', width: 400, height: 260, title: 'aia-look-fx' });
  const types = ['drop_shadow', 'outer_glow', 'inner_glow', 'round_corners', 'feather', 'blur', 'offset', 'roughen', 'zigzag', 'pucker_bloat', 'transform'];
  await call('create_shape', { items: types.map((t, i) => ({ x: 20 + (i % 6) * 62, y: 30 + Math.floor(i / 6) * 110, w: 40, h: 40, fill: 'cmyk(100,70,0,0)', stroke: 'none', name: t })) });
  const params = { drop_shadow: { x: 4, y: 4, blur: 2, color: 'cmyk(0,100,100,0)' }, outer_glow: { blur: 6, color: '#ffcc00', blend: 'normal' }, inner_glow: { blur: 6 },
    round_corners: { radius: 12 }, feather: { radius: 6 }, blur: { radius: 2 }, offset: { distance: 5, joins: 'round' }, roughen: { size: 3 }, zigzag: { size: 3, ridges: 5, smooth: true },
    pucker_bloat: { amount: 40 }, transform: { y: 20, copies: 1 } };
  const grows = { drop_shadow: 1, outer_glow: 1, offset: 1, transform: 1, blur: 1 };
  await call('batch', { steps: types.map((t) => ({ tool: 'effects', args: { refs: 'name:' + t, add: [{ type: t, ...params[t] }] } })) }, { check: (v) => {
    assert(v.completed === types.length && v.failed_step === undefined, 'all effect types applied ' + JSON.stringify(v).slice(0, 300));
    v.results.forEach((r, i) => { const b = r.data.items[0].box; if (grows[types[i]]) assert(b[2] > 40.5 || b[3] > 40.5, `${types[i]} grows the box ${b}`); });
    const tr = v.results[types.indexOf('transform')].data.items[0].box;
    assert(Math.abs(tr[3] - 60) < 0.5 && Math.abs(tr[1] - 140) < 0.5, 'transform y+20 adds a copy BELOW (y down) ' + tr);
  } });
  await call('effects', { refs: 'name:drop_shadow', clear: true }, { check: (v) => assert(v.items[0].box.join() === '20,30,40,40', 'clear removes the shadow ' + v.items[0].box) });
  await call('get_items', { refs: 'name:drop_shadow' }, { check: (v) => assert(v.items[0].fill === 'cmyk(100,70,0,0)', 'clear keeps the fill ' + v.items[0].fill) });
  // raw XML is not checked: Illustrator ignores an unknown effect name silently (malformed XML fails with MRAP)
  await call('effects', { refs: 'name:blur', add: [{ xml: '<LiveEffect name="Adobe Nope"' }] }, { expectError: true });
  await call('effects', { refs: 'name:blur', add: [{ type: 'drop_shadow', color: 'gradient:Nope' }] }, { expectError: true });
  await call('export', { format: 'png', path: join(dir, 'effects.png'), scale: 2 }, { check: (v) => assert(existsSync(v.files[0].path), 'render') });
  // expand bakes them
  await call('path_ops', { op: 'expand', refs: 'name:round_corners' }, { check: (v) => assert(v.count >= 1, 'expanded') });
  await call('documents', { action: 'close', discard: true });
}

// ── print: trap, convert, output intent ──
if (part('print')) {
  await call('documents', { action: 'new', width: 200, height: 120, title: 'aia-look-print' });
  await call('create_shape', { items: [
    { x: 10, y: 10, w: 100, h: 80, fill: 'cmyk(100,80,0,20)', stroke: 'none', name: 'dark' },
    { x: 30, y: 30, w: 40, h: 30, fill: 'cmyk(0,10,100,0)', stroke: 'none', name: 'light' },
    { x: 130, y: 10, w: 40, h: 30, fill: 'cmyk(0,10,100,0)', stroke: 'gray(100)', name: 'stroked' },
  ] });
  await call('create_text', { text: 'Trap', x: 120, y: 80, font: 'Arial Bold', size: 18, fill: 'cmyk(0,10,100,0)', name: 'word' });
  await call('path_ops', { op: 'trap', refs: ['name:light', 'name:stroked', 'name:word'], distance: 0.3 }, { check: (v, r) => {
    assert(v.count === 3, 'trap returns the items');
    assert(/1 path\(s\) not trapped/.test(JSON.stringify(r.content)), 'stroked path skipped with a warning');
  } });
  await call('run_script', { code: 'var p = AIA.find("light"), t = AIA.find("word").textRange.characterAttributes; return [p.stroked, AIA.colorStr(p.strokeColor), p.strokeWidth, p.strokeOverprint, AIA.colorStr(t.strokeColor), t.strokeWeight, t.overprintStroke];' }, { check: (v) => {
    assert(JSON.stringify(v.result) === '[true,"cmyk(0,10,100,0)",0.6,true,"cmyk(0,10,100,0)",0.6,true]', 'trap stroke = own fill, 2 × width, overprint ' + JSON.stringify(v.result));
  } });
  await call('batch', { steps: [{ tool: 'create_shape', args: { x: 0, y: 0, w: 5, h: 5, fill: 'cmyk(0,0,0,0)', name: 'tmp' } }, { tool: 'path_ops', args: { op: 'trap', refs: 'name:dark' } }, { tool: 'delete_items', args: { refs: 'name:nope' } }], rollback: true }, { expectError: true });
  await call('find_items', { name: 'dark' }, { check: (v) => assert(v.total === 1, 'rollback after trap keeps the trapped item (not "created")') });
  // output intent
  const pdf = join(dir, 'fogra.pdf');
  await call('export', { format: 'pdf', path: pdf, output_intent: 'FOGRA39' }, { check: (v) => assert(v.files[0].pdfx === 'PDF/X-4' && /FOGRA39/.test(v.files[0].output_intent), 'output intent ' + JSON.stringify(v.files[0])) });
  await call('export', { format: 'pdf', path: join(dir, 'default.pdf') }, { check: (v) => assert(v.files[0].output_intent, 'the preset\'s own intent is reported ' + JSON.stringify(v.files[0])) });
  await call('export', { format: 'pdf', path: join(dir, 'x.pdf'), output_intent: 'coated' }, { expectError: true, check: (v) => assert(/several CMYK profiles/.test(String(v)), 'ambiguous profile explained') });
  await call('export', { format: 'png', path: join(dir, 'x.png'), output_intent: 'FOGRA39' }, { expectError: true });
  // grayscale conversion of some items
  await call('swatches', { action: 'convert', mode: 'gray', refs: 'name:light' }, { check: (v) => assert(v.converted === 1, 'converted') });
  await call('get_items', { refs: 'name:light' }, { check: (v) => assert(/^(gray\(|cmyk\(0,0,0,)/.test(v.items[0].fill), 'gray now ' + v.items[0].fill) });
  await call('documents', { action: 'close', discard: true });
  // an RGB document → CMYK
  await call('documents', { action: 'new', width: 100, height: 100, color: 'rgb', title: 'aia-look-rgb' });
  await call('create_shape', { x: 10, y: 10, w: 40, h: 40, fill: '#ff6600', stroke: 'none', name: 'orange' });
  await call('swatches', { action: 'convert', mode: 'cmyk' }, { check: (v) => assert(v.document_mode_changed && v.color_space === 'CMYK', 'document now CMYK ' + JSON.stringify(v)) });
  await call('get_items', { refs: 'name:orange' }, { check: (v) => assert(/^cmyk\(/.test(v.items[0].fill), 'item colour CMYK ' + v.items[0].fill) });
  await call('swatches', { action: 'convert', mode: 'lab' }, { expectError: true });
  await call('documents', { action: 'close', discard: true });
}

// ── preview {reference}: differences with kind, shift and items ──
if (part('diff')) {
  await call('documents', { action: 'new', width: 300, height: 200, title: 'aia-look-diff' });
  await call('create_shape', { items: [
    { x: 20, y: 20, w: 60, h: 40, fill: 'cmyk(100,70,0,0)', stroke: 'none', name: 'Moves' },
    { x: 180, y: 30, w: 80, h: 30, fill: 'cmyk(0,95,85,0)', stroke: 'none', name: 'Goes' },
    { x: 20, y: 130, w: 100, h: 40, fill: 'cmyk(0,0,0,80)', stroke: 'none', name: 'Stays' },
  ] });
  const ref = join(dir, 'reference.png');
  await call('export', { format: 'png', path: ref });
  await call('modify_items', { refs: 'name:Moves', x: 32, y: 26 });
  await call('delete_items', { refs: 'name:Goes' });
  await call('create_shape', { x: 180, y: 130, w: 60, h: 40, fill: 'cmyk(60,0,100,0)', stroke: 'none', name: 'New' });
  await call('preview', { reference: ref }, { check: (_v, r) => {
    const s = J({ content: r.content.filter((c) => c.type === 'text') });
    const d = s.differences, by = (k) => d.find((x) => x.kind === k);
    assert(d && d.length >= 3, 'three differences ' + JSON.stringify(d));
    const mv = by('shifted');
    assert(mv && Math.abs(mv.shift[0] - 12) < 1.5 && Math.abs(mv.shift[1] - 6) < 1.5 && mv.items?.some((i) => i.name === 'Moves'), 'moved block: shift ≈ [12, 6] and its item ' + JSON.stringify(mv));
    assert(by('missing'), 'deleted block reported missing ' + JSON.stringify(d));
    const ex = by('extra');
    assert(ex && ex.items?.some((i) => i.name === 'New'), 'new block reported extra with its item ' + JSON.stringify(ex));
    assert(!d.some((x) => x.items?.some((i) => i.name === 'Stays')), 'the unchanged block is not reported');
    console.log('     differences', JSON.stringify(d));
  } });
  await call('documents', { action: 'close', discard: true });
}

console.log('files in', dir);
process.exit((await done()) ? 1 : 0);
