// Plan-then-run (docs/research/plan-then-run-plan.md): classification, the runtime gate, the card, the plan store,
// making and running plans (stub runtime), elicitation and the panel card. No Illustrator needed.
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS } from '../../src/tools/index.js';
import { classify, KNOWN } from '../../src/plan/classify.js';
import { PlanStore, planId, renderCard, canon, type PlanRecord } from '../../src/plan/card.js';
import { gate, makePlan, runPlan, planShape, compare } from '../../src/plan/plan.js';
import { defaultSettings } from '../../src/settings.js';
import { createServer } from '../../src/server.js';
import { Transport } from '../../src/transport/transport.js';
import { PanelTransport, panelFile } from '../../src/transport/panel.js';
import type { Ctx } from '../../src/tools/types.js';
// @ts-expect-error untyped test helper
import { loadRuntime } from './shim.mjs';

const require = createRequire(import.meta.url);
const FAKE = fileURLToPath(new URL('./fake-illustrator.mjs', import.meta.url));

describe('classification', () => {
  it('every tool is classified (a new tool cannot slip past the gate)', () => {
    for (const t of TOOLS) expect(KNOWN.has(t.name), t.name).toBe(true);
  });
  it('reads, changes and files', () => {
    expect(classify('find_items')).toBe('read');
    expect(classify('documents', { action: 'open' })).toBe('read');
    expect(classify('documents', { action: 'new' })).toBe('change'); // P-B: approve everything
    expect(classify('documents', { action: 'save' })).toBe('files');
    expect(classify('export')).toBe('files');
    expect(classify('swatches')).toBe('read');
    expect(classify('swatches', { action: 'add' })).toBe('change');
    expect(classify('history')).toBe('read'); // P-G: undo allowed
    expect(classify('history', { action: 'redo' })).toBe('change');
    expect(classify('scene', { action: 'analyze' })).toBe('read');
    expect(classify('scene', { action: 'build' })).toBe('change');
    expect(classify('run_script', { code: 'return 1' })).toBe('change');
  });
  it('the runtime gate (A.needsPlan) agrees with the Node classifier for every batch-step tool', async () => {
    const { A, v } = loadRuntime();
    const cases: [string, any][] = [
      ['create_shape', { x: 0, y: 0, w: 1, h: 1 }], ['create_text', { text: 'a', x: 0, y: 0 }], ['edit_text', { refs: '1', contents: 'b' }],
      ['modify_items', { refs: '1', fill: 'none' }], ['delete_items', { refs: '1' }], ['transform_items', { refs: '1', dx: 1 }],
      ['duplicate_items', { refs: '1' }], ['arrange_items', { action: 'front', refs: '1' }], ['align_items', { refs: '1', align: 'left' }],
      ['layers', {}], ['layers', { action: 'list' }], ['layers', { action: 'activate', name: 'a' }], ['layers', { action: 'add', name: 'a' }],
      ['artboards', { action: 'list' }], ['artboards', { action: 'add', rect: [0, 0, 1, 1] }],
      ['swatches', {}], ['swatches', { action: 'add', name: 'a', color: 'gray(1)' }], ['styles', { action: 'list' }], ['styles', { action: 'create', name: 'a' }],
      ['symbols', { action: 'list' }], ['symbols', { action: 'remove', name: 'a' }],
      ['documents', { action: 'list' }], ['documents', { action: 'activate', name: 'a' }], ['documents', { action: 'new', width: 10, height: 10 }],
      ['documents', { action: 'save' }], ['documents', { action: 'close', discard: true }],
      ['history', {}], ['history', { action: 'redo' }], ['selection', { action: 'set', refs: '1' }], ['find_items', {}], ['get_items', { refs: '1' }],
      ['menu_command', { command: 'group' }], ['run_script', { code: 'return 1' }], ['fonts', {}], ['preflight', {}],
    ];
    const tools = new Map(TOOLS.map((t) => [t.name, t]));
    const ctx = { settings: defaultSettings(), tools, tmp: tmpdir(), created: new Set() } as unknown as Ctx;
    for (const [name, args] of cases) {
      const t = tools.get(name)!;
      const st = await t.step!(args, ctx);
      expect(!!A.needsPlan(st.cmd, v(st.args)), `${name} ${JSON.stringify(args)}`).toBe(classify(name, args) !== 'read');
    }
    // a batch needs a plan when any step does
    expect(A.needsPlan('batch', v({ steps: [{ cmd: 'find_items', args: {} }] }))).toBe(false);
    expect(A.needsPlan('batch', v({ steps: [{ cmd: 'find_items', args: {} }, { cmd: 'create_shape', args: {} }] }))).toBe(true);
  });
  it('the runtime refuses changing commands in approval mode unless a plan runs', () => {
    const { dispatch } = loadRuntime();
    const deny = dispatch({ cmd: 'delete_items', args: { refs: 'selection' }, settings: { approve: 'plan' } });
    expect(deny.ok).toBe(false);
    expect(deny.error).toMatch(/Needs an approved plan/);
    expect(dispatch({ cmd: 'ping', args: {}, settings: { approve: 'plan' } }).ok).toBe(true);
    expect(dispatch({ cmd: 'delete_items', args: { refs: 'selection' }, settings: { approve: 'plan', plan_run: 'x' } }).ok).toBe(true);
    expect(dispatch({ cmd: 'delete_items', args: { refs: 'selection' }, settings: { approve: 'off' } }).ok).toBe(true);
  });
});

