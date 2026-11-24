import { z } from 'zod';
import { existsSync } from 'node:fs';
import { resolve, dirname, isAbsolute, extname } from 'node:path';
import type { ToolDef, Ctx } from './types.js';
import { text, fail, J } from './types.js';
import { refSchema } from './common.js';
import { errorText } from './respond.js';
import { export_tool } from './export.js';
import { readRows, normRows, fillPattern, patternFields, fileSafe, type Row } from '../data.js';
import { scriptPath } from '../platform.js';

// values that name a file (images to relink): resolved against the data file's folder
const FILE_VALUE = /\.(png|jpe?g|tiff?|psd|gif|bmp|webp|pdf|ai|eps|svg)$/i;

export const data_merge: ToolDef = {
  name: 'data_merge',
  description: `Variable data (certificates, badges, labels, cards): fill a template once per data row.
Template: the items on artboard (default 0) or refs. "{{field}}" inside any text is replaced, keeping its style. An item NAMED "{{field}}" takes the whole value: text → contents, linked image → relinked (file path, fit in its box), symbol → symbol name, shape → fill colour; NAMED "{{?field}}" → shown only if the value is non-empty (not 0/false/no).
Data: data (.csv/.tsv/.json file; relative image paths resolve from its folder) or rows [{field: value}]; offset, limit.
mode: "artboards" (default: one new artboard per row; columns, spacing) · "grid" (n-up: grid {cols, rows, dx, dy} copies per new artboard, the first where the template sits) · "files" (one export per row: export {format, path with {field}/{n} tokens, …export args}; the document is left unchanged).
name: artboard name pattern (default "{n}"). remove_template:true deletes the template and its artboard at the end. dry_run:true → template fields vs data columns; nothing changes.`,
  shape: {
    data: z.string().optional(),
    rows: z.array(z.record(z.string(), z.any())).max(10000).optional(),
    offset: z.number().min(0).optional(), limit: z.number().min(1).optional(),
    artboard: z.number().min(0).optional(), refs: refSchema.optional(),
    mode: z.enum(['artboards', 'grid', 'files']).optional(),
    grid: z.object({ cols: z.number().min(1), rows: z.number().min(1), dx: z.number(), dy: z.number() }).optional(),
    columns: z.number().min(1).optional(), spacing: z.number().min(0).optional(),
    name: z.string().optional(),
    export: z.record(z.string(), z.any()).optional(),
    remove_template: z.boolean().optional(),
    dry_run: z.boolean().optional(),
  },
  async run(a, ctx) {
    const { rt } = ctx;
    let all: Row[], base = process.cwd();
    try {
      if (a.data) {
        const p = resolve(a.data);
        if (!existsSync(p)) return fail('data file not found: ' + p);
        all = readRows(p); base = dirname(p);
      } else if (a.rows) all = normRows(a.rows);
      else return fail('give data (a .csv, .tsv or .json file) or rows [{field: value}]');
    } catch (e) { return fail('data: ' + (e as Error).message); }
    const off = a.offset ?? 0;
    const rows = all.slice(off, off + (a.limit ?? all.length)).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => {
      if (FILE_VALUE.test(v.trim()) && !/^[a-z]+:\/\//i.test(v.trim())) { const p = isAbsolute(v.trim()) ? v.trim() : resolve(base, v.trim()); return [k, scriptPath(p)]; }
      return [k, v];
    })));
    if (!rows.length) return fail(`no rows to merge (${all.length} in the data, offset ${off})`);
    const mode = a.mode ?? 'artboards';
    if (mode === 'grid' && !a.grid) return fail('mode "grid" needs grid {cols, rows, dx, dy} (dx, dy: step between copies, session units)');
    const tpl = { artboard: a.artboard ?? ctx.settings.artboard ?? 0, refs: a.refs };
    const scan = await rt.cmd<{ artboard: number; items: number; template: string[]; fields: { field: string; as: string[] }[] }>('merge', { action: 'scan', ...tpl });
    if (!scan.ok) return fail(errorText(scan));
    const columns = [...new Set(all.flatMap((r) => Object.keys(r)))];
    const used = scan.data!.fields.map((f) => f.field);
    const missing = used.filter((f) => !columns.includes(f));
    const report = { rows: all.length, selected: rows.length, columns, template: { artboard: scan.data!.artboard, items: scan.data!.items, fields: scan.data!.fields }, missing_in_data: missing, unused_columns: columns.filter((c) => !used.includes(c)) };
    if (a.dry_run) return text({ ...report, sample: rows[0] });
    if (!used.length) return fail(J({ error: 'The template has no {{field}} placeholders and no items named {{field}}: nothing to fill.', ...report }));
    const warnings: string[] = missing.length ? [`Not in the data (left as is): ${missing.join(', ')}`] : [];
    const problems: unknown[] = [];
    const at = { artboard: scan.data!.artboard, template: scan.data!.template };

    if (mode === 'files') return files(a, ctx, rows, off, at, warnings, problems);

    const g = mode === 'grid' ? a.grid : undefined, per = g ? g.cols * g.rows : 1;
    const pagesTotal = Math.ceil(rows.length / per);
    const cols = a.columns ?? Math.max(1, Math.ceil(Math.sqrt(pagesTotal)));
    const namePat = a.name ?? '{n}';
    const chunk = per * Math.max(1, Math.floor(40 / per));
    const pages: { i: number; name: string }[] = [];
    let origin: number[] | undefined;
    for (let s = 0; s < rows.length; s += chunk) {
      const part = rows.slice(s, s + chunk);
      const env = await rt.cmd<any>('merge', {
        action: 'fill', ...at, rows: part, start: s, grid: g, columns: cols, spacing: a.spacing, origin,
        names: part.map((r, k) => ((s + k) % per === 0 ? fillPattern(namePat, r, off + s + k + 1) : null)),
      });
      if (!env.ok) return fail(J({ error: errorText(env), done_rows: s, artboards: pages.length ? [pages[0].i, pages[pages.length - 1].i] : [] }));
      origin = env.data.origin;
      pages.push(...env.data.pages);
      problems.push(...env.data.problems);
      for (const f of env.data.missing_fields as string[]) if (!missing.includes(f)) { missing.push(f); warnings.push(`Not in some rows: ${f}`); }
      if (env.warnings) warnings.push(...env.warnings);
    }
    const out: Record<string, unknown> = { rows: rows.length, artboards: pages.length, first: pages[0], last: pages[pages.length - 1] };
    if (a.remove_template) {
      const d = await rt.cmd<any>('merge', { action: 'done', ...at });
      if (!d.ok) warnings.push('remove_template: ' + d.error);
      else { out.removed_template_artboard = d.data.removed_artboard; for (const p of [out.first, out.last] as { i: number }[]) if (p.i > d.data.removed_artboard) p.i--; }
    }
    if (problems.length) out.problems = problems.slice(0, 50);
    if (warnings.length) out.warnings = warnings;
    return text(out);
  },
};

