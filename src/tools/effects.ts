import { z } from 'zod';
import type { ToolDef } from './types.js';
import { refSchema } from './common.js';

// 0.4: live effects (stay editable in Illustrator's Appearance panel). Kept short for the tool-list budget.
const effect = z.object({
  type: z.enum(['drop_shadow', 'outer_glow', 'inner_glow', 'round_corners', 'feather', 'blur', 'offset', 'roughen', 'zigzag', 'pucker_bloat', 'transform']).optional(),
  xml: z.string().optional(),
}).passthrough();

export const effects: ToolDef = {
  name: 'effects',
  description: `Live effects on items (editable later in Illustrator; lengths in session units, opacity 0-100). add: [{type, …}] in order:
drop_shadow {x, y, blur, color, opacity, blend} · outer_glow / inner_glow {blur, color, opacity, blend; inner: from "edge"|"center"} · round_corners {radius} · feather {radius} · blur {radius} · offset {distance, joins} · roughen {size, detail, smooth} · zigzag {size, ridges, smooth} · pucker_bloat {amount: <0 pucker, >0 bloat} · transform {x, y, scale, scale_x, scale_y, rotate, copies} · {xml: raw LiveEffect XML}.
clear:true first removes all effects (paths/groups keep their fill and stroke). Effects can't be read back; path_ops expand bakes them. Returns {count, items (box incl. effects)}.`,
  shape: { refs: refSchema, add: z.array(effect).max(20).optional(), clear: z.boolean().optional() },
  step: (a) => ({ cmd: 'effects', args: a }),
};
