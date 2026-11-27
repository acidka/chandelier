import { z } from 'zod';
import type { ToolDef } from './types.js';
import { text, fail, J } from './types.js';
import type { Ctx } from './types.js';
import { scriptPath } from '../platform.js';
import { RUNTIME_VERSION } from '../runtime.js';
import { VERSION } from '../version.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const status: ToolDef = {
  name: 'status',
  description: 'Illustrator and server state: running, version, open documents (created_here), session settings, MRAP retries, last_call (finished? created uuids: check it after a timeout), latency. launch:true starts Illustrator if needed (waits up to 2 min). restart:true quits and relaunches it, reopening the open documents (refused while any is unsaved: save or close it first) — for repeated MRAP errors in long sessions. Not needed before other tools (they say if Illustrator is off).',
  shape: { launch: z.boolean().optional(), restart: z.boolean().optional() },
  async run(a, ctx) {
    const { T, rt, settings, created } = ctx;
    if (a.restart) { ctx.plans?.expireAll(); return restart(ctx); } // uuids change on reopen: open plans can't run
    let run = await T.call('running');
    if (!run.ok) return fail(run.error ?? 'bridge error');
    if (run.result !== 'yes') {
      if (!a.launch) return text({ running: false, hint: 'Start Adobe Illustrator, or call status with launch:true.' });
      const err = await launchAndWait(ctx);
      if (err) return fail(err);
    }
    const t = performance.now();
    const env = await rt.cmd('status');
    if (!env.ok) return fail(env.error ?? 'status failed');
    const v = env.data as { documents: { name: string }[] } & Record<string, unknown>;
    const latency = Math.round((performance.now() - t) * 10) / 10;
    for (const d of v.documents as any[]) if (created.has(d.name)) d.created_here = true;
    const { timeout, ...rest } = settings;
    return text({ running: true, ...v, settings: { ...rest, timeout }, latency_ms: latency, runtime: RUNTIME_VERSION, runtime_loads: rt.loads, bridge_spawns: T.spawns, server: VERSION });
  },
};

/** Launch Illustrator and wait until the runtime answers (up to 2 min). Returns an error message or null. */
async function launchAndWait({ T, rt }: Ctx): Promise<string | null> {
  const l = await T.call('launch', { timeout: 120 });
  if (!l.ok) return 'Could not launch Illustrator: ' + l.error;
  const until = Date.now() + 120_000;
  while (Date.now() < until) {
    const env = await rt.cmd('ping', {}, 20);
    if (env.ok) return null;
    await sleep(2000);
  }
  return 'Illustrator was launched but did not answer within 2 minutes (a dialog may be open).';
}

type Doc = { name: string; saved: boolean; active?: boolean; path: string | null };

/**
 * status {restart}: the "save, restart, continue" routine for long sessions (repeated MRAP). Refuses while any open
 * document has unsaved changes or was never saved — a restart must never lose work — and names them. Otherwise quits
 * Illustrator (nothing to ask), relaunches it, reopens the documents in their order and re-activates the active one.
 */
async function restart(ctx: Ctx) {
  const { T, rt, created } = ctx;
  const t0 = performance.now();
  const run = await T.call('running');
  if (!run.ok) return fail(run.error ?? 'bridge error');
  if (run.result !== 'yes') return fail('Illustrator is not running: nothing to restart. Use status {launch:true}.');
  const env = await rt.cmd('status');
  if (!env.ok) return fail(env.error ?? 'status failed');
  const docs = (env.data as { documents: Doc[] }).documents;
  const blocked = docs.filter((d) => !d.saved || !d.path);
  if (blocked.length) {
    return fail(J({
      error: 'Not restarting: these documents have unsaved changes or were never saved. Save them (documents save / save_as) or close them, then retry.',
      documents: blocked.map((d) => ({ name: d.name, saved: d.saved, path: d.path, created_here: created.has(d.name) || undefined })),
    }));
  }
  // alerts off first: a quit can otherwise stop at "Some files are missing or modified in the Links panel…" and wait
  // for an answer (bugs.md #4); every document is saved at this point, so nothing is lost
  await T.js('try { app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS; } catch (e) {} "ok"', 10);
  const q = await T.call('quit', { timeout: 60 });
  if (!q.ok) return fail('Could not quit Illustrator: ' + q.error);
  const until = Date.now() + 60_000;
  while (Date.now() < until) {
    const r = await T.call('running');
    if (r.ok && r.result === 'no') break;
    await sleep(1000);
  }
  const still = await T.call('running');
  if (still.ok && still.result === 'yes') return fail('Illustrator did not quit within 60 s (a dialog may be open in Illustrator).');
  const err = await launchAndWait(ctx);
  if (err) return fail(err);
  const reopened: string[] = [], failed: { path: string; error: string }[] = [];
  for (const d of docs) {
    const o = await rt.cmd<{ name: string }>('documents', { action: 'open', path: scriptPath(d.path as string) });
    if (o.ok && o.data) reopened.push(o.data.name); else failed.push({ path: d.path as string, error: o.error ?? 'open failed' });
  }
  const active = docs.find((d) => d.active);
  if (active && reopened.includes(active.name)) await rt.cmd('documents', { action: 'activate', name: active.name });
  return text({ restarted: true, reopened, failed: failed.length ? failed : undefined, runtime_loads: rt.loads, s: Math.round((performance.now() - t0) / 100) / 10 });
}