async function files(a: any, ctx: Ctx, rows: Row[], off: number, at: { artboard: number; template: string[] }, warnings: string[], problems: unknown[]) {
  const ex = a.export as Record<string, any> | undefined;
  if (!ex?.format || !ex.path) return fail('mode "files" needs export {format, path} — path may use {field} and {n} tokens, e.g. "out/{Name}.pdf"');
  let pat = String(ex.path);
  if (!patternFields(pat).length) { const e = extname(pat); pat = e ? pat.slice(0, -e.length) + '-{n}' + e : pat + '/{n}'; }
  const done: string[] = [];
  for (let k = 0; k < rows.length; k++) {
    const path = resolve(fillPattern(pat, rows[k], off + k + 1, fileSafe));
    const filled = await ctx.rt.cmd<any>('merge', { action: 'fill_in_place', ...at, rows: [rows[k]], start: off + k });
    try {
      if (!filled.ok) return fail(J({ error: `row ${off + k + 1}: ${errorText(filled)}`, files: done }));
      problems.push(...filled.data.problems);
      const r = z.object(export_tool.shape).strict().safeParse({ ...ex, path, artboards: [at.artboard] });
      if (!r.success) return fail(J({ error: 'export: ' + r.error.issues.map((x) => `${x.path.join('.') || 'args'}: ${x.message}`).join('; '), files: done }));
      const res = await export_tool.run!(r.data, ctx);
      const t = (res.content[0] as { text: string }).text;
      if (res.isError) return fail(J({ error: `row ${off + k + 1} export: ${t}`, files: done }));
      done.push(...(JSON.parse(t).files as { path: string }[]).map((f) => f.path));
    } finally {
      await ctx.rt.cmd('merge', { action: 'clear' });
    }
  }
  const out: Record<string, unknown> = { rows: rows.length, files: done.length > 20 ? [...done.slice(0, 10), `… ${done.length - 20} more …`, ...done.slice(-10)] : done };
  if (problems.length) out.problems = problems.slice(0, 50);
  if (warnings.length) out.warnings = warnings;
  return text(out);
}
