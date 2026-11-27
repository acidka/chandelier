// Plan-then-run (docs/research/plan-then-run-plan.md): the gate, making a plan (probe + card + approval), running an
// approved plan (drift check, one undo step, undo on failure, file steps last) and multi-file plans.
import { randomUUID } from 'node:crypto';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { resolve, join, basename, extname } from 'node:path';
import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Ctx, ToolDef, Step } from '../tools/types.js';
import { fail, J, ArgError } from '../tools/types.js';
import { clip, errorText, respond, runStep } from '../tools/respond.js';
import { project } from '../tools/brief.js';
import { scriptPaths } from '../platform.js';
import { PanelTransport } from '../transport/panel.js';
import { fillPattern } from '../data.js';
import { log } from '../log.js';
import { classify, UNPLANNABLE } from './classify.js';
import { PlanStore, planId, renderCard, TTL_MS, type Spec, type Probe, type Fingerprint, type FileOut, type PlanRecord, type Channel } from './card.js';

// late imports (batch.ts imports this module)
const batchMod = () => import('../tools/batch.js');

const store = (ctx: Ctx): PlanStore => (ctx.plans ??= new PlanStore());
const isFileStep = (s: Spec) => s.tool === 'export' || (s.tool === 'documents' && ['save', 'save_as', 'close'].includes(s.args?.action));
const NEXT = 'Send the whole job as ONE batch {steps: [...], plan: true} (saves, closes and exports last), show the designer the card, then batch {plan_id}.';

// -- the gate ----------------------------------------------------------------------------------------------------------

/** null = the call may run; else why not (approval mode on, no plan). */
export function gate(tool: ToolDef | undefined, args: any, ctx: Ctx): string | null {
  if (!tool || ctx.settings.approve !== 'plan') return null;
  const a = args ?? {};
  if (tool.name === 'tools') return a.call ? gate(ctx.tools.get(a.call), a.args ?? {}, ctx) : null;
  if (tool.name === 'batch') {
    if (a.plan || a.plan_id !== undefined) return null;
    if (a.files) return `batch {files}: approval mode is on. Add plan: true to see what it does to each file, then batch {plan_id}.`;
    const steps = Array.isArray(a.steps) ? a.steps : [];
    const bad = steps.findIndex((s: any) => classify(s?.tool, s?.args ?? {}) !== 'read');
    if (bad < 0 && !a.steps_file) return null;
    if (ctx.planRunning) return 'A plan is running: wait for it to finish.';
    return `batch${bad >= 0 ? ` (step ${bad}: ${steps[bad].tool})` : ' steps_file'}: needs an approved plan (approval mode is on). Add plan: true to this call to get the card and a plan_id, show it to the designer, then batch {plan_id}.`;
  }
  const kind = classify(tool.name, a);
  if (kind === 'read') return null;
  if (ctx.planRunning) return 'A plan is running: wait for it to finish.';
  if (UNPLANNABLE[tool.name]) return `${tool.name}: approval mode is on, and ${UNPLANNABLE[tool.name]}.`;
  return `${tool.name}${a.action ? ' ' + a.action : ''}: needs an approved plan (approval mode is on). ${NEXT}`;
}

// -- making a plan -----------------------------------------------------------------------------------------------------

interface PlanArgs { steps?: Spec[]; plan?: true | 'rehearse'; timeout?: number; files?: string[]; [k: string]: unknown }

/** Check the steps' shape for a plan: one document, documents new only first, file steps last. A string = the error. */
export function planShape(specs: Spec[]): { fileFrom: number } | string {
  let fileFrom = specs.length;
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i], act = s.args?.action;
    if (UNPLANNABLE[s.tool] || s.tool === 'batch') return `step ${i}: ${s.tool} can't be part of a plan`;
    if (s.tool === 'documents' && (act === 'open' || act === 'activate')) return `step ${i}: a plan works on one document: open or activate it before planning`;
    if (s.tool === 'documents' && act === 'new' && i > 0) return `step ${i}: documents new can only be the first step of a plan`;
    if (s.tool === 'documents' && act === 'save' && (s.args.export || s.args.close)) return `step ${i}: give export and close as their own steps in a plan (export {…}, documents close)`;
    if (isFileStep(s)) { if (fileFrom === specs.length) fileFrom = i; }
    else if (fileFrom < specs.length) return `step ${i}: ${s.tool} after a save / close / export step — those go last`;
  }
  return { fileFrom };
}

