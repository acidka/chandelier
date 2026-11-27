import { z } from 'zod';
import type { ToolDef, Ctx } from './types.js';
import { text, fail, J, ArgError } from './types.js';
import { respond, runStep } from './respond.js';
import { gate } from '../plan/plan.js';

// Tool profiles (0.3). Every agent request re-reads the tool list; clients that load every schema (no deferred tool
// loading) pay for all of it. CHANDELIER_TOOLS=lean exposes the tools a usual build calls plus this "tools" tool:
// the other tools stay reachable (catalog, search, schema, call) and as batch steps.
export const LEAN = ['status', 'documents', 'batch', 'run_script', 'preview', 'export', 'find_items', 'get_items'];

/** "full" (default) → null (all tools); "lean" → LEAN; "a,b,c" → those names. Unknown names are ignored. */
export function profile(env: string | undefined, all: string[]): string[] | null {
  const v = (env ?? '').trim().toLowerCase();
  if (!v || v === 'full' || v === 'all') return null;
  const names = v === 'lean' ? LEAN : v.split(/[\s,]+/).filter(Boolean);
  return names.filter((n) => all.includes(n));
}

const about = (t: ToolDef) => t.description.split(/(?<=[.:])\s|\n/)[0].slice(0, 140);
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9_]+/).filter((w) => w.length > 1);

export function schemaOf(t: ToolDef): unknown {
  const s = z.toJSONSchema(z.object(t.shape), { unrepresentable: 'any' }) as Record<string, unknown>;
  delete s.$schema;
  return s;
}

export function toolsTool(hidden: string[]): ToolDef {
  return {
    name: 'tools',
    description: `More Illustrator tools than are listed (kept out to save tokens): ${hidden.join(', ')}.
{} → one line each · query: "recolor swatches" → best matches · name → full description and input schema · call + args → run it (or use it as a batch step).`,
    shape: { query: z.string().optional(), name: z.string().optional(), call: z.string().optional(), args: z.record(z.string(), z.any()).optional() },
    async run(a, ctx: Ctx) {
      const all = [...ctx.tools.values()].filter((t) => t.name !== 'tools');
      if (a.call) {
        const t = ctx.tools.get(a.call);
        if (!t || t.name === 'tools') return fail(`unknown tool "${a.call}"; tools {} lists them`);
        const r = z.object(t.shape).strict().safeParse(a.args ?? {});
        if (!r.success) return fail(`${t.name}: ` + r.error.issues.map((x) => `${x.path.join('.') || 'args'}: ${x.message}`).join('; ') + ` (tools {name: "${t.name}"} shows the schema)`);
        const blocked = gate(t, r.data, ctx);
        if (blocked) return fail(blocked);
        try {
          if (t.run) return await t.run(r.data, ctx);
          return respond(await runStep(t, r.data, ctx));
        } catch (e) { return fail(e instanceof ArgError ? e.message : String((e as Error)?.message ?? e)); }
      }
      if (a.name) {
        const t = ctx.tools.get(a.name);
        if (!t || t.name === 'tools') return fail(`unknown tool "${a.name}"`);
        return text(J({ name: t.name, description: t.description, input_schema: schemaOf(t), batch_step: !!t.step && t.name !== 'batch' }));
      }
      if (a.query) {
        const q = words(a.query);
        const scored = all.map((t) => {
          const name = words(t.name.replace(/_/g, ' ')), desc = words(t.description);
          return { t, s: q.reduce((n, w) => n + (name.includes(w) ? 5 : 0) + desc.filter((d) => d.startsWith(w)).length, 0) };
        }).filter((x) => x.s > 0).sort((x, y) => y.s - x.s).slice(0, 6);
        return text(J(scored.map(({ t }) => ({ name: t.name, about: about(t) }))));
      }
      return text(J(all.map((t) => ({ name: t.name, about: about(t) }))));
    },
  };
}
