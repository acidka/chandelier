import { z } from 'zod';
import type { ToolDef } from './types.js';

const stop = z.object({ color: z.string(), at: z.number().min(0).max(100).optional(), opacity: z.number().min(0).max(100).optional(), midpoint: z.number().min(13).max(87).optional() });

export const swatches: ToolDef = {
  name: 'swatches',
  description: `Swatches of the active document. kind: "global" (global process — edit once, every use updates; default for add) | "spot" | "process" (plain) | "gradient".
action: "list" (kind, group filters) · "add" (name, color; updates the swatch if it exists, so batches can be re-run; gradient: type linear|radial, stops [{color, at 0-100, opacity, midpoint}]; group) · "update" (name → color / stops / new_name / group) · "remove" (name or names) ·
"clean_defaults" (remove the default process swatches, unused default gradients/patterns and empty groups; keeps [None], [Registration], global and spot swatches and "keep" names).
Use them as colours: "swatch:Name", "swatch:Name@50" (tint), "gradient:Name@45" (angle).`,
  shape: {
    action: z.enum(['list', 'add', 'update', 'remove', 'clean_defaults']).optional(),
    name: z.string().optional(), names: z.array(z.string()).optional(), new_name: z.string().optional(),
    kind: z.enum(['global', 'spot', 'process', 'gradient', 'pattern', 'none', 'registration']).optional(),
    color: z.string().optional(),
    type: z.enum(['linear', 'radial']).optional(),
    stops: z.array(stop).optional(),
    group: z.string().optional(),
    keep: z.array(z.string()).optional(),
    limit: z.number().min(1).optional(),
  },
  step: (a) => ({ cmd: 'swatches', args: a }),
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
