#!/usr/bin/env node
// Live test of the MCP server against a running Illustrator. Talks MCP over stdio like an agent (SDK client).
// Safety: works only in a document it creates; closes it without saving; never touches other documents.
//   npm run test:live
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guard } from './live-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'aia-live-'));
const client = new Client({ name: 'aia-live', version: '0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(ROOT, 'dist/index.js')], stderr: 'inherit',
  // CHANDELIER_TRANSPORT=panel npm run test:live runs the same checks through the Chandelier panel (docs/panel-plan.md)
  env: { ...getDefaultEnvironment(), CHANDELIER_REPLY: 'full', ...(process.env.CHANDELIER_TRANSPORT ? { CHANDELIER_TRANSPORT: process.env.CHANDELIER_TRANSPORT } : {}) } }));
guard(client); // abort if another document becomes active mid-run

let failures = 0;
const txt = (r) => r.content.filter((c) => c.type === 'text').map((c) => c.text).join(' ');
async function call(name, args = {}, { expectError = false, check } = {}) {
  const t = performance.now();
  const r = await client.callTool({ name, arguments: args });
  const ms = (performance.now() - t).toFixed(1);
  const img = r.content.find((c) => c.type === 'image');
  let ok = !!r.isError === expectError;
  let note = '';
  if (ok && check) { try { const v = check(r.isError ? txt(r) : JSON.parse(txt(r)), r); if (v === false) ok = false; } catch (e) { ok = false; note = ' ✗ ' + e.message; } }
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(12)} ${ms.padStart(7)} ms  ${txt(r).slice(0, 220)}${img ? `  [image ${Math.round(img.data.length * 0.75 / 1024)} KB]` : ''}${note}`);
  return r;
}
const assert = (c, m) => { if (!c) throw new Error(m); };

const tools = await client.listTools();
console.log('tools:', tools.tools.map((t) => t.name).join(', '));
await call('status', {}, { check: (v) => assert(v.running, 'Illustrator must be running') });
let docName;
await call('documents', { action: 'new', width: 210, height: 150, units: 'mm', artboard_name: 'Live' }, { check: (v) => { docName = v.name; } });
await call('run_script', { code: `
  AIA.swatch('Navy', 'cmyk(100,85,30,25)');
  AIA.pstyle('Title', {font:'Arial Bold', size:48, color:'swatch:Navy'});
  AIA.layer('Header');
  var g = AIA.group('Title block');
  AIA.text('Січень', {x:40, y:80, style:'Title', name:'Month', parent:g});
  AIA.line(40, 95, 555, 95, {stroke:'swatch:Navy', sw:2, name:'Rule', parent:g});
  return AIA.find('Month').contents;` }, { check: (v) => assert(v.result === 'Січень', 'Cyrillic round trip') });
await call('run_script', { code: 'var a = 1;\nnull.foo = 2;' }, { expectError: true, check: (s) => assert(/line.?:2/.test(s), 'error line 2') });
await call('run_script', { code: 'var a = 1;\nvar b = ;' }, { expectError: true, check: (s) => assert(/"line":2/.test(s), 'syntax error line 2') });
await call('run_script', { code: 'var a = 1;\nAIA.color("blue");' }, { expectError: true, check: (s) => assert(/Unknown colour/.test(s) && /AIA helper/.test(s), 'helper error') });
await call('batch', { steps: [
  { tool: 'run_script', args: { code: 'return AIA.rect(300, 200, 40, 40, {fill:"swatch:Navy", name:"B0"});' } },
  { tool: 'run_script', args: { code: 'return AIA.refs("@0")[0].name;' } },
] }, { check: (v) => assert(v.completed === 2 && v.results[1].data === 'B0', '@n ref') });
await call('batch', { rollback: true, steps: [
  { tool: 'run_script', args: { code: 'AIA.rect(0,0,5,5,{name:"RB"}); AIA.text("x",{x:5,y:5,name:"RB"}); return 1;' } },
  { tool: 'run_script', args: { code: 'AIA.color("nope");' } },
] }, { expectError: true, check: (s) => { const v = JSON.parse(s); assert(v.rolled_back === 2 && v.failed_step === 1, 'rollback'); } });
await call('run_script', { code: 'return AIA.find("RB");' }, { check: (v) => assert(v.result === null, 'rolled-back items gone') });
await call('batch', { results: 'errors', steps: Array.from({ length: 100 }, (_, i) => ({ tool: 'document_info', args: { checks: false } })) },
  { check: (v) => assert(v.completed === 100, '100 steps') });
await call('find_items', { type: 'text', fields: ['name', 'text', 'font', 'layer'] }, { check: (v) => assert(v.total === 1 && v.items[0].text === 'Січень' && v.items[0].layer === 'Header', 'find text') });
await call('find_items', { fill: 'swatch:Navy', count_only: true }, { check: (v) => assert(v.total === 2 && v.by_type.text === 1 && v.by_type.path === 1, 'find by swatch (title text + B0)') });
await call('get_items', { refs: 'name:Month' }, { check: (v) => assert(v.items[0].runs[0].font === 'Arial-BoldMT' && v.items[0].paragraph_style === 'Title', 'text detail') });
await call('get_tree', { depth: 3 }, { check: (v) => assert(v.tree.some((l) => l.layer === 'Header' && l.children.some((c) => c.name === 'Title block' && c.count === 2)), 'tree') });
await call('selection', { action: 'set', refs: 'name:B0', fields: ['name'] }, { check: (v) => assert(v.count === 1 && v.items[0].name === 'B0', 'select') });
await call('batch', { steps: [
  { tool: 'find_items', args: { name: 'Rule' } },
  { tool: 'selection', args: { action: 'set', refs: '@0' } },
  { tool: 'get_items', args: { refs: 'selection', runs: false } },
] }, { check: (v) => assert(v.results[2].data.items[0].name === 'Rule', 'find → select → get via @n') });
await call('selection', { action: 'clear' });
const hasImage = (_v, r) => assert(r.content.some((c) => c.type === 'image'), 'image');
await call('preview', { max_px: 400 }, { check: hasImage });
await call('preview', { refs: 'name:Title block', max_px: 300 }, { check: (_v, r) => { hasImage(_v, r); const v = JSON.parse(txt(r)); assert(v.of === '1 item(s)' && Math.max(...v.px) <= 300, 'items preview'); } });
await call('preview', { region: [0, 0, 100, 100], max_px: 50, background: 'transparent' }, { check: (_v, r) => { const v = JSON.parse(txt(r)); assert(v.px[0] === 50, 'region downscaled to 50 px'); } });
await call('document_info', {}, { check: (v) => assert(v.globalSwatches.some((s) => s.startsWith('Navy')) && v.paragraphStyles.includes('Title'), 'swatch + style') });
await call('documents', { action: 'save', path: join(dir, 'live.ai') }, { check: (v) => { docName = v.name; } });
await call('documents', { action: 'close', name: docName });

const ms = [];
// unguarded: no document of ours is open any more, and the guard's extra status call per call would double the number
for (let i = 0; i < 30; i++) { const t = performance.now(); await client.callToolUnguarded({ name: 'run_script', arguments: { code: 'return 1;' } }); ms.push(performance.now() - t); }
ms.sort((a, b) => a - b);
console.log(`run_script round trip over MCP: p50 ${ms[15].toFixed(1)} ms, p95 ${ms[28].toFixed(1)} ms`);
await client.close();
console.log(failures ? `${failures} FAILED` : 'all live checks passed', '· files in', dir);
process.exit(failures ? 1 : 0);
