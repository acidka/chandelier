#!/usr/bin/env node
// Live checks for 0.2.1 (needs a running Illustrator; works only in documents it creates, closes them unsaved):
// preflight {tokens, contrast} brand checks; export {variants} (layer sets) and screen assets {each, scales}.
//   npm run build && node test/live-checks.mjs
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect, assert } from './live-lib.mjs';

const { call, done } = await connect('aia-live-checks');

// ── preflight: brand tokens and contrast in a CMYK document ──
await call('documents', { action: 'new', width: 300, height: 200, title: 'aia-checks-tokens' });
await call('swatches', { action: 'add', name: 'Navy', color: 'cmyk(100,85,35,30)' });
await call('create_shape', { items: [
  { x: 10, y: 10, w: 40, h: 40, fill: 'swatch:Navy', stroke: 'none', name: 'ok-swatch' },
  { x: 60, y: 10, w: 40, h: 40, fill: 'swatch:Navy@50', stroke: 'none', name: 'ok-tint' },
  { x: 110, y: 10, w: 40, h: 40, fill: 'cmyk(0,100,0,0)', stroke: 'none', name: 'off-colour' },
  { x: 160, y: 10, w: 120, h: 60, fill: 'cmyk(100,85,35,60)', stroke: 'none', name: 'dark-ground' },
] });
await call('create_text', { items: [
  { text: 'Fine', x: 10, y: 100, font: 'Arial', size: 12, fill: 'swatch:Navy', name: 'ok-text' },
  { text: 'Wrong font', x: 10, y: 130, font: 'Times New Roman', size: 12, fill: 'swatch:Navy', name: 'off-font' },
  { text: 'Wrong size', x: 10, y: 160, font: 'Arial', size: 13, fill: 'swatch:Navy', name: 'off-size' },
  { text: 'Dark on dark', x: 170, y: 45, font: 'Arial', size: 12, fill: 'swatch:Navy', name: 'dark-on-dark' },
] });
// regression (0.2.1): a tint used to change the swatch itself, so later plain "swatch:Navy" came out at 50 %
await call('get_items', { refs: ['name:ok-text', 'name:ok-swatch', 'name:ok-tint'] }, { check: (v) => {
  const f = Object.fromEntries(v.items.map((i) => [i.name, i.runs ? i.runs[0].fill : i.fill]));
  assert(f['ok-text'] === 'swatch:Navy' && f['ok-swatch'] === 'swatch:Navy' && f['ok-tint'] === 'swatch:Navy@50', 'tints stay per item: ' + JSON.stringify(f));
} });
const tokens = { colors: ['swatch:Navy', 'cmyk(100,85,35,60)'], fonts: ['Arial'], sizes: [12] };
await call('preflight', { tokens, ignore: ['live_text'] }, { check: (v) => {
  const c = v.checks.off_token;
  const names = (c?.items ?? []).map((i) => i.name).sort();
  assert(names.join() === 'off-colour,off-font,off-size', 'off_token flags exactly the three: ' + JSON.stringify(c?.items));
  assert(c.severity === 'warning', 'off_token is a warning');
  assert(c.items.find((i) => i.name === 'off-font').detail === 'font TimesNewRomanPSMT', 'font detail ' + JSON.stringify(c.items));
  assert(!v.checks.low_contrast, 'no contrast check in CMYK by default');
} });
await call('preflight', { contrast: true, ignore: ['live_text'] }, { check: (v) => {
  const names = (v.checks.low_contrast?.items ?? []).map((i) => i.name);
  assert(names.join() === 'dark-on-dark', 'contrast:true checks CMYK too: ' + names);
  assert(!v.checks.off_token, 'no token check without tokens');
} });
await call('documents', { action: 'close', discard: true });

// ── export: layer variants and screen assets ──
const dir = mkdtempSync(join(tmpdir(), 'aia-checks-'));
const pngWidth = (f) => readFileSync(f).readUInt32BE(16);
await call('documents', { action: 'new', width: 200, height: 100, title: 'aia-checks-export' });
await call('create_text', { text: 'ARTWORK', x: 10, y: 40, size: 14, layer: 'Art', name: 'art-text' });
await call('create_text', { text: 'CUTLINE', x: 10, y: 80, size: 14, layer: 'Dieline', name: 'die-text' });
await call('create_shape', { items: [
  { x: 120, y: 10, w: 20, h: 20, fill: '#1e2a44', layer: 'Art', name: 'icon-a' },
  { x: 150, y: 10, w: 30, h: 15, fill: '#c0392b', layer: 'Art', name: 'icon-b' },
] });
await call('export', { format: 'svg', svg_text: 'text', path: join(dir, 'box.svg'), variants: [{ name: 'print', hide: ['Dieline'] }, { name: 'dieline', show: ['Dieline'], hide: ['Art'] }] }, { check: (v) => {
  assert(v.files.length === 2 && v.files[0].variant === 'print' && v.files[1].variant === 'dieline', 'two variant files ' + JSON.stringify(v.files));
  const textOf = (f) => readFileSync(join(dir, f), 'utf8').replace(/<[^>]+>/g, ''); // kerning splits words into <tspan>s
  const print = textOf('box-print.svg'), die = textOf('box-dieline.svg');
  assert(/ARTWORK/.test(print) && !/CUTLINE/.test(print), 'print variant: art only');
  assert(/CUTLINE/.test(die) && !/ARTWORK/.test(die), 'dieline variant: dieline only');
} });
await call('layers', { action: 'list' }, { check: (v) => {
  const L = Object.fromEntries((v.layers ?? v).map((l) => [l.name, l]));
  assert(L.Art.visible !== false && L.Dieline.visible !== false && L.Art.printable !== false && L.Dieline.printable !== false, 'layers restored ' + JSON.stringify(v).slice(0, 300));
} });
await call('export', { format: 'svg', path: join(dir, 'bad.svg'), variants: [{ name: 'x', hide: ['NoSuchLayer'] }] }, { expectError: true });
await call('export', { format: 'png', refs: ['name:icon-a', 'name:icon-b'], each: true, scales: [1, 2], path: join(dir, 'icons') }, { check: (v) => {
  const names = v.files.map((f) => f.path.split(/[\\/]/).pop()).sort();
  assert(names.join() === 'icon-a.png,icon-a@2x.png,icon-b.png,icon-b@2x.png', 'asset names ' + names);
  const a1 = pngWidth(join(dir, 'icons', 'icon-a.png')), a2 = pngWidth(join(dir, 'icons', 'icon-a@2x.png'));
  assert(a2 === 2 * a1 && Math.abs(a1 - 20) <= 1, `@2x is twice as wide: ${a1} → ${a2}`);
  assert(existsSync(join(dir, 'icons', 'icon-b@2x.png')), 'icon-b@2x written');
} });
await call('documents', { action: 'close', discard: true });

process.exit((await done()) ? 1 : 0);