describe('runtime probe and fingerprint', () => {
  it('counts the items a step names, per layer; the fingerprint changes when they move', () => {
    const rt = loadRuntime();
    const r = rt.ctx.app.activeDocument.layers[0].pathItems.rectangle(100, 10, 20, 20);
    r.name = 'Box';
    const probe = rt.dispatch({ cmd: 'plan_probe', args: { steps: [{ cmd: 'delete_items', args: { refs: r.uuid } }, { cmd: 'modify_items', args: { refs: '@0' } }, { cmd: 'find_items', args: {} }] } });
    expect(probe.ok).toBe(true);
    const [del, mod, find] = probe.data.steps;
    expect(del).toMatchObject({ step: 0, count: 1, layers: [['Layer 1', 1]], uuids: [r.uuid] });
    expect(mod).toMatchObject({ from_steps: [0] });
    expect(find.read).toBe(true);
    const h1 = probe.data.fp.h;
    expect(h1).toMatch(/^[0-9a-f]{16}$/);
    const again = rt.dispatch({ cmd: 'plan_probe', args: { steps: [{ cmd: 'delete_items', args: { refs: r.uuid } }] } }).data.fp.h;
    expect(again).toBe(h1);
    r.visibleBounds = [11, 100, 31, 80];
    expect(rt.dispatch({ cmd: 'plan_probe', args: { steps: [{ cmd: 'delete_items', args: { refs: r.uuid } }] } }).data.fp.h).not.toBe(h1);
  });
  it('a batch with a plan refuses to run on a changed document, and makes the undo marker first', () => {
    const rt = loadRuntime();
    const steps = [{ cmd: 'find_items', args: {} }];
    const fp = rt.dispatch({ cmd: 'plan_probe', args: { steps } }).data.fp;
    const ok = rt.dispatch({ cmd: 'batch', args: { steps, plan: { h: fp.h, fp } }, settings: { approve: 'plan', plan_run: 't' } });
    expect(ok.ok).toBe(true);
    expect(ok.data.marker).toBe(true);
    rt.ctx.app.activeDocument.layers[0].pathItems.rectangle(0, 0, 1, 1); // the document changed
    const drift = rt.dispatch({ cmd: 'batch', args: { steps, plan: { h: fp.h, fp } }, settings: { approve: 'plan', plan_run: 't' } });
    expect(drift.ok).toBe(false);
    expect(drift.error).toMatch(/^DRIFT: .*items 0 → 1/);
  });
});