/** Where file steps write. */
export function fileOuts(specs: Spec[], from: number, doc: string | null): FileOut[] {
  const out: FileOut[] = [];
  for (let i = from; i < specs.length; i++) {
    const a = specs[i].args ?? {};
    if (specs[i].tool === 'export') {
      const p = a.path ? resolve(String(a.path)) : undefined;
      out.push({ step: i, what: 'export', path: p, format: a.format, exists: !!p && existsSync(p) && !statSync(p).isDirectory(), note: a.artboards !== undefined ? `artboards ${J(a.artboards)}` : undefined });
    } else if (a.action === 'close') out.push({ step: i, what: 'close', note: `${a.name ?? doc ?? 'the document'}${a.save ? ', saved first' : a.discard ? ', unsaved changes discarded' : ''}` });
    else {
      const p = a.path ? resolve(String(a.path)) : undefined;
      out.push({ step: i, what: 'save', path: p ?? `${a.name ?? doc ?? 'the document'} (in place)`, format: a.format, exists: p ? existsSync(p) : true });
    }
  }
  return out;
}

async function validateFileSteps(specs: Spec[], from: number, ctx: Ctx): Promise<string | null> {
  for (let i = from; i < specs.length; i++) {
    const t = ctx.tools.get(specs[i].tool)!;
    const r = z.object(t.shape).strict().safeParse(specs[i].args ?? {});
    if (!r.success) return `step ${i} (${specs[i].tool}): ` + r.error.issues.map((x) => `${x.path.join('.') || 'args'}: ${x.message}`).join('; ');
    specs[i] = { ...specs[i], args: r.data };
  }
  return null;
}

const runtimeSteps = (steps: Step[]) => steps.map((s) => ({ cmd: s.cmd, args: scriptPaths(s.args), settings: s.settings }));

export async function makePlan(a: PlanArgs, ctx: Ctx): Promise<CallToolResult> {
  if (a.files) return makeFilesPlan(a, ctx);
  const specs: Spec[] = (a.steps ?? []).map((s: any) => ({ tool: s.tool, args: s.args ?? {}, ...(s.artboard !== undefined ? { artboard: s.artboard } : {}) }));
  const shape = planShape(specs);
  if (typeof shape === 'string') return fail(shape);
  const { parseSteps } = await batchMod();
  const ps = await parseSteps(specs.slice(0, shape.fileFrom), ctx);
  if (typeof ps === 'string') return fail(ps);
  specs.splice(0, shape.fileFrom, ...specs.slice(0, shape.fileFrom).map((s, i) => ({ ...s, args: ps.parsed[i] as Record<string, any> })));
  const bad = await validateFileSteps(specs, shape.fileFrom, ctx);
  if (bad) return fail(bad);
  const env = await ctx.rt.cmd<{ fp: Fingerprint; steps: Probe[]; layers?: string[] }>('plan_probe', { steps: runtimeSteps(ps.steps) });
  if (!env.ok) return { content: [{ type: 'text', text: errorText(env) }], isError: true };
  const { fp, steps: probe, layers } = env.data!;
  const files = fileOuts(specs, shape.fileFrom, fp.doc);
  const st = store(ctx);
  const id = planId(specs, fp.h, files);
  const old = st.get(id);
  if (old && (old.status === 'pending' || old.status === 'approved')) return planReply(old, ctx, 'the same plan is already open');
  const rec: PlanRecord = {
    id, kind: 'doc', specs, fileFrom: shape.fileFrom, probe, fp, files, card: '', created: Date.now(), expires: Date.now() + TTL_MS,
    status: 'pending', channel: pickChannel(ctx), seq: st.next(),
  };
  const extra: CallToolResult['content'] = [];
  let rehearsed: string | undefined;
  if (a.plan === 'rehearse') {
    const r = await rehearse(rec, ps.steps, ctx);
    rehearsed = r.note;
    extra.push(...r.images);
    if (r.broken) { rec.status = 'failed'; st.add(rec); return fail(`Rehearsal of plan ${id}: ${r.note}`); }
  }
  rec.card = renderCard({ id, seq: rec.seq, specs, probe, fp, files, channel: rec.channel, layers, units: ctx.settings.units, rehearsed });
  st.add(rec);
  log({ plan: id, event: 'made', channel: rec.channel, steps: specs.length, files: files.length, doc: fp.doc });
  await askApproval(rec, ctx, a.timeout);
  const r = planReply(rec, ctx);
  r.content.push(...extra);
  return r;
}

