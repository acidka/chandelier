// Schemas shared by the create/edit tools.
import { z } from 'zod';

export const one = z.union([z.string(), z.number()]);
// No description: the ref forms are in the server instructions every agent reads (it repeated 15× here: ~1.2 KB).
export const refSchema = z.union([one, z.array(one)]);
export const rect = z.array(z.number()).length(4).describe('[x, y, w, h] in session coordinates');

export const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color_dodge', 'color_burn', 'hard_light', 'soft_light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'] as const;
/** A string with a check instead of an enum: the 16 names cost ~230 bytes in every tool that has blend (0.2.1 budget). */
export const blendSchema = z.string().refine((v) => (BLENDS as readonly string[]).includes(v), { message: 'blend must be one of: ' + BLENDS.join(', ') })
  .describe('multiply, screen… (blend mode)');

/** Appearance and state props accepted by create_* and modify_items. */
export const styleShape = {
  fill: z.string().optional(),
  stroke: z.string().optional(),
  stroke_width: z.number().min(0).optional(),
  dash: z.array(z.number().min(0)).optional(),
  cap: z.enum(['butt', 'round', 'square']).optional(),
  join: z.enum(['miter', 'round', 'bevel']).optional(),
  opacity: z.number().min(0).max(100).optional(),
  blend: blendSchema.optional(),
  graphic_style: z.string().optional(),
  name: z.string().optional(),
  note: z.string().optional(),
  hidden: z.boolean().optional(),
  locked: z.boolean().optional(),
};

/** Where new items go. */
export const placeShape = {
  layer: z.string().optional().describe('name (created if missing; stays inactive) or @active'),
  parent: one.optional().describe('group ref or "layer:Name"'),
};

/** "Many at once": each item takes the same props as the top level (validated in Illustrator, with the item's index
 * in any error). Declared loosely on purpose: repeating the full schema here doubled the tool list's size. */
export const itemsSchema = (max: number, extra = '') =>
  z.array(z.record(z.string(), z.any())).max(max).optional().describe(`many at once: objects with the same props as above${extra}; top-level props are shared defaults`);

export const STYLE_HELP = 'Appearance: fill, stroke (colour or "none"), stroke_width (pt), dash (pt; [] = solid), cap, join, opacity, blend, graphic_style (applied first); name, note, hidden, locked.';
