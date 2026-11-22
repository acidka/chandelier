import { z } from 'zod';
import type { ToolDef } from './types.js';
import { refSchema, placeShape } from './common.js';

const ORIGINS = ['top_left', 'top', 'top_right', 'left', 'center', 'right', 'bottom_left', 'bottom', 'bottom_right'] as const;

export const transform_items: ToolDef = {
  name: 'transform_items',
  description: `Move / scale / rotate / reflect items (in that order: scale, reflect, rotate, move).
dx, dy (session units) · scale (% uniform) or sx, sy (%) · rotate (degrees, positive = clockwise on screen) · reflect "horizontal" | "vertical".
origin: anchor of each item's bounds (default center), or a point [x, y]. as_group:true uses the bounds of all items together (e.g. rotate a selection as one).
copies: n → step-and-repeat: makes n copies, each one transformed from the previous (e.g. dx:30, copies:5 → a row; rotate:30, copies:11, origin:[cx,cy] → a ring). Returns the copies; without copies returns the items.
scale_strokes: scale stroke widths too.`,
  shape: {
    refs: refSchema,
    dx: z.number().optional(), dy: z.number().optional(),
    scale: z.number().optional(), sx: z.number().optional(), sy: z.number().optional(),
    rotate: z.number().optional(),
    reflect: z.enum(['horizontal', 'vertical']).optional(),
    origin: z.union([z.enum(ORIGINS), z.array(z.number()).length(2)]).optional(),
    as_group: z.boolean().optional(),
    copies: z.number().min(1).max(1000).optional(),
    scale_strokes: z.boolean().optional(),
  },
  // ExtendScript objects have a built-in .reflect property: send the option as "flip" (quirk C13)
  step: ({ reflect, ...a }) => ({ cmd: 'transform_items', args: { ...a, flip: reflect } }),
};

export const duplicate_items: ToolDef = {
  name: 'duplicate_items',
  description: `Copy items. One of:
- to_artboards: [indices] | "all" → one copy per artboard at the SAME position relative to the artboard (source artboard = where the item is, or from_artboard); name_suffix e.g. "-{artboard}".
- rows, cols (grid; step = the items' size + gap_x/gap_y, or step_x/step_y) — the original is cell [0,0].
- count (default 1) copies offset by dx, dy each.
Copies go into the same container, or layer / parent. Returns the copies.`,
  shape: {
    refs: refSchema,
    to_artboards: z.union([z.array(z.number().min(0)), z.literal('all')]).optional(),
    from_artboard: z.number().min(0).optional(),
    name_suffix: z.string().optional(),
    rows: z.number().min(1).max(500).optional(), cols: z.number().min(1).max(500).optional(),
    gap_x: z.number().optional(), gap_y: z.number().optional(), step_x: z.number().optional(), step_y: z.number().optional(),
    count: z.number().min(1).max(1000).optional(), dx: z.number().optional(), dy: z.number().optional(),
    ...placeShape,
  },
  step: (a) => ({ cmd: 'duplicate_items', args: a }),
};