function planReply(rec: PlanRecord, ctx: Ctx, note?: string): CallToolResult {
  const next = rec.status === 'approved' ? `approved: run it with batch {plan_id: "${rec.id}"}`
    : rec.status === 'rejected' ? 'rejected: read the note, change the job, make a new plan'
      : rec.channel === 'chat' ? `show the card to the designer as it is; when they approve, batch {plan_id: "${rec.id}"}`
        : `waiting for the designer (${rec.channel}); batch {plan_id: "${rec.id}"} runs it once they approve`;
  const meta = { plan_id: rec.id, status: rec.status, channel: rec.channel, ...(rec.decision?.note ? { note: rec.decision.note } : {}), expires_in_min: Math.max(0, Math.round((rec.expires - Date.now()) / 60_000)), next, ...(note ? { info: note } : {}) };
  return { content: [{ type: 'text', text: rec.card }, { type: 'text', text: J(meta) }], isError: rec.status === 'rejected' };
}

// -- approval channels -------------------------------------------------------------------------------------------------

function pickChannel(ctx: Ctx): Channel {
  const forced = process.env.CHANDELIER_APPROVE_CHANNEL as Channel | undefined;
  if (forced === 'panel' || forced === 'elicitation' || forced === 'chat') return forced;
  if (ctx.T instanceof PanelTransport && ctx.T.connected) return 'panel';
  if (ctx.canElicit?.()) return 'elicitation';
  return 'chat';
}

function decide(rec: PlanRecord, ok: boolean, by: Channel, note?: string): void {
  if (rec.status !== 'pending') return;
  rec.status = ok ? 'approved' : 'rejected';
  rec.decision = { at: Date.now(), by, ...(note ? { note } : {}) };
  log({ plan: rec.id, event: ok ? 'approved' : 'rejected', channel: by, soft: by === 'chat' || undefined, note: note ? note.slice(0, 200) : undefined });
}

/** Panel decisions that arrived while nobody was waiting (the agent's call timed out first). */
function pickUpPanel(rec: PlanRecord, ctx: Ctx): void {
  if (rec.status !== 'pending' || rec.channel !== 'panel' || !(ctx.T instanceof PanelTransport)) return;
  const e = ctx.T.events.since(0, ['plan']).reverse().find((x) => x.plan === rec.id);
  if (e) decide(rec, e.decision === 'approve', 'panel', typeof e.note === 'string' ? e.note : undefined);
}

async function askApproval(rec: PlanRecord, ctx: Ctx, timeoutS = 300): Promise<void> {
  if (rec.channel === 'panel') {
    const T = ctx.T;
    if (!(T instanceof PanelTransport)) return;
    const since = T.events.last;
    const uuids = [...new Set(rec.probe.flatMap((p) => p.uuids ?? []))].slice(0, 500);
    if (!(await T.card({ plan: rec.id, text: rec.card, uuids }))) { rec.channel = 'chat'; rec.card = rec.card.replace(/  → Approve or reject in the Chandelier panel in Illustrator$/, '  → Show this card to the designer and wait for their answer'); return; }
    const end = Date.now() + timeoutS * 1000;
    let seen = since;
    while (rec.status === 'pending' && Date.now() < end) {
      const evs = await T.events.wait(seen, end - Date.now(), ['plan']);
      for (const e of evs) { seen = Math.max(seen, e.seq); if (e.plan === rec.id) decide(rec, e.decision === 'approve', 'panel', typeof e.note === 'string' ? e.note : undefined); }
      if (!evs.length) break;
    }
    return;
  }
  if (rec.channel === 'elicitation') {
    if (!ctx.elicit) { rec.channel = 'chat'; return; }
    const r = await ctx.elicit(rec.card, timeoutS * 1000);
    if (r === null) { rec.channel = 'chat'; rec.card = rec.card.replace(/  → Approve or reject in the dialog$/, '  → Show this card to the designer and wait for their answer'); return; }
    if (r === 'timeout') return;
    decide(rec, r.decision === 'approve', 'elicitation', r.note);
  }
}

