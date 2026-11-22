// Fake bridge speaking the bridge-mac.js protocol, for transport tests.
// js code: "echo:<s>" → result s · "sleep:<ms>" → answer after ms · "crash" → exit 3 · "err:<n>" → errno n
// env FAKE_NO_READY=1 → never sends the ready line.
import { createInterface } from 'node:readline';
const send = (o) => process.stdout.write(JSON.stringify(o) + '\n');
if (!process.env.FAKE_NO_READY) send({ id: 0, ok: true, result: 'ready' });
createInterface({ input: process.stdin }).on('line', (line) => {
  const req = JSON.parse(line);
  const c = req.code ?? '';
  if (req.op === 'running') return send({ id: req.id, ok: true, result: 'yes' });
  if (c === 'crash') { process.stderr.write('boom\n'); process.exit(3); }
  if (c.startsWith('sleep:')) return setTimeout(() => send({ id: req.id, ok: true, result: 'slept' }), +c.slice(6));
  if (c.startsWith('err:')) return send({ id: req.id, ok: false, errno: +c.slice(4), error: 'raw' });
  if (c.startsWith('echo:')) return send({ id: req.id, ok: true, result: c.slice(5) });
  send({ id: req.id, ok: true, result: 'pid:' + process.pid });
});