describe('plan card and store', () => {
  const rec = {
    id: 'ab12cd34', seq: 1, units: 'pt', channel: 'chat' as const, layers: ['Artwork', 'Bg', 'Notes'],
    fp: { h: 'x', doc: 'flyer.ai', path: '/jobs/flyer.ai' },
    specs: [
      { tool: 'swatches', args: { action: 'recolor', refs: 'layer:Artwork', to: ['Brand Navy', 'Brand Orange'] } },
      { tool: 'edit_text', args: { refs: 'name:Headline', contents: 'Spring sale' } },
      { tool: 'run_script', args: { code: 'x()' } },
      { tool: 'export', args: { format: 'pdf', path: '/out/flyer.pdf' } },
    ],
    probe: [
      { step: 0, cmd: 'swatches', count: 148, layers: [['Artwork', 148]] as [string, number][] },
      { step: 1, cmd: 'edit_text', count: 1, layers: [['Artwork', 1]] as [string, number][], texts: [['Headline', 'Summer sale']] as [string, string][] },
      { step: 2, cmd: 'script', opaque: true },
    ],
    files: [{ step: 3, what: 'export' as const, path: '/out/flyer.pdf', format: 'pdf', exists: false }],
  };
  it('says what changes, where, which files are written, what is untouched; opaque steps first', () => {
    const card = renderCard(rec);
    const lines = card.split('\n');
    expect(lines[0]).toBe('Plan ab12cd34 · "flyer.ai" (/jobs/flyer.ai) · 3 steps + 1 file step');
    expect(lines[1]).toMatch(/^  ! step 2 run_script: script \(3 chars\): effect unknown until it runs$/);
    expect(card).toMatch(/Recolour 148 items on layer "Artwork" → "Brand Navy", "Brand Orange"/);
    expect(card).toMatch(/Text     "Headline": "Summer sale" → "Spring sale"/);
    expect(card).toMatch(/Write    \/out\/flyer.pdf \(pdf\) — new file/);
    expect(card).toMatch(/Untouched: 2 other layers \("Bg", "Notes"\)/);
    expect(card).toMatch(/Undo: +one step/);
    expect(card).toMatch(/Show this card to the designer/);
    expect(lines.length).toBeLessThanOrEqual(15);
  });
  it('plan ids do not depend on key order; the store expires and caps open plans', () => {
    expect(canon({ b: 1, a: [{ d: 1, c: 2 }] })).toBe(canon({ a: [{ c: 2, d: 1 }], b: 1 }));
    expect(planId([{ tool: 'a', args: { x: 1, y: 2 } }], 'h', [])).toBe(planId([{ tool: 'a', args: { y: 2, x: 1 } }], 'h', []));
    const st = new PlanStore(2);
    const mk = (id: string, expires = Date.now() + 1000) => st.add({ id, status: 'pending', expires } as PlanRecord);
    mk('a'); mk('b'); mk('c');
    expect(st.get('a')!.status).toBe('expired');
    expect(st.get('c')!.status).toBe('pending');
    mk('d', Date.now() - 1);
    expect(st.get('d')!.status).toBe('expired');
  });
  it('plan shape: one document, documents new first, file steps last', () => {
    expect(planShape([{ tool: 'create_shape', args: {} }, { tool: 'export', args: {} }])).toEqual({ fileFrom: 1 });
    expect(planShape([{ tool: 'export', args: {} }, { tool: 'create_shape', args: {} }])).toMatch(/go last/);
    expect(planShape([{ tool: 'create_shape', args: {} }, { tool: 'documents', args: { action: 'new' } }])).toMatch(/first step/);
    expect(planShape([{ tool: 'documents', args: { action: 'open', path: 'x' } }])).toMatch(/one document/);
    expect(planShape([{ tool: 'scene', args: {} }])).toMatch(/can't be part/);
  });
  it('reports where the run did something other than planned', () => {
    const r = { specs: [{ tool: 'delete_items', args: { refs: 'layer:A' } }, { tool: 'create_shape', args: { items: [{}, {}] } }], probe: [{ step: 0, cmd: 'delete_items', count: 3 }, { step: 1, cmd: 'create_shape' }] } as unknown as PlanRecord;
    expect(compare(r, [{ ok: true, data: { deleted: 2 } }, { ok: true, data: { count: 2 } }])).toEqual(['step 0 delete_items: planned 3, did 2']);
  });
});

// -- making and running plans against a stub runtime -------------------------------------------------------------------

type Call = { cmd: string; args: any; opt?: any };
function stubCtx(handler: (c: Call, n: number) => any) {
  const calls: Call[] = [];
  const settings = { ...defaultSettings(), approve: 'plan' as const };
  const ctx = {
    T: { call: async () => ({ ok: true }) },
    rt: { cmd: async (cmd: string, args: any = {}, opt?: any) => { const c = { cmd, args, opt, run: settings.plan_run }; calls.push(c); return handler(c, calls.length); } },
    tmp: tmpdir(), created: new Set(), settings, tools: new Map(TOOLS.map((t) => [t.name, t])), plans: new PlanStore(),
  } as unknown as Ctx;
  return { ctx, calls };
}
const FP = { h: 'aaaa', doc: 'D.ai', path: null, items: 3, layers: 'L' };
const probeReply = (h = 'aaaa') => ({ ok: true, data: { fp: { ...FP, h }, steps: [{ step: 0, cmd: 'create_shape', layer: 'L' }, { step: 1, cmd: 'delete_items', count: 2, layers: [['L', 2]] }], layers: ['L'] } });
const STEPS = [{ tool: 'create_shape', args: { x: 0, y: 0, w: 10, h: 10 } }, { tool: 'delete_items', args: { refs: 'name:Old*' } }];
const text = (r: any, i = 0) => r.content[i].text as string;

describe('gate', () => {
  it('refuses changes in approval mode, lets reads and plans through', () => {
    const { ctx } = stubCtx(() => ({ ok: true }));
    const t = (n: string) => ctx.tools.get(n)!;
    expect(gate(t('create_shape'), {}, ctx)).toMatch(/needs an approved plan/);
    expect(gate(t('documents'), { action: 'new' }, ctx)).toMatch(/needs an approved plan/);
    expect(gate(t('get_items'), { refs: '1' }, ctx)).toBeNull();
    expect(gate(t('batch'), { steps: [{ tool: 'find_items', args: {} }] }, ctx)).toBeNull();
    expect(gate(t('batch'), { steps: [{ tool: 'find_items' }, { tool: 'delete_items', args: { refs: '1' } }] }, ctx)).toMatch(/step 1: delete_items/);
    expect(gate(t('batch'), { steps: STEPS, plan: true }, ctx)).toBeNull();
    expect(gate(t('scene'), { action: 'build' }, ctx)).toMatch(/scene build and refine/);
    ctx.settings.approve = 'off';
    expect(gate(t('create_shape'), {}, ctx)).toBeNull();
  });
});

describe('make and run a plan', () => {
  it('chat channel: card + plan_id; the run checks drift, makes one batch call with the token, runs once', async () => {
    const { ctx, calls } = stubCtx((c) => {
      if (c.cmd === 'plan_probe') return probeReply();
      if (c.cmd === 'batch') return { ok: true, data: { total: 2, completed: 2, marker: true, results: [{ ok: true, data: { count: 1, items: [{ uuid: '9' }] } }, { ok: true, data: { deleted: 2 } }] } };
      return { ok: true, data: null };
    });
    const made = await makePlan({ steps: STEPS, plan: true }, ctx);
    expect(made.isError).toBeFalsy();
    expect(text(made)).toMatch(/Create   1 shape on layer "L"/);
    expect(text(made)).toMatch(/Delete   2 items on layer "L"/);
    const meta = JSON.parse(text(made, 1));
    expect(meta).toMatchObject({ status: 'pending', channel: 'chat' });
    expect(calls.map((c) => c.cmd)).toEqual(['plan_probe']); // nothing changed while planning
    const ran = await runPlan({ plan_id: meta.plan_id }, ctx);
    expect(ran.isError).toBeFalsy();
    const b = calls.find((c) => c.cmd === 'batch')!;
    expect(b.args.plan.h).toBe('aaaa');
    expect((b as any).run).toMatch(/^[0-9a-f-]{36}$/); // the run token travels in the settings
    expect(ctx.settings.plan_run).toBeUndefined();
    expect(JSON.parse(text(ran))).toMatchObject({ plan_id: meta.plan_id, steps: '2/2' });
    expect(text(await runPlan({ plan_id: meta.plan_id }, ctx))).toMatch(/already ran/);
  });
  it('drift: not run, the plan is dead', async () => {
    const { ctx } = stubCtx((c) => (c.cmd === 'plan_probe' ? probeReply() : { ok: false, error: 'DRIFT: the document changed since the plan was made (items 3 → 4). Nothing was run; make a new plan.' }));
    const id = JSON.parse(text(await makePlan({ steps: STEPS, plan: true }, ctx), 1)).plan_id;
    const r = await runPlan({ plan_id: id }, ctx);
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/not run: the document changed.*items 3 → 4/);
    expect(text(await runPlan({ plan_id: id }, ctx))).toMatch(/expired/);
  });
  it('a failed step: one undo, then the fingerprint says the document is back', async () => {
    let probes = 0;
    const { ctx, calls } = stubCtx((c) => {
      if (c.cmd === 'plan_probe') return probeReply(++probes === 1 ? 'aaaa' : 'aaaa');
      if (c.cmd === 'batch') return { ok: true, data: { total: 2, completed: 2, marker: true, failed_step: 1, results: [{ ok: true, data: {} }, { ok: false, error: 'No item named "Old*".' }] } };
      return { ok: true, data: { done: 1 } };
    });
    const id = JSON.parse(text(await makePlan({ steps: STEPS, plan: true }, ctx), 1)).plan_id;
    const r = await runPlan({ plan_id: id }, ctx);
    expect(r.isError).toBe(true);
    const out = JSON.parse(text(r));
    expect(out.failed).toMatchObject({ step: 1, tool: 'delete_items', error: 'No item named "Old*".' });
    expect(out.undo).toMatch(/back to the approved start/);
    expect(calls.map((c) => c.cmd + (c.args?.action ? ':' + c.args.action : ''))).toEqual(['plan_probe', 'batch', 'history:undo', 'plan_probe']);
  });
  it('a failed step whose undo does not come back (merged calls, C31): redone and said so', async () => {
    let probes = 0;
    const { ctx, calls } = stubCtx((c) => {
      if (c.cmd === 'plan_probe') return probeReply(++probes === 1 ? 'aaaa' : 'bbbb');
      if (c.cmd === 'batch') return { ok: true, data: { total: 2, completed: 2, marker: true, failed_step: 1, results: [{ ok: true, data: {} }, { ok: false, error: 'x' }] } };
      return { ok: true, data: { done: 1 } };
    });
    const id = JSON.parse(text(await makePlan({ steps: STEPS, plan: true }, ctx), 1)).plan_id;
    const out = JSON.parse(text(await runPlan({ plan_id: id }, ctx)));
    expect(out.undo).toMatch(/was redone/);
    expect(calls.at(-1)).toMatchObject({ cmd: 'history', args: { action: 'redo' } });
  });
  it('file steps run last, after the changes, through their own tools; a plan starting with documents new closes it on failure', async () => {
    const { ctx, calls } = stubCtx((c) => {
      if (c.cmd === 'plan_probe') return { ok: true, data: { fp: { h: 'n', doc: null, open: '' }, steps: [{ step: 0, cmd: 'documents' }, { step: 1, cmd: 'create_shape', fresh: true }] } };
      if (c.cmd === 'batch') return { ok: true, data: { total: 2, completed: 2, marker: false, failed_step: 1, closed_new: ['Untitled-1'], results: [{ ok: true, data: { name: 'Untitled-1' } }, { ok: false, error: 'bad' }] } };
      return { ok: true, data: null };
    });
    const made = await makePlan({ steps: [{ tool: 'documents', args: { action: 'new', width: 100, height: 50 } }, { tool: 'create_shape', args: { x: 0, y: 0, w: 1, h: 1 } }, { tool: 'documents', args: { action: 'save', path: join(tmpdir(), 'no-such-dir-x', 'a.ai') } }], plan: true }, ctx);
    expect(text(made)).toMatch(/· "?a new document/);
    expect(text(made)).toMatch(/New      document 100 × 50 pt, 1 artboard/);
    expect(text(made)).toMatch(/Save     .*a\.ai — new file/);
    expect(text(made)).toMatch(/new document is closed without saving/);
    const out = JSON.parse(text(await runPlan({ plan_id: JSON.parse(text(made, 1)).plan_id }, ctx)));
    expect(out.undo).toMatch(/"Untitled-1" was closed without saving/);
    expect(calls.some((c) => c.cmd === 'history')).toBe(false);
    expect(calls.some((c) => c.cmd === 'documents')).toBe(false); // the save step never ran
  });
});

// -- through the MCP server (fake Illustrator) -------------------------------------------------------------------------

let client: Client | null = null, T: Transport | null = null;
afterEach(async () => { await client?.close(); T?.stop(); client = null; T = null; delete process.env.CHANDELIER_APPROVE; });
async function connect(opts: { elicit?: (req: any) => any } = {}) {
  T = new Transport({ command: process.execPath, args: [FAKE] });
  const { server, ctx } = createServer({ transport: T });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: 'test', version: '0' }, { capabilities: opts.elicit ? { elicitation: {} } : {} });
  if (opts.elicit) client.setRequestHandler(ElicitRequestSchema, async (req) => opts.elicit!(req));
  await client.connect(b);
  return ctx;
}
const call = async (name: string, args: object = {}) => {
  const r: any = await client!.callTool({ name, arguments: args });
  return { isError: !!r.isError, texts: r.content.filter((c: any) => c.type === 'text').map((c: any) => c.text) as string[] };
};

