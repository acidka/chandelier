import { z } from 'zod';
import type { ToolDef } from './types.js';
import { one, refSchema } from './common.js';

export const arrange_items: ToolDef = {
  name: 'arrange_items',
  description: `Structure and stacking. action:
"group" (refs → one group at the frontmost item's place, order kept; name) · "ungroup" (groups → their items; clipping released unless release_clip:false) ·
"clip" (refs → clipping group; mask = the frontmost item or mask ref; must be a path/compound) · "compound" (paths → compound path) · "release_compound" ·
"front" | "forward" | "backward" | "back" (z-order, relative order kept) ·
"move_into" (target: "layer:Name" (created if missing) or a group; position "front" (default) | "back") · "move_above" | "move_below" (target item).
Returns the resulting items.`,
  shape: {
    action: z.enum(['group', 'ungroup', 'clip', 'compound', 'release_compound', 'front', 'forward', 'backward', 'back', 'move_into', 'move_above', 'move_below']),
    refs: refSchema,
    name: z.string().optional(),
    mask: one.optional(),
    release_clip: z.boolean().optional(),
    target: one.optional(),
    position: z.enum(['front', 'back']).optional(),
  },
  step: (a) => ({ cmd: 'arrange_items', args: a }),
};

export const align_items: ToolDef = {
  name: 'align_items',
  description: `Align and/or distribute items. horizontal: "left" | "center" | "right"; vertical: "top" | "middle" | "bottom".
to: "selection" (default: the bounds of all given items) | "artboard" (artboard index, default the reference one) | "key" (key ref stays put).
distribute: "horizontal" | "vertical" — equal gaps between items (within their extent, or across the artboard with to:"artboard"), or a fixed spacing (session units).
bounds: "geometric" (default) | "visible" (incl. stroke).`,
  shape: {
    refs: refSchema,
    horizontal: z.enum(['left', 'center', 'right']).optional(),
    vertical: z.enum(['top', 'middle', 'bottom']).optional(),
    to: z.enum(['selection', 'artboard', 'key']).optional(),
    artboard: z.number().min(0).optional(),
    key: one.optional(),
    distribute: z.enum(['horizontal', 'vertical']).optional(),
    spacing: z.number().optional(),
    bounds: z.enum(['geometric', 'visible']).optional(),
  },
  step: (a) => ({ cmd: 'align_items', args: a }),
};
