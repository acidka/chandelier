import { z } from 'zod';
import type { ToolDef } from './types.js';
import { ArgError } from './types.js';
import { fitToD, shadeToD } from '../fitcurve.js';
import { styleShape, placeShape, STYLE_HELP, itemsSchema } from './common.js';

const xy = z.array(z.number()).length(2);
const point = z.union([xy, z.object({ a: xy, in: xy.optional(), out: xy.optional() })]);
const pathProps = {
  points: z.array(point).optional().describe('[x,y] corners, or {a:[x,y], in:[x,y], out:[x,y]} with Bézier handles (same format get_items returns)'),
  closed: z.boolean().optional(),
  paths: z.array(z.array(point)).optional().describe('several point lists → one compound path (holes)'),
  fit: z.array(z.any()).optional().describe('measured points [[x,y],…] (or several lists, joined by lines) → smooth curve: anchors at peaks/extremes with level handles, few anchors'),
  tolerance: z.number().positive().optional().describe('fit: max miss (default 1)'),
  shade: z.object({ to: z.union([z.number(), z.array(z.array(z.number()))]), steps: z.number().int().min(2).max(60).optional() }).optional()
    .describe('with fit: fade from the fitted edge (opacity there, default 30; fill, blend multiply) to nothing at to: a distance (+ = down/right) or the next edge\'s points; makes stacked paths, no clip'),
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
  step: (a) => ({ cmd: 'create_path', args: withFit(a) }),
};

/** fit → d (Node side; the runtime only sees SVG path data), for the call and each of its items; fit + shade → one
 * item per shading step */
function withFit(a: Record<string, any>): Record<string, any> {
  const ok = (l: unknown) => Array.isArray(l) && l.length >= 2 && l.every((q) => Array.isArray(q) && q.length >= 2 && q.every((v) => typeof v === 'number' && isFinite(v)));
  const one = (o: Record<string, any>, shared: Record<string, any> = {}): Record<string, any>[] => {
    if (o.fit === undefined) { if (o.shade) throw new ArgError('shade needs fit (the edge points).'); return [o]; }
    if (o.points || o.paths || o.d) throw new ArgError('fit replaces points, paths and d: give one.');
    const parts = Array.isArray(o.fit[0]?.[0]) ? o.fit : [o.fit];
    if (!parts.length || !parts.every(ok)) throw new ArgError('fit: [[x,y], …] (≥ 2 points) or a list of such lists.');
    const { fit, tolerance, shade, ...rest } = o, tol = tolerance ?? shared.tolerance;
    try {
      if (!shade) return [{ ...rest, d: fitToD(parts, o.closed ?? shared.closed ?? false, { tolerance: tol }).d }];
      if (parts.length > 1) throw new Error('shade takes one edge: fit [[x,y], …].');
      if (typeof shade.to !== 'number' && !ok(shade.to)) throw new Error('shade.to: a distance or [[x,y], …] (≥ 2 points).');
      const sh = shadeToD(parts[0], { ...shade, opacity: o.opacity ?? shared.opacity, tolerance: tol });
      return sh.ds.map((d) => ({ ...rest, d, opacity: sh.opacity, stroke: rest.stroke ?? shared.stroke ?? 'none', blend: rest.blend ?? shared.blend ?? 'multiply' }));
    } catch (e) { throw new ArgError((e as Error).message); }
  };
  if (Array.isArray(a.items)) {
    const { tolerance: _t, ...top } = a;
    return { ...top, items: a.items.flatMap((it: Record<string, any>) => one(it, a)) };
  }
  const made = one(a);
  if (made.length === 1) return made[0];
  return { ...Object.fromEntries(Object.entries(a).filter(([k]) => !['fit', 'shade', 'tolerance'].includes(k))), items: made };
}
