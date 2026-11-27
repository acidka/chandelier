#!/usr/bin/env node
// Reply sizes, reply "full" vs "brief" (src/tools/brief.ts), on fixtures shaped like the runtime's replies:
// node scripts/reply-size.mjs [--json]. Needs npm run build. Tokens ≈ chars / 3.5 (as scripts/schema-size.mjs).
// Exits 1 when a brief shape drifts from the locked keys (docs/research/benchmarks.md § Reply size).
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { project, LIST_MAX } = await import(pathToFileURL(join(root, 'dist/tools/brief.js')).href);
const { BUDGET, clip } = await import(pathToFileURL(join(root, 'dist/tools/respond.js')).href);

const full = { reply: 'full' }, brief = { reply: 'brief' };
const J = (v) => JSON.stringify(v), tok = (n) => Math.round(n / 3.5);
const uuid = (i) => String(10000 + i);
const box = (i) => [20 + (i % 10) * 12.5, 30 + Math.floor(i / 10) * 18.25, 80.5, 14.25];

// get_items
const title = {
  uuid: '10001', type: 'text', name: 'Title', box: [20, 30, 160.5, 28.4], layer: 'Type', parent: 'layer:Type', geo: [20, 30, 160.5, 28.4],
  kind: 'point', contents: 'Лютий 2027', anchor: [20, 52.2], lines: 1, align: 'center', paragraph_style: 'Title',
  runs: [{ text: 'Лютий 2027', font: 'Arial-BoldMT', size: 24, fill: 'cmyk(0,0,0,100)' }],
};
const cells = Array.from({ length: 10 }, (_, i) => ({
  ...title, uuid: uuid(i), name: 'Cell ' + i, contents: 'Day ' + (i + 1) + ' Monday line',
  runs: [{ text: 'Day ' + (i + 1), font: 'Arial-BoldMT', size: 11, fill: 'cmyk(0,0,0,100)' }, { text: ' Monday line', font: 'ArialMT', size: 9, fill: 'cmyk(0,0,0,60)' }],
}));
const pathOf = (n) => ({
  uuid: '20001', type: 'path', name: 'Mark', box: [10, 20, 400, 180], layer: 'Art', parent: 'layer:Art', geo: [10, 20, 400, 180],
  closed: true, points: n, area: 12345.678, fill: 'cmyk(100,85,30,25)', stroke: 'none',
  path: Array.from({ length: n }, (_, i) => (i % 4 === 0 ? [10 + i, 20 + (i % 7)] : { a: [10 + i, 20], in: [8 + i, 18.5], out: [12 + i, 22.5] })),
});

