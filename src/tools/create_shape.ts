import { z } from 'zod';
import type { ToolDef } from './types.js';
import { styleShape, placeShape, STYLE_HELP, itemsSchema } from './common.js';

const shapeProps = {
  shape: z.enum(['rect', 'rounded_rect', 'ellipse', 'polygon', 'star', 'line']).optional().describe('default rect'),
  x: z.number().optional(), y: z.number().optional(), w: z.number().optional(), h: z.number().optional(),
  r: z.number().min(0).optional().describe('corner radius of rounded_rect (session units, default 4)'),
  sides: z.number().min(3).max(100).optional().describe('polygon, default 6'),
  points: z.number().min(3).max(100).optional().describe('star, default 5'),
  inner: z.number().min(0.01).max(1).optional().describe('star inner radius as a fraction of the outer, default 0.5'),
  x1: z.number().optional(), y1: z.number().optional(), x2: z.number().optional(), y2: z.number().optional(),
  ...styleShape,
};

export const create_shape: ToolDef = {
  name: 'create_shape',
  description: `Create shapes. rect / rounded_rect (r) / ellipse / polygon (sides) / star (points, inner) take a box x, y, w, h (top-left; polygon and star are inscribed in it); line takes x1, y1, x2, y2.
Default paint: no fill + 1 pt black stroke when neither fill nor stroke is given (lines: black stroke).
${STYLE_HELP}
Placement: layer (name, created if missing) or parent (group ref / "layer:Name"); default the active layer.
Many at once: items:[{…}, …] — each item's props override the shared ones given at the top level (e.g. shared fill, per-item x/y).
Returns {count, items:[{uuid, name, type, box}]}.`,
  shape: { ...shapeProps, ...placeShape, items: itemsSchema(5000) },
  step: (a) => ({ cmd: 'create_shape', args: a }),
};
