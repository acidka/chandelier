#!/usr/bin/env node
// Micro benchmark: the same Illustrator work done three ways (see runners.mjs).
//
//   node bench/micro.mjs [--n=20] [--bulk=100] [--only=A,B,C,M] [--ie3=/path/to/illustrator-mcp-server/dist/index.js]
//   M = the full Chandelier MCP server (needs npm run build)
//
// Safety: all writes go to a NEW scratch document created by this script. Before every scenario the
// script checks that the scratch document is the active one and aborts otherwise. The scratch document
// is closed WITHOUT saving at the end (also on errors / Ctrl-C). Other open documents are never touched.

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { ExtendScriptRunner, Ie3McpRunner, OurBridgeRunner, ChandelierMcpRunner } from './runners.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const opt = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const N = Number(opt.n ?? 20);
const BULK = Number(opt.bulk ?? 100);
const ONLY = (opt.only ?? 'A,B,C,M').split(',');
const IE3 = opt.ie3 ?? resolve(ROOT, '../illustrator-mcp-server/dist/index.js');

// ── shared ExtendScript snippets (identical for A and C) ─────────────────────
const J = (v) => JSON.stringify(v);
const SNIP = {
  readArtboards: `(function(){var d=app.activeDocument,o=[];for(var i=0;i<d.artboards.length;i++){var r=d.artboards[i].artboardRect;o.push('{"i":'+i+',"rect":['+r.join(',')+']}');}return '['+o.join(',')+']';})()`,
  rect: (i) => `(function(){var r=app.activeDocument.pathItems.rectangle(${800 - (i % 20) * 30},${40 + Math.floor(i / 20) * 60},50,20);r.name="r${i}";return r.uuid;})()`,
  text: (i) => `(function(){var t=app.activeDocument.textFrames.pointText([${40 + Math.floor(i / 20) * 100},${800 - (i % 20) * 30}]);t.contents="Label ${i}";t.textRange.characterAttributes.size=14;return t.uuid;})()`,
  bulk: (n) => `(function(){var d=app.activeDocument;for(var i=0;i<${n};i++){var x=40+Math.floor(i/20)*100,y=800-(i%20)*30;var r=d.pathItems.rectangle(y,x,50,20);r.name="r"+i;var t=d.textFrames.pointText([x,y-40]);t.contents="Label "+i;t.textRange.characterAttributes.size=14;}return "ok";})()`,
};

// ── stats ────────────────────────────────────────────────────────────────────
function stats(ms) {
  const s = [...ms].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { calls: s.length, median: q(0.5), p95: q(0.95), min: s[0], total: s.reduce((a, b) => a + b, 0) };
}
const f = (x) => (x == null ? '—' : x >= 100 ? x.toFixed(0) : x.toFixed(1));

// ── setup / safety via a dedicated bridge (always ours: cheapest, and needed for checks) ──
const admin = new OurBridgeRunner(join(ROOT, 'src/bridge/bridge-mac.js'));
await admin.start();
const js = async (code) => { const r = await admin.run(code, 60); if (!r.ok) throw new Error(r.error); return r.result; };

const env = {
  date: new Date().toLocaleDateString('sv'),
  illustrator: await js('app.version'),
  macos: process.platform === 'win32' ? `Windows ${os.release()}` : execFileSync('sw_vers', ['-productVersion']).toString().trim(),
  node: process.version,
  cpu: os.cpus()[0]?.model,
};
const scratch = await js('var d=app.documents.add(DocumentColorSpace.CMYK,595.28,841.89);d.name');
console.log(`scratch document: ${scratch}  (Illustrator ${env.illustrator}, ${env.macos.startsWith('Windows') ? '' : 'macOS '}${env.macos})`);

async function assertScratchActive() {
  const name = await js('app.documents.length ? app.activeDocument.name : ""');
  if (name !== scratch) throw new Error(`Active document is "${name}", expected scratch "${scratch}". Aborting to protect your files.`);
}
async function clearScratch() {
  await assertScratchActive();
  await js('(function(){var d=app.activeDocument;for(var l=0;l<d.layers.length;l++){var L=d.layers[l];L.locked=false;try{L.pageItems.removeAll();}catch(e){while(L.pageItems.length)L.pageItems[0].remove();}}return d.pageItems.length;})()');
}
const countItems = async () => Number(await js('app.activeDocument.pageItems.length'));
async function closeScratch() {
  await js(`(function(){for(var i=app.documents.length-1;i>=0;i--){if(app.documents[i].name===${J(scratch)}){app.documents[i].close(SaveOptions.DONOTSAVECHANGES);return "closed";}}return "not found";})()`);
}
let closed = false;
const cleanup = async () => { if (closed) return; closed = true; try { await closeScratch(); } catch (e) { console.error('cleanup failed:', e.message); } await admin.stop(); };
process.on('SIGINT', async () => { await cleanup(); process.exit(130); });

