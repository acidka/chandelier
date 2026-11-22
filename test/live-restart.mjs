#!/usr/bin/env node
// Live: the MCP server survives an Illustrator restart without being restarted itself.
// Quits Illustrator (only if NO documents are open — refuses otherwise), checks the "not running" answers,
// relaunches it with status {launch:true}, and checks the runtime reloads by itself.
//   npm run build && node test/live-restart.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const client = new Client({ name: 'aia-restart', version: '0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(ROOT, 'dist/index.js')], stderr: 'inherit' }));
let failures = 0;
async function call(name, args, expect) {
  const t = performance.now();
  const r = await client.callTool({ name, arguments: args });
  const text = r.content.find((c) => c.type === 'text')?.text ?? '';
  let ok = true, why = '';
  try { expect(r, text); } catch (e) { ok = false; why = ' ✗ ' + e.message; failures++; }
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(10)} ${(performance.now() - t).toFixed(0).padStart(6)} ms  ${text.slice(0, 200)}${why}`);
  return text;
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const running = () => execFileSync('osascript', ['-e', 'application id "com.adobe.illustrator" is running']).toString().trim() === 'true';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const s0 = JSON.parse(await call('status', {}, (r, t) => assert(JSON.parse(t).running, 'Illustrator must be running to start')));
if (s0.documents.length) { console.log('Refusing: documents are open', s0.documents.map((d) => d.name)); process.exit(2); }
await call('run_script', { code: 'return AIA.v;' }, (r) => assert(!r.isError, 'runtime loaded'));

console.log('… quitting Illustrator');
execFileSync('osascript', ['-e', 'tell application id "com.adobe.illustrator" to quit']);
for (let i = 0; i < 60 && running(); i++) await sleep(1000);
assert(!running(), 'Illustrator did not quit');

await call('status', {}, (r, t) => assert(JSON.parse(t).running === false && /launch:true/.test(t), 'status says not running'));
await call('run_script', { code: 'return 1;' }, (r, t) => assert(r.isError && /not running/.test(t), 'clear not-running error'));
await call('status', { launch: true }, (r, t) => { const v = JSON.parse(t); assert(v.running && v.version, 'relaunched'); });
await call('run_script', { code: 'return AIA.v;' }, (r) => assert(!r.isError, 'runtime reloaded after restart'));
await call('status', {}, (r, t) => { const v = JSON.parse(t); assert(v.runtime_loads === 2, `runtime loaded twice (got ${v.runtime_loads})`); assert(v.bridge_spawns === 1, `one bridge for the whole session (got ${v.bridge_spawns})`); });
await client.close();
console.log(failures ? `${failures} FAILED` : 'restart survived');
process.exit(failures ? 1 : 0);
