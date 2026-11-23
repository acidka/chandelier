#!/usr/bin/env node
// W1 spike (docs/windows-plan.md): drive the Windows bridge (bridge-win.ps1) against a running Illustrator and measure
// start, attach, per-call latency, script size, Unicode, a long call and activation. Windows only; run it in the
// desktop session (over SSH: scripts/windows/run-interactive.ps1), Illustrator already running.
//   node test/live-w1-bridge.mjs [--long 70]   (seconds of the long call; 0 skips it)
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform !== 'win32') { console.error('Windows only'); process.exit(2); }
const li = process.argv.indexOf('--long');
const LONG = li > 0 ? Number(process.argv[li + 1]) : 70;

const t0 = performance.now();
const ps = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Sta', '-ExecutionPolicy', 'Bypass', '-File',
  join(ROOT, 'src/bridge/bridge-win.ps1')], { stdio: ['pipe', 'pipe', 'inherit'] });
const waits = new Map();
let ready;
const readyP = new Promise((r) => { ready = r; });
createInterface({ input: ps.stdout }).on('line', (line) => {
  const m = JSON.parse(line);
  if (m.id === 0) return ready(performance.now() - t0);
  waits.get(m.id)?.(m); waits.delete(m.id);
});
let next = 1;
function req(op, extra = {}) {
  const id = next++;
  const t = performance.now();
  return new Promise((res) => {
    waits.set(id, (m) => res({ ...m, ms: performance.now() - t }));
    ps.stdin.write(JSON.stringify({ id, op, ...extra }) + '\n');
  });
}
const js = (code, timeout = 120) => req('js', { code, timeout });
const ascii = (s) => s.replace(/[^\x00-\x7f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const pct = (a, p) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
const f = (n) => n.toFixed(1);
const report = {};
const check = (name, ok, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); report[name] = { ok, detail }; };

const readyMs = await readyP;
check('bridge ready', true, `${f(readyMs)} ms`);

let r = await req('running');
check('op running', r.ok && r.result === 'yes', `${r.result ?? r.error} ${f(r.ms)} ms`);

r = await js('app.name + " " + app.version');
check('first js (attach)', r.ok, `${r.result ?? r.error} (errno ${r.errno ?? '-'}) ${f(r.ms)} ms`);
if (!r.ok) { ps.stdin.end(); process.exit(1); }

const lat = [];
for (let i = 0; i < 200; i++) { const x = await js('1+1'); if (!x.ok) { check('latency', false, x.error); break; } lat.push(x.ms); }
check('latency 200x "1+1"', lat.length === 200, `median ${f(pct(lat, 0.5))} ms, p95 ${f(pct(lat, 0.95))} ms, max ${f(Math.max(...lat))} ms`);

const docs = await js('app.documents.length');
check('documents.length', docs.ok, `${docs.result}`);

for (const kb of [30, 100, 300, 1000]) {
  const body = 'x'.repeat(kb * 1024);
  const x = await js(`var s = "${body}"; s.length`);
  check(`script ${kb} KB`, x.ok && Number(x.result) === kb * 1024, `${x.ok ? x.result : x.error} ${f(x.ms)} ms`);
}

const uk = 'Люстра ÄÖÜ ß € 中文 😀';
const u = await js(ascii(`var s = "${uk}"; var o = ""; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); o += c < 128 ? s.charAt(i) : "\\\\u" + ("000" + c.toString(16)).slice(-4); } o`));
const back = u.ok ? JSON.parse('"' + u.result + '"') : null;
check('Unicode round trip', back === uk, u.ok ? JSON.stringify(back) : u.error);
const raw = await js(`"${uk}"`); // non-ASCII straight through the pipe (the transport never sends this; documents what happens)
check('raw non-ASCII through pipe (info)', true, raw.ok ? `${JSON.stringify(raw.result)} ${raw.result === uk ? 'intact' : 'altered'}` : raw.error);

const err = await js('throw new Error("boom")');
check('ExtendScript throw', !err.ok, `${err.error} (errno ${err.errno})`);
const syn = await js('var = ;');
check('syntax error', !syn.ok, `${syn.error} (errno ${syn.errno})`);

const act = await req('activate');
check('op activate', act.ok, `${act.result ?? act.error} ${f(act.ms)} ms`);

if (LONG > 0) {
  const x = await js(`$.sleep(${LONG * 1000}); "done"`, LONG + 60);
  check(`long call ${LONG} s`, x.ok && x.result === 'done', `${x.result ?? x.error} ${f(x.ms / 1000)} s`);
}

console.log('\nJSON ' + JSON.stringify(report));
ps.stdin.end();