// ── scenarios ────────────────────────────────────────────────────────────────
// Each scenario: per runner, a function that performs the work and returns per-call timings.
const scenarios = [
  {
    id: 'S1', title: `Read artboards (×${N}, one call each)`, expectItems: 0,
    A: (r) => seq(N, () => r.run(SNIP.readArtboards)),
    B: (r) => seq(N, () => r.run('get_artboards', {})),
    C: (r) => seq(N, () => r.run(SNIP.readArtboards)),
    M: (r) => seq(N, () => r.run('artboards', { action: 'list' })),
  },
  {
    id: 'S2', title: `Create a rectangle (×${N}, one call each)`, expectItems: N,
    A: (r) => seq(N, (i) => r.run(SNIP.rect(i))),
    B: (r) => seq(N, (i) => r.run('create_rectangle', { x: 40 + Math.floor(i / 20) * 60, y: 40 + (i % 20) * 30, width: 50, height: 20, name: `r${i}` })),
    C: (r) => seq(N, (i) => r.run(SNIP.rect(i))),
    M: (r) => seq(N, (i) => r.run('create_shape', { x: 40 + Math.floor(i / 20) * 60, y: 40 + (i % 20) * 30, w: 50, h: 20, name: `r${i}` })),
  },
  {
    id: 'S3', title: `Create a 14 pt point text (×${N}, one call each)`, expectItems: N,
    A: (r) => seq(N, (i) => r.run(SNIP.text(i))),
    B: (r) => seq(N, (i) => r.run('create_text_frame', { x: 40 + Math.floor(i / 20) * 100, y: 40 + (i % 20) * 30, contents: `Label ${i}`, font_size: 14 })),
    C: (r) => seq(N, (i) => r.run(SNIP.text(i))),
    M: (r) => seq(N, (i) => r.run('create_text', { x: 40 + Math.floor(i / 20) * 100, y: 40 + (i % 20) * 30, text: `Label ${i}`, size: 14 })),
  },
  {
    id: 'S4', title: `Build ${BULK} rectangles + ${BULK} texts (each approach's natural way)`, expectItems: 2 * BULK,
    note: 'A and C: one script call. B has no batch or script tool, so it needs 2 calls per object pair.',
    A: (r) => seq(1, () => r.run(SNIP.bulk(BULK))),
    B: async (r) => {
      const out = [];
      for (let i = 0; i < BULK; i++) {
        const x = 40 + Math.floor(i / 20) * 100, y = 40 + (i % 20) * 30;
        out.push(await r.run('create_rectangle', { x, y, width: 50, height: 20, name: `r${i}` }));
        out.push(await r.run('create_text_frame', { x, y: y + 40, contents: `Label ${i}`, font_size: 14 }));
      }
      return out;
    },
    C: (r) => seq(1, () => r.run(SNIP.bulk(BULK))),
    // M: typed tools, many objects per step — one batch call, no script
    M: (r) => seq(1, () => r.run('batch', { results: 'errors', steps: [
      { tool: 'create_shape', args: { w: 50, h: 20, items: Array.from({ length: BULK }, (_, i) => ({ x: 40 + Math.floor(i / 20) * 100, y: 40 + (i % 20) * 30, name: `r${i}` })) } },
      { tool: 'create_text', args: { size: 14, items: Array.from({ length: BULK }, (_, i) => ({ x: 40 + Math.floor(i / 20) * 100, y: 80 + (i % 20) * 30, text: `Label ${i}` })) } },
    ] })),
  },
  {
    id: 'S5', title: `Batch of ${2 * BULK} typed steps, one object each (no script)`, expectItems: 2 * BULK,
    note: 'M only: the worst case for batch (one object per step), still one MCP call.',
    M: (r) => seq(1, () => r.run('batch', { results: 'errors', steps: Array.from({ length: 2 * BULK }, (_, i) => (i % 2
      ? { tool: 'create_text', args: { x: 40 + Math.floor(i / 40) * 100, y: 80 + (i % 40) * 15, text: `L${i}`, size: 9 } }
      : { tool: 'create_shape', args: { x: 40 + Math.floor(i / 40) * 100, y: 40 + (i % 40) * 15, w: 50, h: 10 } })) })),
  },
  {
    id: 'S6', title: `Preview: render the page and return the image (×${Math.min(N, 10)})`, expectItems: 0,
    note: 'M: preview {max_px: 800} returns the PNG as MCP image content. B: export to a PNG file (the agent then reads it).',
    B: (r) => seq(Math.min(N, 10), (i) => r.run('export', { target: 'artboard:0', format: 'png', output_path: join(os.tmpdir(), `aia-bench-${i}.png`) })),
    M: (r) => seq(Math.min(N, 10), () => r.run('preview', { max_px: 800 })),
  },
];
async function seq(n, fn) { const out = []; for (let i = 0; i < n; i++) out.push(await fn(i)); return out; }