// -- running a plan ----------------------------------------------------------------------------------------------------

export async function runPlan(a: { plan_id: string; timeout?: number; results?: 'all' | 'errors' }, ctx: Ctx): Promise<CallToolResult> {
  const rec = store(ctx).get(String(a.plan_id));
  if (!rec) return fail(`No plan "${a.plan_id}" (plans live in this server only; a restart forgets them). ${NEXT}`);
  pickUpPanel(rec, ctx);
  if (rec.status === 'expired') return fail(`Plan ${rec.id} expired (30 min, or Illustrator restarted). Make a new plan.`);
  if (rec.status === 'rejected') return fail(`Plan ${rec.id} was rejected${rec.decision?.note ? `: "${rec.decision.note}"` : ''}. Change the job and make a new plan.`);
  if (rec.status === 'run' || rec.status === 'failed') return fail(`Plan ${rec.id} already ran (a plan runs once). Make a new plan.`);
  if (rec.status === 'pending' && rec.channel !== 'chat') return fail(`Plan ${rec.id} is not approved yet: the designer approves it in the ${rec.channel === 'panel' ? 'Chandelier panel' : 'dialog'}. Ask again after they do.`);
  if (process.env.CHANDELIER_APPROVE_CHANNEL && process.env.CHANDELIER_APPROVE_CHANNEL !== 'chat' && rec.channel === 'chat') return fail(`Plan ${rec.id}: chat approval is turned off here (CHANDELIER_APPROVE_CHANNEL=${process.env.CHANDELIER_APPROVE_CHANNEL}).`);
  if (rec.status === 'pending') decide(rec, true, 'chat');
  const token = randomUUID();
  ctx.planRunning = true;
  ctx.settings.plan_run = token;
  const t0 = performance.now();
  try {
    const r = rec.kind === 'files' ? await runFilesPlan(rec, ctx) : await runDocPlan(rec, a, ctx);
    log({ plan: rec.id, event: r.isError ? 'failed' : 'run', ms: Math.round(performance.now() - t0) });
    return r;
  } finally {
    delete ctx.settings.plan_run;
    ctx.planRunning = false;
  }
}

/** Undo the run (failed, or a rehearsal) and check the document is back to the plan's start. Quirks: a call that
 * changed nothing is no undo step (C35: the run's marker makes one); an undo sent right after a render does nothing
 * (C36: wait, then undo again); Windows may merge two calls into one step (C31: redo, say so). */