describe('server', () => {
  it('configure approve turns the gate on; reads still work; the env lock keeps it on', async () => {
    await connect();
    expect((await call('configure', { approve: 'plan' })).texts[0]).toMatch(/"approve":"plan"/);
    const r = await call('delete_items', { refs: 'selection' });
    expect(r.isError).toBe(true);
    expect(r.texts[0]).toMatch(/needs an approved plan/);
    expect((await call('find_items', {})).isError).toBe(false);
    expect((await call('configure', { approve: 'off' })).isError).toBe(false);
    expect((await call('delete_items', { refs: 'selection' })).isError).toBe(false);
    process.env.CHANDELIER_APPROVE = 'plan';
    expect((await call('configure', { approve: 'off' })).texts[0]).toMatch(/locked on/);
  });
  it('instructions say how to work when the mode is on at start', async () => {
    process.env.CHANDELIER_APPROVE = 'plan';
    await connect();
    expect(client!.getInstructions()).toMatch(/Approval mode is on/);
  });
  it('elicitation: the client asks the person; approve → runs, reject → the note goes back to the agent', async () => {
    let answer: any = { action: 'accept', content: { decision: 'approve' } }, asked = '';
    await connect({ elicit: (req) => { asked = req.params.message; return answer; } });
    await call('configure', { approve: 'plan' });
    const plan = await call('batch', { steps: [{ tool: 'find_items', args: {} }, { tool: 'selection', args: { action: 'clear' } }, { tool: 'delete_items', args: { refs: 'selection' } }], plan: true });
    expect(asked).toMatch(/^Plan [0-9a-f]{8}/);
    const meta = JSON.parse(plan.texts[1]);
    expect(meta).toMatchObject({ status: 'approved', channel: 'elicitation' });
    const ran = await call('batch', { plan_id: meta.plan_id });
    expect(ran.isError).toBe(false);
    expect(JSON.parse(ran.texts[0])).toMatchObject({ steps: '3/3' });
    answer = { action: 'accept', content: { decision: 'reject', note: 'not the headline' } };
    const no = await call('batch', { steps: [{ tool: 'delete_items', args: { refs: 'selection' } }], plan: true });
    expect(no.isError).toBe(true);
    expect(JSON.parse(no.texts[1])).toMatchObject({ status: 'rejected', note: 'not the headline' });
    expect((await call('batch', { plan_id: JSON.parse(no.texts[1]).plan_id })).texts[0]).toMatch(/rejected: "not the headline"/);
  });
  it('batch {plan_id} takes no other steps', async () => {
    await connect();
    expect((await call('batch', { plan_id: 'x', steps: [{ tool: 'find_items' }] })).texts[0]).toMatch(/can't be given with it/);
  });
});

// -- the panel card ----------------------------------------------------------------------------------------------------

describe('panel card', () => {
  it('the agent shows a card; the designer approves in the panel; the plan event carries the decision and note', async () => {
    const { createPanel } = require('../../src/cep/panel-core.js');
    const home = mkdtempSync(join(tmpdir(), 'aia-plan-panel-'));
    const scripts: string[] = [];
    const panel = createPanel({ evalScript: (code: string, cb: (r: string) => void) => { scripts.push(code); setTimeout(() => cb(code.includes('getPageItemFromUuid') ? '2' : '{"doc":null}'), 2); }, snapshot: '/*snap*/', home, pollMs: 1000 });
    await panel.start();
    const PT = new PanelTransport({ file: panelFile(home), retryMs: 0, command: process.execPath, args: [fileURLToPath(new URL('./fake-bridge.mjs', import.meta.url))] });
    try {
      expect(await PT.card({ plan: 'p1', text: 'Plan p1 · …', uuids: ['5', '6'] })).toBe(true);
      expect(panel.info().card).toEqual({ plan: 'p1', text: 'Plan p1 · …', count: 2 });
      expect(await panel.showPlan()).toBe(2);
      expect(scripts.at(-1)).toMatch(/\["5","6"\]/);
      const since = PT.events.last;
      panel.decide('reject', ' wrong layer ');
      const evs = await PT.events.wait(since, 2000, ['plan']);
      expect(evs[0]).toMatchObject({ type: 'plan', plan: 'p1', decision: 'reject', note: 'wrong layer' });
      expect(panel.info().card).toBeNull();
    } finally { PT.stop(); panel.stop(); }
  });
});