// ── run ──────────────────────────────────────────────────────────────────────
const runners = [];
try {
  if (ONLY.includes('A')) runners.push(['A', new ExtendScriptRunner()]);
  if (ONLY.includes('B')) {
    if (!existsSync(IE3)) console.warn(`skip B: ${IE3} not found (build it with npm run build in the ie3 clone, or pass --ie3=)`);
    else runners.push(['B', new Ie3McpRunner(IE3)]);
  }
  if (ONLY.includes('C')) runners.push(['C', new OurBridgeRunner(join(ROOT, 'src/bridge/bridge-mac.js'))]);
  if (ONLY.includes('M')) {
    if (!existsSync(join(ROOT, 'dist/index.js'))) console.warn('skip M: run npm run build first');
    else runners.push(['M', new ChandelierMcpRunner(join(ROOT, 'dist/index.js'))]);
  }

  const startup = {};
  for (const [k, r] of runners) { const t = performance.now(); await r.start(); startup[k] = performance.now() - t; }
  const ie3Version = runners.find(([k]) => k === 'B')?.[1].version;

  const rows = [];
  for (const sc of scenarios) {
    console.log(`\n${sc.id} ${sc.title}`);
    for (const [k, r] of runners) {
      if (!sc[k]) continue; // no equivalent for this runner
      await clearScratch();
      const res = await sc[k](r);
      await assertScratchActive();
      const items = await countItems();
      const errors = res.filter((x) => !x.ok);
      const st = stats(res.map((x) => x.ms));
      const row = { scenario: sc.id, title: sc.title, runner: r.name, ...st, errors: errors.length, items, expectItems: sc.expectItems, firstError: errors[0]?.error?.slice(0, 160) };
      rows.push(row);
      console.log(`  ${r.name.padEnd(38)} calls ${String(st.calls).padStart(4)}  median ${f(st.median).padStart(6)} ms  p95 ${f(st.p95).padStart(6)} ms  total ${f(st.total).padStart(7)} ms  items ${items}/${sc.expectItems}${errors.length ? `  ERRORS ${errors.length}: ${row.firstError}` : ''}`);
    }
  }
  await clearScratch();
  for (const [, r] of runners) await r.stop();

  // ── report ──
  const outDir = join(HERE, 'results');
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toLocaleString('sv').replace(' ', 'T').replace(/:/g, '-');
  const md = [
    `# Micro benchmark ${env.date}`,
    '',
    `Illustrator ${env.illustrator} · ${env.macos.startsWith('Windows') ? '' : 'macOS '}${env.macos} · Node ${env.node} · ${env.cpu} · ie3 ${ie3Version ?? 'n/a'} · n=${N}, bulk=${BULK}`,
    '',
    `Startup (one-off per session): ${Object.entries(startup).map(([k, v]) => `${k} ${f(v)} ms`).join(' · ')}`,
    '',
    '| Scenario | Runner | Calls | Median ms | p95 ms | Total ms | Items | Errors |',
    '|----------|--------|------:|----------:|-------:|---------:|------:|-------:|',
    ...rows.map((r) => `| ${r.scenario} ${r.title} | ${r.runner} | ${r.calls} | ${f(r.median)} | ${f(r.p95)} | ${f(r.total)} | ${r.items}/${r.expectItems} | ${r.errors} |`),
    '',
    ...scenarios.filter((s) => s.note).map((s) => `- ${s.id}: ${s.note}`),
    '- C is the raw bridge (no MCP layer); M is the full Chandelier MCP server over stdio, like B.',
  ].join('\n');
  writeFileSync(join(outDir, `${stamp}-micro.md`), md + '\n');
  writeFileSync(join(outDir, `${stamp}-micro.json`), JSON.stringify({ env, startup, ie3Version, rows }, null, 2));
  console.log(`\nreport: bench/results/${stamp}-micro.md`);
} catch (e) {
  console.error('benchmark failed:', e.message);
  process.exitCode = 1;
} finally {
  for (const [, r] of runners) { try { await r.stop(); } catch { /* already stopped */ } }
  await cleanup();
}
