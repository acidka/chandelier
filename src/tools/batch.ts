import { z } from 'zod';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, basename, extname, join } from 'node:path';
import type { ToolDef, Step, Ctx } from './types.js';
import { fail, J, ArgError } from './types.js';
import { clip, errorText, runStep } from './respond.js';
import { scriptPaths } from '../platform.js';
import { documents } from './documents.js';
import { export_tool } from './export.js';
import { fillPattern } from '../data.js';

interface StepResult { ok: boolean; data?: unknown; error?: string; line?: number; where?: string }
interface BatchData { completed: number; total: number; failed_step?: number; rolled_back?: number; results: StepResult[] }

export const batch: ToolDef = {
  name: 'batch',
  description: `Run many tool steps in ONE call (one round trip to Illustrator). steps: [{tool, args, artboard?}] — artboard: this step's coordinates start at that artboard's top-left; any tool except status, configure, preview, export and batch.
Refer to an earlier step's items with "@n" (0-based step index) wherever a ref is accepted, e.g. {tool:"selection", args:{action:"set", refs:"@0"}}.
stop_on_error (default true): stop at the first failing step. rollback (default false): if a step fails, delete the items created during the batch (not raw API creations in run_script) and close an empty new document.
results: "all" (default) | "errors" (failures + counts, for big batches).
steps_file: a JSON file with the steps (array or {steps}) instead of steps.
files: run the steps on each file (paths, folders, globs like "jobs/*.ai"): open → steps → save → export → close. save: "copy" (default: into out_dir, originals untouched) | "in_place" (overwrites) | "none". export: [{format, path with {name} = file stem, …}]. Files already open are skipped. dry_run:true → open, run, report, close without saving or exporting.`,
  shape: {
    steps: z.array(z.object({ tool: z.string(), args: z.record(z.string(), z.any()).optional(), artboard: z.number().min(0).optional() })).min(1).max(1000).optional(),
    steps_file: z.string().optional(),
    stop_on_error: z.boolean().optional(),
    rollback: z.boolean().optional(),
    results: z.enum(['all', 'errors']).optional(),
    timeout: z.number().optional().describe('seconds for the whole batch, default from configure'),
    files: z.array(z.string()).min(1).max(500).optional(),
    out_dir: z.string().optional(),
    save: z.enum(['copy', 'in_place', 'none']).optional(),
    export: z.array(z.record(z.string(), z.any())).max(10).optional(),
    dry_run: z.boolean().optional(),
  },
  async run(a, ctx) {
    const { T, rt, tools } = ctx;
    if (a.steps_file) {
      let parsed: any;
      try { parsed = JSON.parse(readFileSync(resolve(a.steps_file), 'utf8')); } catch (e) { return fail(`steps_file: ${(e as Error).message}`); }
      a = { ...a, steps: Array.isArray(parsed) ? parsed : parsed?.steps };
      if (!Array.isArray(a.steps) || !a.steps.length) return fail('steps_file must hold a non-empty array of {tool, args} (or {steps: [...]})');
      if (a.steps.length > 1000) return fail('steps_file: at most 1000 steps');
    }
    if (!a.steps?.length) return fail('give steps or steps_file');
    const steps: Step[] = [];
    const parsed: unknown[] = [];
    for (let i = 0; i < a.steps.length; i++) {
      const s = a.steps[i];
      const tool = tools.get(s.tool);
      if (!tool) return fail(`step ${i}: unknown tool "${s.tool}"`);
      if (!tool.step || tool.name === 'batch') return fail(`step ${i}: ${s.tool} cannot be a batch step`);
      if (s.artboard !== undefined && !(Number.isInteger(s.artboard) && s.artboard >= 0)) return fail(`step ${i}: artboard must be an artboard index (0, 1, …)`);
      const r = z.object(tool.shape).strict().safeParse(s.args ?? {});
      if (!r.success) return fail(`step ${i} (${s.tool}): ` + r.error.issues.map((x) => `${x.path.join('.') || 'args'}: ${x.message}`).join('; '));
      try {
        const st = await tool.step(r.data, ctx);
        if (s.artboard !== undefined) st.settings = { ...st.settings, artboard: s.artboard };
        steps.push(st);
      } catch (e) {
        if (e instanceof ArgError) return fail(`step ${i} (${s.tool}): ${e.message}`);
        throw e;
      }
      parsed.push(r.data);
    }
    if (a.files) return eachFile(a, ctx, steps, parsed);
    if (a.out_dir || a.save || a.export || a.dry_run) return fail('out_dir, save, export and dry_run go with files');
    if (steps.some((s) => s.activate)) await T.call('activate');
    const env = await rt.cmd<BatchData>('batch', {
      steps: steps.map((s) => ({ cmd: s.cmd, args: scriptPaths(s.args), settings: s.settings })),
      stop_on_error: a.stop_on_error !== false, rollback: !!a.rollback,
    }, { timeout: a.timeout });
    if (!env.ok) return { content: [{ type: 'text', text: errorText(env) }], isError: true };
    const d = env.data!;
    d.results.forEach((r, i) => { if (r.ok) tools.get(a.steps[i].tool)?.after?.(r.data, parsed[i], ctx); });
    let out: unknown = d;
    if (a.results === 'errors') out = { ...d, results: d.results.map((r, i) => (r.ok ? null : { step: i, ...r })).filter(Boolean) };
    const content: { type: 'text'; text: string }[] = [{ type: 'text', text: clip(J(out)) }];
    if (env.warnings?.length) content.push({ type: 'text', text: 'warnings: ' + J(env.warnings) });
    return { content, isError: d.failed_step !== undefined };
  },
};

