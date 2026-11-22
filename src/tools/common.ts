// Schemas shared by the create/edit tools.
import { z } from 'zod';

export const one = z.union([z.string(), z.number()]);
export const refSchema = z.union([one, z.array(one)]).describe('uuid, selection, name:Glob*, layer:Name, artboard:N, @n, or a list');
export const rect = z.array(z.number()).length(4).describe('[x, y, w, h] in session coordinates');

export const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color_dodge', 'color_burn', 'hard_light', 'soft_light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'] as const;

/** Appearance and state props accepted by create_* and modify_items. */
export const styleShape = {
  fill: z.string().optional(),
  stroke: z.string().optional(),
  stroke_width: z.number().min(0).optional(),
  dash: z.array(z.number().min(0)).optional(),
  cap: z.enum(['butt', 'round', 'square']).optional(),
  join: z.enum(['miter', 'round', 'bevel']).optional(),
  opacity: z.number().min(0).max(100).optional(),
  blend: z.enum(BLENDS).optional(),
  graphic_style: z.string().optional(),
  name: z.string().optional(),
  note: z.string().optional(),
  hidden: z.boolean().optional(),
  locked: z.boolean().optional(),
};

/** Where new items go. */
export const placeShape = {
  layer: z.string().optional().describe('layer name (created if missing; the active layer does not change), or @active'),
  parent: one.optional().describe('group ref or "layer:Name" to put the item into'),
};

/** "Many at once": each item takes the same props as the top level (validated in Illustrator, with the item's index
 * in any error). Declared loosely on purpose: repeating the full schema here doubled the tool list's size. */
export const itemsSchema = (max: number, extra = '') =>
  z.array(z.record(z.string(), z.any())).max(max).optional().describe(`many at once: objects with the same props as above${extra}; top-level props are shared defaults`);

export const STYLE_HELP = 'Appearance: fill, stroke (colour or "none"), stroke_width (pt), dash (pt; [] = solid), cap, join, opacity, blend, graphic_style (applied first); name, note, hidden, locked.';
