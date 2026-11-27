#!/usr/bin/env node
// The working document: when the user brings another document to the front between two calls, the next call goes
// back to the document the session works in (and says so); an explicit documents activate moves it. The user's switch
// is made outside the server, through AppleScript, the way a click on another window would. macOS; works only in two
// scratch documents it creates; closes both without saving.
//   npm run build && node test/live-working-doc.mjs   (needs Apple events: run outside the sandbox)
import { execFileSync } from 'node:child_process';
import { connect, assert, txt } from './live-lib.mjs';

if (process.platform !== 'darwin') { console.error('macOS only'); process.exit(2); }
const app = process.env.CHANDELIER_APP ? `application "${process.env.CHANDELIER_APP}"` : 'application "Adobe Illustrator"';
const userSwitch = (name) => execFileSync('osascript', ['-e', `tell ${app} to set current document to document "${name}"`]);
const { client, call, done } = await connect('live-working-doc');
// the first call after a switch, without the live guard's status call in front (that call would be the one switching back)
const direct = async (tool, args, re, label) => {
  const r = await client.callToolUnguarded({ name: tool, arguments: args });
  const ok = !r.isError && re.test(txt(r));
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${tool.padEnd(14)} ${txt(r).slice(0, 260)}${ok ? '' : ' ✗ ' + label}`);
  if (!ok) process.exitCode = 1;
};

await call('documents', { action: 'new', width: 100, height: 100, units: 'mm', title: 'live-wd-a' });
await call('documents', { action: 'new', width: 100, height: 100, units: 'mm', title: 'live-wd-b' }); // working: b
userSwitch('live-wd-a'); // the user clicks the other window
await direct('create_shape', { shape: 'rect', x: 10, y: 10, w: 20, h: 20, fill: '#cc0000', name: 'wd mark 1' }, /went back to \\?"live-wd-b/, 'warning');
await call('find_items', { name: 'wd mark 1' }, { check: (v) => assert(v.total === 1, 'mark 1 is in b: ' + JSON.stringify(v)) });
// an explicit switch by the agent moves the working document
await call('documents', { action: 'activate', name: 'live-wd-a' });
await call('find_items', { name: 'wd mark 1' }, { check: (v) => assert(v.total === 0, 'a has no mark 1: ' + JSON.stringify(v)) });
userSwitch('live-wd-b');
await direct('create_shape', { shape: 'rect', x: 10, y: 10, w: 20, h: 20, fill: '#0000cc', name: 'wd mark 2' }, /went back to \\?"live-wd-a/, 'warning');
await call('find_items', { name: 'wd mark 2' }, { check: (v) => assert(v.total === 1, 'mark 2 is in a: ' + JSON.stringify(v)) });
// no switch in between: no warning
await call('find_items', { name: 'wd mark 2' }, { check: (v, r) => assert(!/went back/.test(txt(r)), 'no warning without a switch') });
await call('documents', { action: 'close', discard: true }); // a
await call('documents', { action: 'close', discard: true }); // b
process.exit((await done()) || process.exitCode ? 1 : 0);
