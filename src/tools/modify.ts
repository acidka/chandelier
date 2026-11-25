import { z } from 'zod';
import type { ToolDef } from './types.js';
import { refSchema, styleShape, STYLE_HELP, itemsSchema } from './common.js';

const ANCHORS = ['top_left', 'top', 'top_right', 'left', 'center', 'right', 'bottom_left', 'bottom', 'bottom_right'] as const;
const geoShape = {
  x: z.number().optional(), y: z.number().optional(), w: z.number().positive().optional(), h: z.number().positive().optional(),
  keep_ratio: z.boolean().optional().describe('with only w or only h: scale the other side too'),
  anchor: z.enum(ANCHORS).optional().describe('fixed point when resizing (default top_left)'),
  bounds: z.enum(['geometric', 'visible']).optional().describe('x/y/w/h measure geometric bounds (default, like create_shape) or visible (incl. stroke, like "box")'),
  scale_strokes: z.boolean().optional(),
};

export const modify_items: ToolDef = {
  name: 'modify_items',
  description: `Change many items in one call. refs + props apply the same props to all; items:[{ref, …props}] gives per-item values (top-level props are shared defaults).
Geometry: x, y (top-left), w, h, keep_ratio, anchor, bounds, scale_strokes. ${STYLE_HELP}
On groups, fill/stroke go to every path and text inside. Locked items need locked:false. For text attributes use edit_text; for rotation/scaling by factors use transform_items.
Returns {count, items:[{uuid, name, type, box}]}.`,
  shape: {
    refs: refSchema.optional(),
    ...geoShape, ...styleShape,
    items: itemsSchema(5000, ' plus ref'),
  },
  step: (a) => ({ cmd: 'modify_items', args: a }),
};

export const delete_items: ToolDef = {
  name: 'delete_items',
  description: 'Delete items by refs (a group and its children listed together are deleted once). Locked items are skipped unless force:true (items on locked layers are always skipped). A layer:/name:/uuid ref that finds nothing deletes nothing (not_found). Returns {deleted, skipped_locked?, not_found?}.',
  shape: { refs: refSchema, force: z.boolean().optional() },
  step: (a) => ({ cmd: 'delete_items', args: a }),
};
