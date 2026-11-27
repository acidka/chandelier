// Plan-then-run overhead (docs/research/plan-then-run-plan.md R8): time to make a plan (probe + fingerprint) and to run
// it, vs the same batch without approval, on a scratch document with N items (default 100 and 5000). Closes it after.
import { connect } from '../test/live-lib.mjs';

const { client, done } = await connect('plan-bench', { env: { CHANDELIER_APPROVE_CHANNEL: 'chat' } });
const raw = (name, args) => client.callToolUnguarded({ name, arguments: args });
const t = async (fn) => { const s = performance.now(); const r = await fn(); return [performance.now() - s, r]; };
const txt = (r, i = 0) => r.content[i]?.text ?? '';
const rows = [];
for (const n of (process.argv[2] ?? '100,5000').split(',').map(Number)) {
  await raw('documents', { action: 'new', width: 600, height: 600, title: `plan-bench-${n}` });
  await raw('run_script', { code: `AIA.layer('Items');for(var i=0;i<${n};i++)AIA.rect((i%100)*6,Math.floor(i/100)*6,5,5,{fill:'gray(50)',name:'b'+i});return ${n};` });
  const steps = [{ tool: 'modify_items', args: { refs: 'layer:Items', opacity: 80 } }];
  const [plain] = await t(() => raw('batch', { steps }));
  await raw('history', { action: 'undo' });
  await raw('configure', { approve: 'plan' });
  const [mk, made] = await t(() => raw('batch', { steps, plan: true }));
  const id = JSON.parse(txt(made, 1)).plan_id;
  const [run, ran] = await t(() => raw('batch', { plan_id: id }));
  await raw('configure', { approve: 'off' });
  rows.push({ items: n, batch_ms: Math.round(plain), plan_ms: Math.round(mk), run_ms: Math.round(run), card_chars: txt(made).length, ok: !ran.isError });
  await raw('documents', { action: 'close', name: `plan-bench-${n}`, discard: true });
}
console.table(rows);
await done();
