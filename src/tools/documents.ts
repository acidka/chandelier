import { z } from 'zod';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import type { ToolDef } from './types.js';
import { ArgError, text, fail, J } from './types.js';
import { runStep, errorText, respond } from './respond.js';
import { export_tool } from './export.js';

const FORMATS = ['ai', 'pdf', 'eps', 'svg'] as const;

export const documents: ToolDef = {
  name: 'documents',
  description: `Manage documents. Sizes are in session units (configure) unless "units" is given.
action:
  "list" → open documents
  "new" (width, height, units? (also becomes the session units), color "cmyk"(default)|"rgb", artboards (count, default 1), columns (grid, default min(n,4)), spacing (gap between trim edges, session units, default 20 pt), bleed, artboard_names[], title) → creates and activates it
  "open" (path) → opens or activates a file
  "activate" (name)
  "save"|"save_as" (name? default active; path → save as, format from .ai|.pdf|.eps|.svg or "format"; pdf_preset?; export: [{format, path, artboards: [i]|"all", …export args}] and close:true → save, export, close in one call (not in batch))
  "close" (name? default active; unsaved changes need save:true or discard:true) → also lists the documents still open`,
  shape: {
    action: z.enum(['list', 'new', 'open', 'activate', 'save', 'save_as', 'close']),
    name: z.string().optional(),
    width: z.number().optional(), height: z.number().optional(),
    units: z.enum(['pt', 'mm', 'in', 'px']).optional(),
    color: z.enum(['cmyk', 'rgb']).optional(),
    artboards: z.number().min(1).max(1000).optional(),
    columns: z.number().min(1).optional(),
    spacing: z.number().min(0).optional(),
    bleed: z.number().min(0).optional(),
    artboard_names: z.array(z.string()).optional(),
    artboard_name: z.string().optional().describe('name of the first artboard (same as artboard_names:[name])'),
    title: z.string().optional(),
    path: z.string().optional(),
    format: z.enum(FORMATS).optional(),
    pdf_preset: z.string().optional(),
    save: z.boolean().optional(), discard: z.boolean().optional(),
    export: z.array(z.record(z.string(), z.any())).max(20).optional(),
    close: z.boolean().optional(),
  },
  // save → export → close in one call (the usual end of a build)
  async run(a, ctx) {
    const { export: exports, close, ...rest } = a;
    const finish = !!(exports?.length || close);
    if (finish && rest.action !== 'save' && rest.action !== 'save_as') throw new ArgError('export and close go with action "save"');
    const saved = await runStep(documents, rest, ctx);
    if (!saved.ok) return { content: [{ type: 'text', text: errorText(saved) }], isError: true };
    if (!finish) return respond(saved);
    const out: Record<string, unknown> = { saved: saved.data };
    const files: unknown[] = [];
    for (let i = 0; i < (exports ?? []).length; i++) {
      const r = z.object(export_tool.shape).strict().safeParse(exports[i]);
      if (!r.success) return fail(J({ ...out, error: `export[${i}]: ` + r.error.issues.map((x) => `${x.path.join('.') || 'args'}: ${x.message}`).join('; '),
        keys: Object.keys(export_tool.shape), note: 'saved; not exported or closed: fix the export and call documents save again' }));
      const res = await export_tool.run!(r.data, ctx);
      const t = (res.content[0] as { text: string }).text;
      if (res.isError) return fail(J({ ...out, exported: files, error: `export[${i}]: ${t}`, note: 'saved; the document is still open' }));
      const v = JSON.parse(t);
      files.push(...v.files);
      if (v.warnings) out.warnings = [...((out.warnings as string[]) ?? []), ...v.warnings];
    }
    if (files.length) out.exported = files;
    if (close) {
      const name = (saved.data as { name: string }).name;
      // an .ai save keeps any later change; other formats: close only a clean document
      const c = await runStep(documents, { action: 'close', name, save: /\.ai$/i.test((saved.data as { path?: string }).path ?? '') }, ctx);
      if (!c.ok) return fail(J({ ...out, error: 'close: ' + c.error }));
      out.closed = c.data;
    }
    return text(out);
  },
  step(a, { settings }) {
    if (a.export || a.close) throw new ArgError('export/close after save work only as a direct documents call, not as a batch step');
    const args: Record<string, unknown> = { ...a };
    let activate = false;
    if (a.action === 'new' && a.artboard_name && !a.artboard_names) args.artboard_names = [a.artboard_name];
    if (a.action === 'open') {
      if (!a.path) throw new ArgError('open needs path');
      args.path = resolve(a.path);
      if (!existsSync(args.path as string)) throw new ArgError('File not found: ' + args.path);
    }
    if (a.action === 'save' || a.action === 'save_as') {
      if (a.action === 'save_as' && !a.path) throw new ArgError('save_as needs path');
      if (a.path) {
        const p = resolve(a.path);
        const ext = extname(p).slice(1).toLowerCase();
        const format = a.format ?? ((FORMATS as readonly string[]).includes(ext) ? ext : undefined);
        if (!format) throw new ArgError(`Cannot tell the format from "${p}": use .ai, .pdf, .eps or .svg, or give format.`);
        mkdirSync(dirname(p), { recursive: true });
        args.path = p; args.format = format;
      }
      args.action = 'save';
      activate = settings.activate;
    }
    return { cmd: 'documents', args, settings: a.units ? { units: a.units } : undefined, activate };
  },
  after(v, a, { created, settings }) {
    if (a.action === 'new' && v?.name) created.add(v.name);
    if (a.action === 'new' && a.units) settings.units = a.units;
    if (v?.renamed_from && created.has(v.renamed_from)) created.add(v.name);
  },
};
