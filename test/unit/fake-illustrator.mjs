// A bridge (same NDJSON protocol as src/bridge/bridge-mac.js) whose "Illustrator" is the DOM shim in a Node vm.
// It runs the real runtime and the real dispatch wrapper, so server tests cover everything except Apple events.
import { createInterface } from 'node:readline';
import vm from 'node:vm';
import { makeContext } from './shim.mjs';

const { ctx } = makeContext();
const send = (o) => process.stdout.write(JSON.stringify(o) + '\n');
send({ id: 0, ok: true, result: 'ready' });
createInterface({ input: process.stdin }).on('line', (line) => {
  const req = JSON.parse(line);
  if (req.op === 'running') return send({ id: req.id, ok: true, result: 'yes' });
  if (req.op === 'activate') return send({ id: req.id, ok: true, result: 'ok' });
  if (req.op !== 'js') return send({ id: req.id, ok: false, error: 'unknown op' });
  try {
    const r = vm.runInContext(req.code, ctx);
    send({ id: req.id, ok: true, result: r === undefined ? '' : String(r) });
  } catch (e) {
    send({ id: req.id, ok: false, errno: 5001, error: String(e.message) });
  }
});