const DOC_EXT = /\.(ai|pdf|eps|svg)$/i;

/** Paths, folders (their Illustrator-readable files, not recursive) and globs in the file name ("jobs/*.ai"). */
export function expandFiles(list: string[]): string[] {
  const out: string[] = [];
  for (const raw of list) {
    const p = resolve(raw.replace(/^~(?=\/|$)/, process.env.HOME ?? '~'));
    const name = basename(p);
    if (/[*?]/.test(name)) {
      const dir = dirname(p);
      if (!existsSync(dir)) throw new ArgError('folder not found: ' + dir);
      const re = new RegExp('^' + name.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
      out.push(...readdirSync(dir).filter((f) => re.test(f) && !f.startsWith('.')).map((f) => join(dir, f)).filter((f) => statSync(f).isFile()));
    } else if (existsSync(p) && statSync(p).isDirectory()) {
      out.push(...readdirSync(p).filter((f) => DOC_EXT.test(f) && !f.startsWith('.')).map((f) => join(p, f)).filter((f) => statSync(f).isFile()));
    } else if (existsSync(p)) out.push(p);
    else throw new ArgError('file not found: ' + p);
  }
  return [...new Set(out)].sort();
}

interface FileResult { file: string; ok: boolean; skipped?: string; steps?: string; saved?: string; exported?: string[]; error?: unknown }

async function eachFile(a: any, ctx: Ctx, steps: Step[], parsed: unknown[]) {
  const { rt, tools } = ctx;
  let files: string[];
  try { files = expandFiles(a.files); } catch (e) { return fail((e as Error).message); }
  if (!files.length) return fail('files: nothing matched ' + J(a.files));
  const save = a.dry_run ? 'none' : a.save ?? 'copy';
  const out = a.out_dir ? resolve(a.out_dir) : undefined;
  if (save === 'copy') {
    if (!out) return fail('save "copy" (the default) needs out_dir; or save:"in_place" (overwrites the originals) / "none"');
    const clash = files.find((f) => dirname(f) === out);
    if (clash) return fail('out_dir is the folder of ' + clash + ': the copies would overwrite the originals (use another out_dir, or save:"in_place")');
  }
  for (let i = 0; i < (a.export ?? []).length; i++) {
    const r = z.object(export_tool.shape).strict().safeParse({ ...a.export[i], path: a.export[i].path ?? '.' });
    if (!r.success) return fail(`export[${i}]: ` + r.error.issues.map((x) => `${x.path.join('.') || 'args'}: ${x.message}`).join('; '));
    if (!a.export[i].path) return fail(`export[${i}] needs path (may use {name}: the file name without extension)`);
  }
  const results: FileResult[] = [];
  for (const file of files) {
    const res: FileResult = { file, ok: false };
    results.push(res);
    const o = await runStep(documents, { action: 'open', path: file }, ctx);
    if (!o.ok) { res.error = 'open: ' + o.error; continue; }
    if ((o.data as any).already_open) { res.skipped = 'already open in Illustrator: close it first'; continue; }
    const name = (o.data as { name: string }).name;
    try {
      if (steps.some((s) => s.activate)) await ctx.T.call('activate');
      const env = await rt.cmd<BatchData>('batch', { steps: steps.map((s) => ({ cmd: s.cmd, args: scriptPaths(s.args), settings: s.settings })), stop_on_error: a.stop_on_error !== false }, { timeout: a.timeout });
      if (!env.ok) { res.error = errorText(env); continue; }
      const d = env.data!;
      d.results.forEach((r, i) => { if (r.ok) tools.get(a.steps[i].tool)?.after?.(r.data, parsed[i], ctx); });
      res.steps = `${d.results.filter((r) => r.ok).length}/${d.total}`;
      if (d.failed_step !== undefined) { res.error = { step: d.failed_step, ...d.results[d.failed_step] }; continue; }
      if (a.dry_run) { res.ok = true; continue; }
      if (save !== 'none') {
        const s = await runStep(documents, save === 'copy' ? { action: 'save', name, path: join(out!, basename(file)) } : { action: 'save', name }, ctx);
        if (!s.ok) { res.error = 'save: ' + s.error; continue; }
        res.saved = (s.data as { path: string }).path;
      }
      const stem = basename(file, extname(file));
      for (const spec of a.export ?? []) {
        const path = resolve(fillPattern(String(spec.path), { name: stem }, results.length));
        const r = await export_tool.run!({ ...spec, path }, ctx);
        const t = (r.content[0] as { text: string }).text;
        if (r.isError) { res.error = 'export: ' + t; break; }
        (res.exported ??= []).push(...(JSON.parse(t).files as { path: string }[]).map((f) => f.path));
      }
      if (!res.error) res.ok = true;
    } finally {
      const c = await runStep(documents, { action: 'close', name, discard: true }, ctx);
      if (!c.ok && !res.error) { res.ok = false; res.error = 'close: ' + c.error; }
    }
  }
  const ok = results.filter((r) => r.ok).length, skipped = results.filter((r) => r.skipped).length;
  const summary = { files: results.length, ok, failed: results.length - ok - skipped, skipped, dry_run: a.dry_run || undefined, save: a.dry_run ? undefined : save };
  const shown = a.results === 'errors' ? results.filter((r) => !r.ok) : results;
  return { content: [{ type: 'text' as const, text: clip(J({ ...summary, results: shown })) }], isError: ok + skipped < results.length && ok === 0 };
}
