// Turning runtime envelopes into MCP results, with a response budget.
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Envelope } from '../runtime.js';
import { J, type ToolDef, type Ctx } from './types.js';

export const BUDGET = 20_000;

export function clip(s: string, budget = BUDGET): string {
  return s.length <= budget ? s : s.slice(0, budget) + `… [truncated ${s.length - budget} chars: ask for less (limit, fields)]`;
}

export function errorText(env: Envelope): string {
  const o: Record<string, unknown> = { error: env.error };
  if (env.line) o.line = env.line;
  if (env.where) o.where = env.where;
  if (env.doc !== undefined) o.doc = env.doc;
  if (env.warnings?.length) o.warnings = env.warnings;
  return J(o);
}

export function respond(env: Envelope): CallToolResult {
  if (!env.ok) return { content: [{ type: 'text', text: errorText(env) }], isError: true };
  const content: CallToolResult['content'] = [{ type: 'text', text: clip(J(env.data ?? null)) }];
  if (env.warnings?.length) content.push({ type: 'text', text: 'warnings: ' + J(env.warnings) });
  return { content };
}

/** A tool's runtime step, run alone (what a tool without run() does). */
export async function runStep(tool: ToolDef, args: any, ctx: Ctx): Promise<Envelope> {
  const s = await tool.step!(args, ctx);
  if (s.activate) await ctx.T.call('activate');
  const env = await ctx.rt.cmd(s.cmd, s.args, { settings: s.settings as any });
  if (env.ok) tool.after?.(env.data, args, ctx);
  return env;
}
