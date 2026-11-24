#!/usr/bin/env node
// Live: status {restart:true} — refused while a document is unsaved, otherwise quits and relaunches Illustrator and
// reopens the open documents (phase 5 safe restart). Restarts Illustrator: refuses to start if ANY document is open,
// so it only ever reopens its own file. Windows: run in the desktop session (scripts/windows/run-interactive.ps1).
//   npm run build && node test/live-safe-restart.mjs
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect, assert, txt } from './live-lib.mjs';

const { call, client, done } = await connect('aia-safe-restart');
const s0 = JSON.parse(txt(await call('status', {}, { check: (v) => assert(v.running, 'Illustrator must be running') })));
if (s0.documents?.length) { console.log('Refusing: documents are open', s0.documents.map((d) => d.name)); process.exit(2); }

const dir = mkdtempSync(join(tmpdir(), 'aia-restart-'));
const kept = join(dir, 'kept.ai');
await call('documents', { action: 'new', width: 200, height: 100, title: 'restart-kept' });
await call('create_shape', { x: 10, y: 10, w: 80, h: 40, fill: '#1e2a44', name: 'KeepMe' });
await call('documents', { action: 'save_as', path: kept }, { check: () => assert(existsSync(kept), 'saved') });
await call('documents', { action: 'new', width: 100, height: 100, title: 'restart-unsaved' });
await call('status', { restart: true }, { expectError: true, check: (v) => {
  assert(/Not restarting/.test(v.error), 'refused');
  assert(v.documents.length === 1 && v.documents[0].name === 'restart-unsaved' && v.documents[0].created_here, 'names only the unsaved one');
} });
await call('documents', { action: 'close', name: 'restart-unsaved', discard: true });
await call('status', { restart: true }, { timeout: 300_000, check: (v) => {
  assert(v.restarted && v.reopened.length === 1 && v.reopened[0] === 'kept.ai' && !v.failed, 'reopened ' + JSON.stringify(v));
} });
await call('find_items', { name: 'KeepMe' }, { check: (v) => assert(v.total === 1, 'content survived the restart') });
await call('status', {}, { check: (v) => assert(v.documents.length === 1 && v.documents[0].active && v.documents[0].name === 'kept.ai', 'kept.ai is open and active') });
await call('documents', { action: 'close', name: 'kept.ai', discard: true });
process.exit((await done()) ? 1 : 0);
void client;