export async function undoRun(rec: PlanRecord, steps: Step[], ctx: Ctx, settleMs = 0): Promise<{ back: boolean; note: string }> {
  const probe = async () => { const r = await ctx.rt.cmd<{ fp: Fingerprint }>('plan_probe', { steps: runtimeSteps(steps) }); return r.ok ? r.data!.fp : null; };
  const ran = await probe();
  for (let attempt = 0; attempt < 2; attempt++) {
    if (settleMs || attempt) await sleep(attempt ? 500 : settleMs);
    const u = await ctx.rt.cmd('history', { action: 'undo', count: 1 });
    if (!u.ok) return { back: false, note: 'undo failed: ' + u.error + '; the document keeps what the steps before the failure did' };
    const now = await probe();
    if (now?.h === rec.fp.h) return { back: true, note: 'the document is back to the approved start (one undo)' };
    // the undo changed nothing (C36): try once more after a pause
    if (!(now && ran && now.h === ran.h)) {
      // the undo went further (two calls merged, C31) or not far enough: put it back as it was after the run
      const diff = now ? Object.keys(rec.fp).filter((k) => k !== 'h' && J(rec.fp[k]) !== J(now[k])).map((k) => `${k} ${J(rec.fp[k])} → ${J(now[k])}`).join('; ') : '';
      await ctx.rt.cmd('history', { action: 'redo', count: 1 });
      return { back: false, note: `one undo did not bring the document back to the approved start (${diff || 'an item the plan touches differs'}), so it was redone: the document keeps what the steps before the failure did — check it (find_items / preview) before going on` };
    }
  }
  return { back: false, note: 'undo had no effect (Illustrator busy?): the document keeps what the steps before the failure did — check it, then history undo' };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runDocPlan(rec: PlanRecord, a: { timeout?: number; results?: 'all' | 'errors' }, ctx: Ctx): Promise<CallToolResult> {
  const { parseSteps } = await batchMod();
  const specs = rec.specs.slice(0, rec.fileFrom);
  const ps = await parseSteps(specs, ctx);
  if (typeof ps === 'string') { rec.status = 'failed'; return fail(ps); }
  const fresh = specs[0]?.tool === 'documents' && specs[0].args.action === 'new';
  const out: Record<string, unknown> = { plan_id: rec.id };
  if (ps.steps.length) {
    if (ps.steps.some((s) => s.activate)) await ctx.T.call('activate');
    const env = await ctx.rt.cmd<any>('batch', { steps: runtimeSteps(ps.steps), stop_on_error: true, plan: { h: rec.fp.h, fp: rec.fp } }, { timeout: a.timeout });
    if (!env.ok) {
      if (/^DRIFT:/.test(env.error ?? '')) { rec.status = 'expired'; log({ plan: rec.id, event: 'drift' }); return fail(`Plan ${rec.id} not run: ${env.error!.replace(/^DRIFT: /, '')}`); }
      rec.status = 'failed';
      return { content: [{ type: 'text', text: errorText(env) }], isError: true };
    }
    const d = env.data;
    if (d.failed_step !== undefined) {
      rec.status = 'failed';
      const failed = { step: d.failed_step, tool: specs[d.failed_step]?.tool, ...d.results[d.failed_step] };
      let undo: string;
      if (fresh) undo = d.closed_new?.length ? `the new document ${d.closed_new.map((n: string) => JSON.stringify(n)).join(', ')} was closed without saving` : 'nothing to undo';
      else if (d.failed_step === 0 && d.marker === false) undo = 'not undone: the first step failed and no undo marker could be made (a locked or hidden active layer?), so an undo could take back earlier work — check the document';
      else undo = (await undoRun(rec, ps.steps, ctx)).note;
      log({ plan: rec.id, event: 'undone', step: d.failed_step });
      return fail(J({ plan_id: rec.id, failed, completed: d.completed - 1, undo, next: 'fix the step and make a new plan' }));
    }
    d.results.forEach((r: any, i: number) => { if (r.ok) { ctx.tools.get(specs[i].tool)?.after?.(r.data, ps.parsed[i], ctx); r.data = project(specs[i].tool, r.data, ps.parsed[i], ctx.settings); } });
    out.steps = `${d.completed}/${d.total}`;
    const diff = compare(rec, d.results);
    if (diff.length) out.differs_from_plan = diff;
    out.results = a.results === 'errors' ? undefined : d.results.map((r: any) => r.data);
    if (env.warnings?.length) out.warnings = env.warnings;
  }
  // file steps, in order, after every change succeeded
  const written: unknown[] = [];
  for (let i = rec.fileFrom; i < rec.specs.length; i++) {
    const s = rec.specs[i], tool = ctx.tools.get(s.tool)!;
    let r: CallToolResult;
    try { r = tool.run ? await tool.run(s.args, ctx) : respond(await runStep(tool, s.args, ctx)); } catch (e) { r = fail(e instanceof ArgError ? e.message : String((e as Error).message ?? e)); }
    const t = (r.content[0] as { text?: string })?.text ?? '';
    if (r.isError) {
      rec.status = 'failed';
      return fail(J({ ...out, files: written, failed: { step: i, tool: s.tool, error: t.slice(0, 500) }, note: 'the document changes stayed (they succeeded); files written before this step stay too' }));
    }
    let v: unknown = t; try { v = JSON.parse(t); } catch { /* text */ }
    written.push({ step: i, tool: s.tool, ...(s.args.action ? { action: s.args.action } : {}), result: v });
  }
  if (written.length) out.files = written;
  rec.status = 'run';
  out.undo = rec.fp.doc || fresh ? 'one step (history undo) takes the whole plan back; written files stay' : undefined;
  return { content: [{ type: 'text', text: clip(J(out)) }] };
}

/** Planned counts vs what the steps reported (a probe that was wrong shows here). */
export function compare(rec: PlanRecord, results: { ok: boolean; data?: any }[]): string[] {
  const out: string[] = [];
  rec.probe.forEach((p, i) => {
    const d = results[i]?.data;
    if (p.read || !d || typeof d !== 'object') return;
    const spec = rec.specs[i];
    let planned: number | undefined;
    if (/^create_/.test(spec.tool) && !spec.args.grid) planned = Array.isArray(spec.args.items) ? spec.args.items.length : 1;
    else if (p.count !== undefined && !p.from_steps?.length && !p.unresolved?.length) planned = p.count;
    const actual = typeof d.count === 'number' ? d.count : typeof d.deleted === 'number' ? d.deleted : Array.isArray(d.items) ? d.items.length : undefined;
    if (planned !== undefined && actual !== undefined && planned !== actual) out.push(`step ${i} ${spec.tool}: planned ${planned}, did ${actual}`);
  });
  return out;
}

// -- rehearsal (P-C: in place, render, undo) --------------------------------------------------------------------------

async function rehearse(rec: PlanRecord, steps: Step[], ctx: Ctx): Promise<{ note: string; images: CallToolResult['content']; broken?: boolean }> {
  if (!steps.length) return { note: 'nothing to rehearse (file steps only)', images: [] };
  const fresh = rec.specs[0]?.tool === 'documents' && rec.specs[0].args.action === 'new';
  const token = randomUUID();
  ctx.planRunning = true;
  ctx.settings.plan_run = token;
  try {
    if (steps.some((s) => s.activate)) await ctx.T.call('activate');
    const png = join(ctx.tmp, `rehearse-${rec.id}.png`);
    const env = await ctx.rt.cmd<any>('batch', { steps: runtimeSteps(steps), stop_on_error: true, plan: { h: rec.fp.h, fp: rec.fp, render: png, max_px: 900 } });
    if (!env.ok) return { note: 'could not run: ' + env.error, images: [], broken: /^DRIFT:/.test(env.error ?? '') };
    const d = env.data;
    let images: CallToolResult['content'] = [], note: string;
    if (d.failed_step !== undefined) note = `step ${d.failed_step} failed: ${d.results[d.failed_step]?.error}`;
    else {
      try { images = [{ type: 'image', data: readFileSync(png).toString('base64'), mimeType: 'image/png' }]; } catch { /* no render */ }
      note = images.length ? 'ran, rendered (image below) and undone' : `ran and undone (no render${d.render_error ? ': ' + d.render_error : ''})`;
    }
    if (fresh) {
      if (d.failed_step === undefined) await ctx.rt.cmd('documents', { action: 'close', discard: true });
      return { note: note.replace('undone', 'closed without saving'), images };
    }
    if (d.failed_step === 0 && d.marker === false) return { note: note + '; nothing to undo (no undo marker, first step failed)', images };
    const u = await undoRun(rec, steps, ctx, 500); // C36: an undo right after a render does nothing
    if (!u.back) return { note: `${note}; ${u.note}`, images, broken: true };
    return { note, images };
  } finally {
    delete ctx.settings.plan_run;
    ctx.planRunning = false;
  }
}

// -- multi-file jobs (batch {files, plan: true}) ------------------------------------------------------------------------

async function makeFilesPlan(a: PlanArgs, ctx: Ctx): Promise<CallToolResult> {
  const { parseSteps, eachFile, expandFiles } = await batchMod();
  const specs: Spec[] = (a.steps ?? []).map((s: any) => ({ tool: s.tool, args: s.args ?? {}, ...(s.artboard !== undefined ? { artboard: s.artboard } : {}) }));
  const ps = await parseSteps(specs, ctx);
  if (typeof ps === 'string') return fail(ps);
  let paths: string[];
  try { paths = expandFiles(a.files!); } catch (e) { return fail((e as Error).message); }
  if (!paths.length) return fail('files: nothing matched ' + J(a.files));
  const { plan: _p, timeout: _t, ...job } = a;
  const save = (job.save as string) ?? 'copy';
  // the dry run opens each file, runs the steps and closes it without saving: allowed while making the plan
  const token = randomUUID();
  ctx.planRunning = true;
  ctx.settings.plan_run = token;
  let dry: CallToolResult;
  try { dry = await eachFile({ ...job, dry_run: true }, ctx, ps.steps, ps.parsed); } finally { delete ctx.settings.plan_run; ctx.planRunning = false; }
  const report = JSON.parse((dry.content[0] as { text: string }).text);
  const files: FileOut[] = [];
  let n = 0;
  for (const f of paths) {
    n++;
    if (save === 'copy' && job.out_dir) { const p = join(resolve(String(job.out_dir)), basename(f)); files.push({ step: -1, what: 'save', path: p, exists: existsSync(p) }); }
    else if (save === 'in_place') files.push({ step: -1, what: 'save', path: f, exists: true, note: '(the original)' });
    for (const spec of (job.export as any[]) ?? []) {
      const p = resolve(fillPattern(String(spec.path), { name: basename(f, extname(f)) }, n));
      files.push({ step: -1, what: 'export', path: p, format: spec.format, exists: existsSync(p) });
    }
  }
  const st = store(ctx);
  const stats = paths.map((p) => { const s = statSync(p); return { path: p, mtime: s.mtimeMs, size: s.size }; });
  const id = planId(specs, J(stats), files);
  const lines = [`Plan ${id} · ${paths.length} files · ${specs.length} steps each · save ${save}`];
  for (const r of report.results as any[]) lines.push(`  ${r.ok ? 'ok  ' : r.skipped ? 'skip' : 'FAIL'}  ${r.file}${r.steps ? ` (${r.steps} steps)` : ''}${r.skipped ? ': ' + r.skipped : ''}${r.error ? ': ' + (typeof r.error === 'string' ? r.error : J(r.error)).slice(0, 160) : ''}`);
  for (const f of files.slice(0, 20)) lines.push(`  ${(f.what === 'save' ? 'Save' : 'Write').padEnd(9)}${f.path}${f.format ? ` (${f.format})` : ''}${f.note ? ' ' + f.note : ''} — ${f.exists ? 'OVERWRITES' : 'new file'}`);
  if (files.length > 20) lines.push(`  … ${files.length - 20} more files`);
  lines.push('  A file changed on disk after this plan is skipped when it runs');
  const rec: PlanRecord = {
    id, kind: 'files', specs, fileFrom: specs.length, probe: [], fp: { h: id, doc: null }, files, card: '', created: Date.now(), expires: Date.now() + TTL_MS,
    status: 'pending', channel: pickChannel(ctx), seq: st.next(), job: { args: job, files: stats },
  };
  lines.push(rec.channel === 'panel' ? '  → Approve or reject in the Chandelier panel in Illustrator' : rec.channel === 'elicitation' ? '  → Approve or reject in the dialog' : '  → Show this card to the designer and wait for their answer');
  rec.card = lines.join('\n');
  st.add(rec);
  log({ plan: id, event: 'made', kind: 'files', files: paths.length, channel: rec.channel });
  await askApproval(rec, ctx, a.timeout);
  return planReply(rec, ctx);
}

async function runFilesPlan(rec: PlanRecord, ctx: Ctx): Promise<CallToolResult> {
  const { parseSteps, eachFile } = await batchMod();
  const ps = await parseSteps(rec.specs, ctx);
  if (typeof ps === 'string') { rec.status = 'failed'; return fail(ps); }
  const was = new Map(rec.job!.files.map((f) => [f.path, f]));
  const skip = (file: string) => {
    const f = was.get(file);
    if (!f) return 'not in the plan';
    try { const s = statSync(file); if (s.mtimeMs !== f.mtime || s.size !== f.size) return 'changed on disk after the plan was made (not run)'; } catch { return 'gone since the plan was made'; }
    return undefined;
  };
  const r = await eachFile({ ...rec.job!.args, files: rec.job!.files.map((f) => f.path), dry_run: false }, ctx, ps.steps, ps.parsed, skip);
  rec.status = r.isError ? 'failed' : 'run';
  return r;
}
