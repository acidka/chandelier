#!/usr/bin/env node
// Roadmap 1.6: checks three assumptions against a running Illustrator, through the MCP server.
//   1. Is pageItem.uuid stable after save → close → reopen?
//   2. Is one Apple event (one tool call / one batch) one undo step?
//   3. How fast are doc.pageItems scans (find_items, document_info, get_tree) on a 5 000-object document?
// Works only in documents it creates; closes them without saving (the scan test saves to a temp folder).
//   npm run build && node test/verify-assumptions.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'aia-verify-'));
const client = new Client({ name: 'aia-verify', version: '0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(ROOT, 'dist/index.js')], stderr: 'inherit', env: { ...getDefaultEnvironment(), CHANDELIER_REPLY: 'full' } }));
async function call(name, args = {}) {
  const t = performance.now();
  const r = await client.callTool({ name, arguments: args });
  const ms = performance.now() - t;
  const text = r.content.find((c) => c.type === 'text')?.text ?? '';
  if (r.isError) throw new Error(`${name}: ${text}`);
  let v; try { v = JSON.parse(text); } catch { v = { unparsed: text.length }; }
  return { v, ms, bytes: text.length };
}
const script = async (code) => (await call('run_script', { code })).v.result;
const med = async (n, fn) => { const ms = []; for (let i = 0; i < n; i++) { const t = performance.now(); await fn(); ms.push(performance.now() - t); } ms.sort((a, b) => a - b); return ms[Math.floor(n / 2)]; };
const report = {};

// ── 1. uuid stability ────────────────────────────────────────────────────────
{
  await call('documents', { action: 'new', width: 400, height: 300, title: 'aia-verify-uuid' });
  const before = await script(`var o={};AIA.layer("L");var g=AIA.group("G");o.r=AIA.rect(10,10,50,50,{fill:"gray(50)",name:"R",parent:g}).uuid;o.t=AIA.text("T",{x:10,y:100,name:"T"}).uuid;o.g=g.uuid;return o;`);
  const path = join(dir, 'uuid.ai');
  await call('documents', { action: 'save', path });
  await call('documents', { action: 'close' });
  await call('documents', { action: 'open', path });
  const after = await script(`return {r:AIA.find("R").uuid,t:AIA.find("T").uuid,g:AIA.find("G").uuid};`);
  const lookup = await script(`try{return AIA.doc().getPageItemFromUuid(arguments[0]||"${before.r}").name;}catch(e){return "not found: "+e.message;}`);
  report.uuid = { before, after, stable: JSON.stringify(before) === JSON.stringify(after), lookupOldUuid: lookup };
  await call('documents', { action: 'close', discard: true });
}

// ── 2. undo granularity ──────────────────────────────────────────────────────
{
  await call('documents', { action: 'new', width: 400, height: 300, title: 'aia-verify-undo' });
  const count = () => script('return AIA.doc().pageItems.length;');
  await script('AIA.rect(0,0,10,10);AIA.rect(20,0,10,10);AIA.rect(40,0,10,10);');      // one call, 3 items
  await script('AIA.rect(60,0,10,10);');                                                 // second call, 1 item
  const n0 = await count();
  await script('app.undo();');
  const n1 = await count();
  await script('app.undo();');
  const n2 = await count();
  await call('batch', { steps: [{ tool: 'run_script', args: { code: 'AIA.rect(0,50,10,10);' } }, { tool: 'run_script', args: { code: 'AIA.rect(20,50,10,10);' } }] });
  const n3 = await count();
  await script('app.undo();');
  const n4 = await count();
  // undo inside the same call that made the change
  const inside = await script('AIA.rect(0,80,10,10);var a=AIA.doc().pageItems.length;try{app.undo();}catch(e){return "undo threw: "+e.message;}return [a,AIA.doc().pageItems.length];');
  report.undo = { afterTwoCalls: n0, undo1: n1, undo2: n2, afterBatchOf2: n3, undoAfterBatch: n4, undoInsideSameCall: inside };
  await call('documents', { action: 'close', discard: true });
}

// ── 3. scan speed on 5 000 objects ──────────────────────────────────────────
{
  await call('documents', { action: 'new', width: 2000, height: 2000, title: 'aia-verify-scan' });
  const t = performance.now();
  await script(`AIA.swatch("Navy","cmyk(100,85,30,25)");var L=AIA.layer("Grid");
    for(var gi=0;gi<100;gi++){var g=AIA.group("G"+gi);
      for(var i=0;i<40;i++){var k=gi*40+i;AIA.rect((k%80)*25,Math.floor(k/80)*25,20,20,{fill:(k%7?"gray(30)":"swatch:Navy"),name:"r"+k,parent:g});}
      for(var j=0;j<9;j++){AIA.text("t"+gi+"-"+j,{x:(gi%10)*200,y:1500+Math.floor(gi/10)*40+j,size:6,name:"t"+gi+"-"+j,parent:g});}}
    return AIA.doc().pageItems.length;`);
  const build = performance.now() - t;
  const total = await script('return AIA.doc().pageItems.length;');
  report.scan = {
    objects: total, build_ms: Math.round(build),
    find_count_only: await med(5, () => call('find_items', { count_only: true })),
    find_by_fill: await med(5, () => call('find_items', { fill: 'swatch:Navy', count_only: true })),
    find_by_name: await med(5, () => call('find_items', { name: 'r49*', limit: 20 })),
    find_text_by_font_size: await med(5, () => call('find_items', { type: 'text', size: [5, 7], count_only: true })),
    find_first_page_default_fields: await med(5, () => call('find_items', {})),
    document_info: await med(3, () => call('document_info', {})),
    document_info_no_checks: await med(3, () => call('document_info', { checks: false })),
    get_tree_depth2: await med(5, () => call('get_tree', { depth: 2 })),
    get_tree_bytes: (await call('get_tree', { depth: 2 })).bytes,
    find_first_page_bytes: (await call('find_items', {})).bytes,
    refs_name_glob: await med(5, () => script('return AIA.refs("name:r3999").length;')),
  };
  for (const k of Object.keys(report.scan)) if (typeof report.scan[k] === 'number' && !/objects|bytes/.test(k)) report.scan[k] = Math.round(report.scan[k]);
  await call('documents', { action: 'close', discard: true });
}

const env = await call('status');
report.env = { illustrator: env.v.version, locale: env.v.locale, node: process.version, date: new Date().toISOString().slice(0, 10) };
console.log(JSON.stringify(report, null, 2));
await client.close();