// document_info, shaped like the published calendar file (12 A4 artboards, 5 swatches, 13 paragraph styles)
const months = ['Cover', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const doc = {
  name: 'calendar.ai', path: '/tmp/calendar.ai', colorSpace: 'CMYK', saved: false, units: 'pt',
  bleed: { left: 8.504, top: 8.504, right: 8.504, bottom: 8.504, source: 'xmp' }, activeArtboard: 1,
  artboards: months.map((name, i) => ({ i, name, rect: [i * 860, 0, 841.89, 595.276] })),
  layers: [{ name: 'Type', items: 1468, all: 1468 }, { name: 'Rules', items: 40, all: 40 }, { name: 'Photo', items: 12, all: 12, printable: false }, { name: 'Guides', items: 8, all: 8, visible: false, locked: true }],
  counts: { all: 1528, text: 1468, path: 60 },
  globalSwatches: ['Navy = cmyk(100,85,30,25)', 'Paper = cmyk(0,0,0,0)', 'Red = cmyk(0,100,100,0)', 'Grey = cmyk(0,0,0,40)', 'Gold = cmyk(0,20,60,0)'],
  spotColors: [], swatchCount: 18,
  paragraphStyles: ['Title', 'Month', 'Day', 'Date', 'Week', 'Mini', 'Note', 'Footer', 'Header', 'Caption', 'Label', 'Body', 'Weekend'],
  characterStyles: ['Bold', 'Italic', 'Small', 'Sup'],
  fonts: { ArialMT: 1200, 'Arial-BoldMT': 260, 'MyriadPro-Regular': 8 }, issues: { unstyledText: 0 }, selection: 0,
};

// A.outList: the first 100 of a create step
const made = (count) => ({ count, items: Array.from({ length: Math.min(count, 100) }, (_, i) => ({ uuid: uuid(i), name: 'Dot ' + i, type: 'path', box: box(i) })), ...(count > 100 ? { more: (count - 100) + ' more not listed' } : {}) });

const cases = [
  { label: 'get_items, 1 text frame', tool: 'get_items', data: { count: 1, items: [title] }, keys: ['uuid', 'type', 'name', 'box', 'geo'] },
  { label: 'get_items, 10 text frames, 2 runs each', tool: 'get_items', data: { count: 10, items: cells }, keys: ['uuid', 'type', 'name', 'box', 'geo'] },
  { label: 'get_items, 1 path, 80 anchors (points)', tool: 'get_items', data: { count: 1, items: [pathOf(80)] }, keys: ['uuid', 'type', 'name', 'box', 'geo'] },
  { label: 'get_items, 1 path, 500 anchors (points cap)', tool: 'get_items', data: { count: 1, items: [pathOf(500)] }, keys: ['uuid', 'type', 'name', 'box', 'geo'] },
  { label: 'document_info, calendar-shaped', tool: 'document_info', data: doc, keys: ['name', 'colorSpace', 'units', 'bleed', 'artboardCount', 'counts', 'issues'] },
  { label: 'create step, 100 of 1 468 listed (outList)', tool: 'create_shape', data: made(1468), keys: ['uuid', 'box'] },
];

let drift = 0;
const rows = cases.map((c) => {
  const b = J(c.data), a = J(project(c.tool, structuredClone(c.data), {}, brief));
  const out = project(c.tool, structuredClone(c.data), {}, brief);
  const got = c.tool === 'document_info' ? Object.keys(out) : [...new Set(out.items.flatMap((i) => Object.keys(i)))];
  if (J(got) !== J(c.keys)) { drift++; console.error(`drift: ${c.label}: ${J(got)} ≠ ${J(c.keys)}`); }
  if (c.tool !== 'document_info' && c.tool !== 'get_items' && out.items.length !== Math.min(LIST_MAX, c.data.items.length)) { drift++; console.error(`drift: ${c.label}: ${out.items.length} items`); }
  if (J(project(c.tool, structuredClone(c.data), {}, full)) !== b) { drift++; console.error(`drift: ${c.label}: reply "full" changed the data`); }
  return { label: c.label, before: b.length, after: a.length };
});

// a batch of 4 such create steps: clipped today, complete when brief
const step = () => ({ ok: true, data: made(367) });
const batchFull = { completed: 4, total: 4, results: [step(), step(), step(), step()] };
const batchBrief = { ...batchFull, results: batchFull.results.map((r) => ({ ok: true, data: project('create_shape', r.data, {}, brief) })) };
const sent = clip(J(batchFull)), sentBrief = clip(J(batchBrief));
if (sentBrief.length > BUDGET) { drift++; console.error('drift: brief batch hits the clip'); }
rows.push({ label: `batch, 4 create steps (raw ${J(batchFull).length} chars, clipped at ${BUDGET})`, before: sent.length, after: sentBrief.length });

if (process.argv.includes('--json')) console.log(J(rows.map((r) => ({ ...r, before_tokens: tok(r.before), after_tokens: tok(r.after) }))));
else {
  console.log('reply                                                         full chars / tok      brief chars / tok   left');
  for (const r of rows) console.log(`${r.label.padEnd(60)} ${String(r.before).padStart(7)} / ${String(tok(r.before)).padStart(5)}   ${String(r.after).padStart(7)} / ${String(tok(r.after)).padStart(5)}   ${Math.round((100 * r.after) / r.before)}%`);
}
process.exit(drift ? 1 : 0);
