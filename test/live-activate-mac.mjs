#!/usr/bin/env node
// macOS: do save and export work while Illustrator is NOT in front (quirk A10)? Runs with configure {activate: false}
// and records which app is in front before and after every call, so it also shows which calls bring Illustrator up
// by themselves. It never activates anything: put another app (a browser) in front before starting.
// Works only in a document it creates; writes into a temp folder; closes the document.
//   npm run build && node test/live-activate-mac.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from './live-lib.mjs';

if (process.platform !== 'darwin') { console.error('macOS only'); process.exit(2); }
const front = () => { try { return execFileSync('lsappinfo', ['info', '-only', 'name', execFileSync('lsappinfo', ['front']).toString().trim()]).toString().match(/"([^"]*)"/)?.[1] ?? '?'; } catch (e) { return '?'; } };
const dir = mkdtempSync(join(tmpdir(), 'aia-activate-mac-'));
const { call, done } = await connect('live-activate-mac');
const fileOk = (p, magic) => { const b = readFileSync(p); if (!b.subarray(0, magic.length).equals(Buffer.from(magic))) throw new Error(p + ': bad file'); return statSync(p).size > 0; };
const steps = [];
async function step(label, tool, args, check) {
  const before = front();
  const t = performance.now();
  await call(tool, args, { check, timeout: 120_000 });
  const after = front();
  steps.push({ step: label, front_before: before, front_after: after, ms: Math.round(performance.now() - t) });
}

const startFront = front();
console.log('in front at start:', startFront);
if (/illustrator/i.test(startFront)) console.log('NOTE: Illustrator is in front: put another app in front first to test the background case');
await step('configure activate:false', 'configure', { activate: false });
await step('documents new', 'documents', { action: 'new', width: 200, height: 120, title: 'activate-mac' });
await step('create_shape', 'create_shape', { x: 20, y: 20, w: 160, h: 80, fill: '#1e2a44' });
await step('preview', 'preview', { max_px: 300 });
await step('save .ai', 'documents', { action: 'save', path: join(dir, 'a.ai') });
await step('export png', 'export', { format: 'png', path: join(dir, 'a.png') }, (v) => fileOk(v.files[0].path, [0x89, 0x50, 0x4e, 0x47]));
await step('export pdf', 'export', { format: 'pdf', path: join(dir, 'a.pdf') }, (v) => fileOk(v.files[0].path, [0x25, 0x50, 0x44, 0x46]));
await step('export svg', 'export', { format: 'svg', path: join(dir, 'a.svg') });
await step('save_as pdf', 'documents', { action: 'save_as', path: join(dir, 'b.pdf') });
await step('close', 'documents', { action: 'close', discard: true });
console.table(steps);
process.exit(await done(`· files in ${dir}`) ? 1 : 0);
