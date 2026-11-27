// Live: plan-then-run (docs/research/plan-then-run-plan.md) on a scratch document this test creates and closes.
// The gate, the card, a run as ONE undo step, drift, a failed run undone (also when its first step fails: C35),
// rehearsal, a plan that starts with documents new, file steps last. Chat channel (this client has no elicitation).
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect, assert } from './live-lib.mjs';

const { call, done } = await connect('live-plan', { env: { CHANDELIER_APPROVE_CHANNEL: 'chat' } });
const J = (r) => r.content.filter((c) => c.type === 'text').map((c) => c.text);
const meta = (r) => JSON.parse(J(r)[1]);
const out = mkdtempSync(join(tmpdir(), 'live-plan-'));

await call('documents', { action: 'new', width: 400, height: 300, title: 'live-plan' });
await call('batch', { steps: [
  { tool: 'swatches', args: { action: 'add', name: 'P1', color: 'cmyk(0,100,100,0)' } },
  { tool: 'create_text', args: { text: 'Before', x: 20, y: 50, name: 'T' } },
  { tool: 'create_shape', args: { x: 20, y: 80, w: 100, h: 60, fill: 'swatch:P1', name: 'R' } },
  { tool: 'create_shape', args: { shape: 'ellipse', x: 150, y: 80, w: 60, h: 60, fill: 'gray(50)', name: 'E' } },
] });
const state = async () => {
  const r = await call('run_script', { code: "var d=AIA.doc(),o=[];for(var i=0;i<d.pageItems.length;i++){var it=d.pageItems[i];o.push(it.name+':'+(it.typename==='TextFrame'?it.contents:AIA.colorStr(it.fillColor))+':'+Math.round(it.left));}return o.sort().join('|');" });
  return JSON.parse(J(r)[0]).result;
};
const start = await state();
console.log('start:', start);

// 1. the gate
await call('configure', { approve: 'plan' });
await call('create_shape', { x: 0, y: 0, w: 5, h: 5 }, { expectError: true, check: (v) => /needs an approved plan/.test(v) });
await call('run_script', { code: 'return 1' }, { expectError: true });
await call('find_items', { name: 'T' });
const withOff = async (fn) => { await call('configure', { approve: 'off' }); try { return await fn(); } finally { await call('configure', { approve: 'plan' }); } };
assert(await withOff(state) === start, 'nothing changed while refused');

// 2. a plan, the card, a run = one undo step
const STEPS = [
  { tool: 'edit_text', args: { refs: 'name:T', contents: 'After' } },
  { tool: 'modify_items', args: { refs: 'name:R', fill: 'cmyk(100,0,0,0)', x: 200 } },
  { tool: 'delete_items', args: { refs: 'name:E' } },
];
let p = await call('batch', { steps: STEPS, plan: true }, { check: (v, r) => /Text +"T": "Before" → "After"/.test(J(r)[0]) && /Delete +1 item on layer/.test(J(r)[0]) });
console.log(J(p)[0]);
assert(await withOff(state) === start, 'planning changed nothing');
await call('batch', { plan_id: meta(p).plan_id }, { check: (v) => v.steps === '3/3' });
const after = await withOff(state);
assert(/T:After/.test(after) && !/E:/.test(after) && /R:cmyk\(100,0,0,0\):200/.test(after), 'the plan ran: ' + after);
await call('batch', { plan_id: meta(p).plan_id }, { expectError: true, check: (v) => /already ran/.test(v) });
await call('history', { action: 'undo' });
assert(await withOff(state) === start, 'one undo takes the whole plan back');

// 3. drift: the document changes between plan and run
p = await call('batch', { steps: [{ tool: 'modify_items', args: { refs: 'name:R', opacity: 50 } }], plan: true });
await withOff(() => call('transform_items', { refs: 'name:R', dx: 5 }));
await call('batch', { plan_id: meta(p).plan_id }, { expectError: true, check: (v) => /changed since the plan was made/.test(v) });
await withOff(() => call('history', { action: 'undo' }));
assert(await withOff(state) === start, 'back after the drift test');

// 4. a failed run is undone (with earlier steps that changed things)
p = await call('batch', { steps: [...STEPS.slice(0, 2), { tool: 'modify_items', args: { refs: 'name:Nope', opacity: 10 } }], plan: true },
  { check: (v, r) => /! step 2 modify_items: "name:Nope" not found now/.test(J(r)[0]) });
await call('batch', { plan_id: meta(p).plan_id }, { expectError: true, check: (v) => /back to the approved start/.test(v.undo) });
assert(await withOff(state) === start, 'failed run undone');

// 5. … and when the first step fails (no change: the marker makes it an undo step, C35)
p = await call('batch', { steps: [{ tool: 'modify_items', args: { refs: 'name:Nope', opacity: 10 } }], plan: true });
await call('batch', { plan_id: meta(p).plan_id }, { expectError: true, check: (v) => /back to the approved start/.test(v.undo) });
assert(await withOff(state) === start, 'a first-step failure did not undo earlier work: ' + await withOff(state));

// 6. rehearsal: runs, renders, undoes
p = await call('batch', { steps: [{ tool: 'create_shape', args: { x: 300, y: 200, w: 50, h: 50, fill: 'gray(80)', name: 'Rh' } }], plan: 'rehearse' },
  { check: (v, r) => /Rehearsed: ran, rendered/.test(J(r)[0]) && r.content.some((c) => c.type === 'image') });
assert(await withOff(state) === start, 'rehearsal left nothing');
await call('batch', { plan_id: meta(p).plan_id });
assert(/Rh:/.test(await withOff(state)), 'rehearsed plan still runs');
await withOff(() => call('history', { action: 'undo' }));

// 7. file steps last: export after the change
const png = join(out, 'plan.png');
p = await call('batch', { steps: [{ tool: 'modify_items', args: { refs: 'name:R', opacity: 60 } }, { tool: 'export', args: { format: 'png', path: png } }], plan: true },
  { check: (v, r) => /Write +.*plan\.png \(png\) — new file/.test(J(r)[0]) });
await call('batch', { plan_id: meta(p).plan_id }, { check: (v) => Array.isArray(v.files) && v.files.length === 1 });
assert(existsSync(png), 'exported');

// 8. a plan that starts with documents new: a failure closes the new document
const before = await call('documents', { action: 'list' });
p = await call('batch', { steps: [{ tool: 'documents', args: { action: 'new', width: 100, height: 100, title: 'live-plan-new' } }, { tool: 'modify_items', args: { refs: 'name:Nope', opacity: 1 } }], plan: true },
  { check: (v, r) => /New +document 100 × 100/.test(J(r)[0]) });
await call('batch', { plan_id: meta(p).plan_id }, { expectError: true, check: (v) => /closed without saving/.test(v.undo) });
await call('documents', { action: 'list' }, { check: (v) => JSON.stringify(v) === J(before)[0] || console.log('list', v, J(before)[0]) });

await call('configure', { approve: 'off' });
await call('documents', { action: 'close', name: 'live-plan', discard: true });
process.exit(await done() ? 1 : 0);
