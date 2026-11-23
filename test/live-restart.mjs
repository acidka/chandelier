#!/usr/bin/env node
// Live: the MCP server survives an Illustrator restart without being restarted itself.
// macOS: quits Illustrator. Windows: kills it (taskkill /F) during a running call, like a crash, and checks that call
// gets the "quit or crashed" error (W1). Only if NO documents are open — refuses otherwise. Then checks the
// "not running" answers, relaunches it with status {launch:true}, and checks the runtime reloads by itself.
// Windows: run it in the desktop session (scripts/windows/run-interactive.ps1).
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
const WIN = process.platform === 'win32';
const running = () => WIN
  ? /Illustrator\.exe/i.test(execFileSync('tasklist', ['/FI', 'IMAGENAME eq Illustrator.exe', '/NH']).toString())
  : execFileSync('osascript', ['-e', 'application id "com.adobe.illustrator" is running']).toString().trim() === 'true';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const s0 = JSON.parse(await call('status', {}, () => {}));
if (!s0.running) { console.log('Start Illustrator first: this test quits and relaunches a running one.'); process.exit(2); }
if (s0.documents.length) { console.log('Refusing: documents are open', s0.documents.map((d) => d.name)); process.exit(2); }
await call('run_script', { code: 'return AIA.v;' }, (r) => assert(!r.isError, 'runtime loaded'));
// another session may have loaded the runtime already: count this session's loads from here
const loads0 = JSON.parse(await call('status', {}, () => {})).runtime_loads;

if (WIN) {
  console.log('… killing Illustrator during a 20 s call');
  const inFlight = call('run_script', { code: '$.sleep(20000); return 1;' },
    (r, t) => assert(r.isError && /quit or crashed/.test(t), 'the call in flight says Illustrator quit or crashed'));
  await sleep(3000);
  const t = performance.now();
  execFileSync('taskkill', ['/F', '/IM', 'Illustrator.exe']);
  await inFlight;
  console.log(`     in-flight call answered ${(performance.now() - t).toFixed(0)} ms after the kill`);
} else {
  console.log('… quitting Illustrator');
  execFileSync('osascript', ['-e', 'tell application id "com.adobe.illustrator" to quit']);
}
for (let i = 0; i < 60 && running(); i++) await sleep(1000);
assert(!running(), 'Illustrator did not quit');

await call('status', {}, (r, t) => assert(JSON.parse(t).running === false && /launch:true/.test(t), 'status says not running'));
await call('run_script', { code: 'return 1;' }, (r, t) => assert(r.isError && /not running/.test(t), 'clear not-running error'));
await call('status', { launch: true }, (r, t) => { const v = JSON.parse(t); assert(v.running && v.version, 'relaunched'); });
await call('run_script', { code: 'return AIA.v;' }, (r) => assert(!r.isError, 'runtime reloaded after restart'));
await call('status', {}, (r, t) => { const v = JSON.parse(t); assert(v.runtime_loads === loads0 + 1, `runtime reloaded once after the restart (loads ${loads0} -> ${v.runtime_loads})`); assert(v.bridge_spawns === 1, `one bridge for the whole session (got ${v.bridge_spawns})`); });
await client.close();
console.log(failures ? `${failures} FAILED` : 'restart survived');
process.exit(failures ? 1 : 0);
