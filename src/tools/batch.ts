import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ToolDef, Step } from './types.js';
import { fail, J, ArgError } from './types.js';
import { clip, errorText } from './respond.js';
import { scriptPaths } from '../platform.js';

interface StepResult { ok: boolean; data?: unknown; error?: string; line?: number; where?: string }
interface BatchData { completed: number; total: number; failed_step?: number; rolled_back?: number; results: StepResult[] }

export const batch: ToolDef = {
  name: 'batch',
  description: `Run many tool steps in ONE call (one round trip to Illustrator). steps: [{tool, args, artboard?}] — artboard: this step's coordinates start at that artboard's top-left; any tool except status, configure, preview, export and batch.
Refer to an earlier step's items with "@n" (0-based step index) wherever a ref is accepted, e.g. {tool:"selection", args:{action:"set", refs:"@0"}}.
stop_on_error (default true): stop at the first failing step. rollback (default false): if a step fails, delete the items created during the batch (not raw API creations in run_script) and close an empty new document.
results: "all" (default) | "errors" (failures + counts, for big batches).
steps_file: a JSON file with the steps (array or {steps}) instead of steps.`,
  shape: {
    steps: z.array(z.object({ tool: z.string(), args: z.record(z.string(), z.any()).optional(), artboard: z.number().min(0).optional() })).min(1).max(1000).optional(),
    steps_file: z.string().optional(),
    stop_on_error: z.boolean().optional(),
    rollback: z.boolean().optional(),
    results: z.enum(['all', 'errors']).optional(),
    timeout: z.number().optional().describe('seconds for the whole batch, default from configure'),
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
