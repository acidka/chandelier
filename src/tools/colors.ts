import { z } from 'zod';
import { resolve } from 'node:path';
import type { ToolDef } from './types.js';
import { ArgError } from './types.js';
import { refSchema } from './common.js';
import { readAse } from '../ase.js';

const stop = z.object({ color: z.string(), at: z.number().min(0).max(100).optional(), opacity: z.number().min(0).max(100).optional(), midpoint: z.number().min(13).max(87).optional() });

export const swatches: ToolDef = {
  name: 'swatches',
  description: `Swatches of the active document. kind: "global" (default for add: edit once, every use updates) | "spot" | "process" | "gradient".
action: "list" (kind, group) · "add" (name, color — updates an existing one, so batches re-run; gradient: type linear|radial, stops [{color, at 0-100, opacity, midpoint}]; group) · "update" (name → color / stops / new_name / group) · "remove" (name or names) ·
"clean_defaults" (drop default process swatches, unused default gradients/patterns, empty groups; keeps None, Registration, global, spot and "keep") ·
"import" (path: .ase; kind, group override) · "recolor" (refs? default all: fills, strokes, text runs, gradient stops → nearest of to [swatch names, "group:Name"; default global/spot] within tolerance ΔE (20), or map {"cmyk(…)": "swatch:X"}; tints kept; dry_run) → {colors [{from, to, de, uses}], unmatched} · "convert" (mode cmyk|rgb|gray via colour profiles; refs default all; cmyk/rgb also switch the document mode).
Use as colours: "swatch:Name", "swatch:Name@50" (tint), "gradient:Name@45" (angle).`,
  shape: {
    action: z.enum(['list', 'add', 'update', 'remove', 'clean_defaults', 'import', 'recolor', 'convert']).optional(),
    name: z.string().optional(), names: z.array(z.string()).optional(), new_name: z.string().optional(),
    kind: z.enum(['global', 'spot', 'process', 'gradient', 'pattern', 'none', 'registration']).optional(),
    color: z.string().optional(),
    type: z.enum(['linear', 'radial']).optional(),
    stops: z.array(stop).optional(),
    group: z.string().optional(),
    keep: z.array(z.string()).optional(),
    limit: z.number().min(1).optional(),
    path: z.string().optional(),
    refs: refSchema.optional(), to: z.array(z.string()).optional(), map: z.record(z.string(), z.string()).optional(),
    tolerance: z.number().min(0).optional(), dry_run: z.boolean().optional(), mode: z.enum(['cmyk', 'rgb', 'gray']).optional(),
  },
  step(a) {
    if (a.action !== 'import') return { cmd: 'swatches', args: a };
    if (!a.path) throw new ArgError('import needs path (an .ase file)');
    let items;
    try { items = readAse(resolve(a.path)); } catch (e) { throw new ArgError(`import: ${(e as Error).message}`); }
    if (!items.length) throw new ArgError('import: no colours in ' + a.path);
    const { path: _p, ...rest } = a;
    return { cmd: 'swatches', args: { ...rest, items } };
  },
};

export const fonts: ToolDef = {
  name: 'fonts',
  description: 'Installed fonts. query (substring of PostScript name or "Family Style", spaces/dashes ignored) and/or family (exact) → [{name (PostScript), family, style}] (limit default 50); families_only:true lists family names. resolve:"Montserrat SemiBold" shows which font the fuzzy matching used by create_text picks.',
  shape: {
    query: z.string().optional(), family: z.string().optional(),
    families_only: z.boolean().optional(), resolve: z.string().optional(),
    limit: z.number().min(1).max(2000).optional(),
  },
  step: (a) => ({ cmd: 'fonts', args: a }),
};
