import { z } from 'zod';
import type { ToolDef } from './types.js';
import { styleShape, placeShape, STYLE_HELP, itemsSchema } from './common.js';

const xy = z.array(z.number()).length(2);
const point = z.union([xy, z.object({ a: xy, in: xy.optional(), out: xy.optional() })]);
const pathProps = {
  points: z.array(point).optional().describe('[x,y] corners, or {a:[x,y], in:[x,y], out:[x,y]} with Bézier handles (same format get_items returns)'),
  closed: z.boolean().optional(),
  paths: z.array(z.array(point)).optional().describe('several point lists → one compound path (holes)'),
  d: z.string().optional().describe('SVG path data: M L H V C S Q T A Z, absolute/relative; several subpaths → compound path'),
  x: z.number().optional(), y: z.number().optional(),
  scale: z.number().positive().optional().describe('multiplies point / d coordinates (then offset by x, y)'),
  fill_rule: z.enum(['nonzero', 'evenodd']).optional(),
  ...styleShape,
};

export const create_path: ToolDef = {
  name: 'create_path',
  description: `Create a path from points, several point lists (compound path), or SVG path data "d" (SVG y-down units = session units; scale and x, y offset them — so an SVG icon can be dropped in at any size).
Default paint when neither fill nor stroke is given: closed → black fill, open → 1 pt black stroke.
${STYLE_HELP}
Placement: layer or parent. Many at once: items:[{…}]. Returns {count, items:[{uuid, name, type, box}]}.`,
  shape: { ...pathProps, ...placeShape, items: itemsSchema(2000) },
  step: (a) => ({ cmd: 'create_path', args: a }),
};
