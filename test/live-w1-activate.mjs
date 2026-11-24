#!/usr/bin/env node
// W1 (docs/windows-plan.md § 12): do save and export work on Windows while Illustrator is NOT in front?
// macOS needed activation before save/export (quirk A10), so the server activates by default; this runs with
// configure {activate:false} with Illustrator visible but not in front (minimized, then shown again without
// activation: Windows doesn't let a background process bring another window forward), then minimized, and checks
// that every file is written. Opens no other windows. Works only in a document it creates; closes it; leaves
// Illustrator's window shown, not activated.
// Windows only, desktop session (scripts/windows/run-interactive.ps1).
//   npm run build && node test/live-w1-activate.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guard } from './live-lib.mjs';

if (process.platform !== 'win32') { console.error('Windows only'); process.exit(2); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'aia-activate-'));
const client = new Client({ name: 'aia-activate', version: '0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(ROOT, 'dist/index.js')], stderr: 'inherit' }));
guard(client); // abort if a document this test didn't create becomes active

let failures = 0;
const txt = (r) => r.content.filter((c) => c.type === 'text').map((c) => c.text).join(' ');
async function call(name, args, check) {
  const t = performance.now();
  const r = await client.callTool({ name, arguments: args });
  let ok = !r.isError, note = '';
  if (ok && check) { try { check(JSON.parse(txt(r))); } catch (e) { ok = false; note = ' ✗ ' + e.message; } }
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(10)} ${(performance.now() - t).toFixed(0).padStart(6)} ms  ${txt(r).slice(0, 160)}${note}`);
  return r;
}
const ps = (cmd) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd]).toString().trim();
const FG = `Add-Type -Name W -Namespace U -MemberDefinition '[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(System.IntPtr h, out int p); [DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int n);';`;
const foreground = () => ps(`${FG} $p = 0; [void][U.W]::GetWindowThreadProcessId([U.W]::GetForegroundWindow(), [ref]$p); (Get-Process -Id $p).ProcessName`);
// ShowWindow: 6 = minimize (activates the next window), 4 = show in its last size and place without activating
const showIllustrator = (n) => ps(`${FG} Get-Process Illustrator | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object { [void][U.W]::ShowWindow($_.MainWindowHandle, ${n}) }; 'ok'`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileOk = (p, magic) => { const b = readFileSync(p); if (!b.length || !b.subarray(0, magic.length).equals(Buffer.from(magic))) throw new Error(`${p}: bad file`); return statSync(p).size; };

await call('configure', { activate: false });
const r = await call('documents', { action: 'new', width: 200, height: 120, units: 'pt', title: 'activate-test' });
const name = JSON.parse(txt(r)).name;
await call('create_shape', { shape: 'rect', x: 20, y: 20, w: 160, h: 80, fill: '#1e2a44' });

for (const round of ['background', 'minimized']) {
  showIllustrator(6); await sleep(1500); // minimized: something else is in front now
  if (round === 'background') { showIllustrator(4); await sleep(1500); } // visible again, still not in front
  const fg = foreground();
  console.log(`— ${round}: foreground process is ${fg}`);
  if (/illustrator/i.test(fg)) { console.log('FAIL Illustrator is in front: the test cannot check the background case'); failures++; }
  const base = join(dir, round);
  await call('export', { format: 'png', path: base + '.png' }, (v) => fileOk(v.files[0].path, [0x89, 0x50, 0x4e, 0x47]));
  await call('export', { format: 'pdf', path: base + '.pdf' }, (v) => fileOk(v.files[0].path, [0x25, 0x50, 0x44, 0x46]));
  await call('export', { format: 'svg', path: base + '.svg' }, (v) => { if (!/<svg/.test(readFileSync(v.files[0].path, 'utf8'))) throw new Error('no <svg>'); });
  await call('documents', { action: 'save_as', path: base + '.ai' }, (v) => fileOk(v.path, [0x25, 0x50, 0x44, 0x46]));
  const after = foreground();
  console.log(`     foreground after save/export: ${after}${/illustrator/i.test(after) ? ' (Illustrator came to front by itself)' : ''}`);
}

await call('documents', { action: 'close', discard: true });
showIllustrator(4); // leave the window shown (not activated), as before the test
await client.close();
console.log(failures ? `${failures} FAILED` : `save/export work without activation · files in ${dir} (document ${name})`);
process.exit(failures ? 1 : 0);
