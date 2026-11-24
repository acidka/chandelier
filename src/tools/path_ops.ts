import { z } from 'zod';
import type { ToolDef } from './types.js';
import { refSchema } from './common.js';

export const path_ops: ToolDef = {
  name: 'path_ops',
  description: `Path operations (results replace the inputs and become the selection). op:
Pathfinder on 2+ items (or one group): "unite" | "minus_front" | "minus_back" | "intersect" | "exclude" | "divide" | "trim" | "merge" | "crop" (a result with several pieces comes back as a group).
"outline_stroke" (strokes → filled paths) · "offset" (distance in session units, negative = inwards; joins miter|round|bevel; miter_limit; keep_original) ·
"expand" (bake appearance/effects) · "outline_text" (text → paths; the name is kept, the uuid changes) · "trace" (images → vector paths; preset e.g. "[Black and White Logo]") · "trap" (spread: an overprinting stroke of each item's own fill colour; distance = trap width, default 0.25 pt).
name: names the result when there is one. Returns {count, items}.`,
  shape: {
    op: z.enum(['unite', 'minus_front', 'minus_back', 'intersect', 'exclude', 'divide', 'trim', 'merge', 'crop', 'outline_stroke', 'offset', 'expand', 'outline_text', 'trace', 'trap']),
    preset: z.string().optional(),
    refs: refSchema,
    distance: z.number().optional(),
    joins: z.enum(['miter', 'round', 'bevel']).optional(),
    miter_limit: z.number().min(1).optional(),
    keep_original: z.boolean().optional(),
    name: z.string().optional(),
  },
  step: (a) => ({ cmd: 'path_ops', args: a }),
};
