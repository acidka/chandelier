#!/usr/bin/env node
// Phase 2 exit check: build the 12-page A4-landscape 2027 calendar with typed tools only (no run_script),
// count the MCP calls (target ≤ 20), then verify the result. Saves previews + the .ai to bench/results/calendar-tools/.
//   npm run build && node test/calendar-tools.mjs
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { connect, assert } from './live-lib.mjs';

const OUT = join(process.cwd(), 'bench/results/calendar-tools');
mkdirSync(OUT, { recursive: true });
const { call, done } = await connect('calendar-tools');
let buildCalls = 0;
const t0 = performance.now();
const build = async (tool, args, opt) => { buildCalls++; return call(tool, args, opt); };

const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const YEAR = 2027, W = 297, H = 210, M = 15, GW = W - 2 * M, CW = GW / 7, TOP = 55, RH = 23;

// ── build ─────────────────────────────────────────────────────────────────────
await build('configure', { units: 'mm' });
let boards;
await build('documents', { action: 'new', width: W, height: H, artboards: 12, columns: 4, bleed: 3, artboard_names: MONTHS, title: `Calendar ${YEAR}` },
  { check: (v) => { boards = v.artboards.map((a) => a.rect); } });
await build('batch', { steps: [
  { tool: 'swatches', args: { action: 'clean_defaults' } },
  { tool: 'swatches', args: { action: 'add', name: 'Navy', color: 'cmyk(100,85,30,25)', group: 'Calendar' } },
  { tool: 'swatches', args: { action: 'add', name: 'Red', color: 'cmyk(0,90,85,0)', group: 'Calendar' } },
  { tool: 'swatches', args: { action: 'add', name: 'Line', color: 'cmyk(0,0,0,35)', group: 'Calendar' } },
  { tool: 'styles', args: { action: 'create', name: 'Month', font: 'Arial Bold', size: 40, fill: 'swatch:Navy' } },
  { tool: 'styles', args: { action: 'create', name: 'Year', font: 'Arial', size: 40, fill: 'swatch:Red', align: 'right' } },
  { tool: 'styles', args: { action: 'create', name: 'Weekday', font: 'Arial Bold', size: 11, fill: 'cmyk(0,0,0,0)', align: 'center' } },
  { tool: 'styles', args: { action: 'create', name: 'Day', font: 'Arial', size: 16, fill: 'swatch:Navy' } },
  { tool: 'styles', args: { action: 'create', name: 'Weekend', font: 'Arial Bold', size: 16, fill: 'swatch:Red' } },
] }, { check: (v) => assert(v.completed === 9, 'setup batch') });

// shared elements on artboard 0, then copied to every artboard at the same position
const lines = Array.from({ length: 7 }, (_, r) => ({ shape: 'line', x1: M, y1: TOP + r * RH, x2: W - M, y2: TOP + r * RH }));
await build('batch', { steps: [
  { tool: 'create_shape', args: { layer: 'Frame', x: M, y: 40, w: GW, h: 10, fill: 'swatch:Navy', name: 'Band' } },
  { tool: 'create_shape', args: { layer: 'Frame', stroke: 'swatch:Line', stroke_width: 0.5, items: lines } },
  { tool: 'create_text', args: { layer: 'Frame', paragraph_style: 'Weekday', items: DAYS.map((d, i) => ({ text: d, x: M + (i + 0.5) * CW, y: 46.8, name: 'wd' + i })) } },
  { tool: 'create_text', args: { layer: 'Frame', text: String(YEAR), x: W - M, y: 30, paragraph_style: 'Year', name: 'Year' } },
  { tool: 'duplicate_items', args: { refs: 'layer:Frame', to_artboards: 'all' } },
] }, { check: (v) => assert(v.completed === 5, 'frame batch') });

// month titles and day numbers: one call each, coordinates offset by each artboard's position
const titles = MONTHS.map((m, k) => ({ text: m, x: boards[k][0] + M, y: boards[k][1] + 30 }));
const days = [], weekend = [];
for (let k = 0; k < 12; k++) {
  const first = (new Date(YEAR, k, 1).getDay() + 6) % 7, n = new Date(YEAR, k + 1, 0).getDate();
  for (let d = 1; d <= n; d++) {
    const cell = first + d - 1, r = Math.floor(cell / 7), c = cell % 7;
    (c >= 5 ? weekend : days).push({ text: String(d), x: boards[k][0] + M + c * CW + 3, y: boards[k][1] + TOP + r * RH + 8 });
  }
}
await build('batch', { steps: [
  { tool: 'create_text', args: { layer: 'Text', paragraph_style: 'Month', items: titles } },
  { tool: 'create_text', args: { layer: 'Days', paragraph_style: 'Day', items: days } },
  { tool: 'create_text', args: { layer: 'Days', paragraph_style: 'Weekend', items: weekend } },
] }, { check: (v) => assert(v.completed === 3, 'text batch') });
await build('preview', { artboard: 0, max_px: 800, save_to: join(OUT, 'january.png') });
await build('document_info', {}, { check: (v) => {
  assert(v.artboards.length === 12 && v.artboards[11].name === 'Грудень', 'artboards');
  assert(Object.keys(v.issues).length === 0 || (Object.keys(v.issues).length === 1 && v.issues.unnamedText), 'no issues except unnamed text: ' + JSON.stringify(v.issues));
} });
await build('documents', { action: 'save', path: join(OUT, `calendar-${YEAR}.ai`) });
const buildMs = performance.now() - t0;

// ── verify (not part of the build) ───────────────────────────────────────────
await call('batch', { steps: Array.from({ length: 12 }, (_, k) => ({ tool: 'find_items', args: { layer: 'Days', artboard: k, count_only: true } })) }, { check: (v) => {
  v.results.forEach((r, k) => assert(r.data.total === new Date(YEAR, k + 1, 0).getDate(), `month ${k + 1}: ${r.data.total} day numbers`));
} });
await call('find_items', { type: 'text', size: 12, count_only: true }, { check: (v) => assert(v.total === 0, 'no default-12 pt orphans') });
await call('find_items', { fill: 'swatch:Red', type: 'text', count_only: true }, { check: (v) => assert(v.total === weekend.length + 12, 'weekend days + 12 years in red: ' + v.total) });
await call('find_items', { layer: 'Frame', top_level: true, count_only: true }, { check: (v) => assert(v.total === 12 * (2 + 7 + 7), 'frame copied to every artboard: ' + v.total) });
await call('preview', { artboard: 6, max_px: 800, save_to: join(OUT, 'july.png') });
await call('documents', { action: 'close' });
await call('configure', { units: 'pt' });

console.log(`\nBUILD: ${buildCalls} MCP calls, ${(buildMs / 1000).toFixed(1)} s, no run_script (${days.length + weekend.length} day numbers, 12 artboards)`);
assert(buildCalls <= 20, 'target ≤ 20 calls');
process.exit(await done() ? 1 : 0);
