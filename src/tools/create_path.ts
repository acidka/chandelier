import { z } from 'zod';
import type { ToolDef } from './types.js';
import { ArgError } from './types.js';
import { fitToD, shadeToD, projective } from '../fitcurve.js';
import { styleShape, placeShape, STYLE_HELP, itemsSchema } from './common.js';

const xy = z.array(z.number()).length(2);
const point = z.union([xy, z.object({ a: xy, in: xy.optional(), out: xy.optional() })]);
const pathProps = {
  points: z.array(point).optional().describe('[x,y] corners, or {a:[x,y], in:[x,y], out:[x,y]} with Bézier handles (same format get_items returns)'),
  closed: z.boolean().optional(),
  paths: z.array(z.array(point)).optional().describe('several point lists → one compound path (holes)'),
  fit: z.array(z.any()).optional().describe('measured points [[x,y],…] or several lists (joined by lines) → smooth curve, anchors at extremes'),
  tolerance: z.number().positive().optional().describe('fit: max miss (default 1)'),
  extend: z.union([z.number(), z.array(z.number()).length(2)]).optional().describe('fit: run on past the ends ([start, end])'),
  map: z.object({ from: z.array(xy).length(4), to: z.array(xy).length(4) }).optional().describe('fit: 4-point map applied first'),
  shade: z.object({ to: z.union([z.number(), z.array(z.array(z.number()))]), steps: z.number().int().min(2).max(60).optional(), taper: z.number().min(0).optional() }).optional()
    .describe('fit = edge: multiply fade (opacity, fill) to none at to (distance or next edge points); taper ends'),
  clip_to: z.union([z.string(), z.number()]).optional().describe('path ref: the new paths go in a clip group masked by a copy'),
  d: z.string().optional().describe('SVG path data: M L H V C S Q T A Z, absolute/relative; several subpaths → compound path'),
  x: z.number().optional(), y: z.number().optional(),
  scale: z.union([z.number().positive(), z.array(z.number().positive()).length(2)]).optional().describe('multiplies coordinates ([sx, sy]); then x, y offset'),
  fill_rule: z.enum(['nonzero', 'evenodd']).optional(),
  ...styleShape,
};

export const create_path: ToolDef = {
  name: 'create_path',
  description: `Create a path from points, several point lists (compound path), SVG path data "d" (y down, session units; scale and x, y place it) or measured points (fit).
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
  const FIT = ['fit', 'tolerance', 'extend', 'map', 'shade'];
  const one = (o: Record<string, any>, shared: Record<string, any> = {}): Record<string, any>[] => {
    const g = (k: string) => o[k] ?? shared[k];
    if (o.fit === undefined) {
      for (const k of ['shade', 'extend', 'map']) if (o[k] !== undefined) throw new ArgError(`${k} needs fit (the measured points).`);
      return [o];
    }
    if (o.points || o.paths || o.d) throw new ArgError('fit replaces points, paths and d: give one.');
    let parts = Array.isArray(o.fit[0]?.[0]) ? o.fit : [o.fit];
    if (!parts.length || !parts.every(ok)) throw new ArgError('fit: [[x,y], …] (≥ 2 points) or a list of such lists.');
    const rest = Object.fromEntries(Object.entries(o).filter(([k]) => !FIT.includes(k)));
    const shade = o.shade;
    try {
      const m = g('map') ? projective(g('map').from, g('map').to) : null;
      if (m) parts = parts.map((l: number[][]) => l.map(m));
      const fo = { tolerance: g('tolerance'), extend: g('extend') };
      if (!shade) return [{ ...rest, d: fitToD(parts, o.closed ?? shared.closed ?? false, fo).d }];
      if (typeof shade.to !== 'number' && !ok(shade.to)) throw new Error('shade.to: a distance or [[x,y], …] (≥ 2 points).');
      const to = typeof shade.to === 'number' || !m ? shade.to : shade.to.map(m);
      const tol = fo.tolerance ?? 1, lift = a.clip_to !== undefined ? Math.max(1.5, 1.5 * tol) : 0;
      const sh = shadeToD(parts, { ...fo, ...shade, to, lift, opacity: g('opacity') });
      return sh.ds.map((d) => ({ ...rest, d, opacity: sh.opacity, stroke: rest.stroke ?? shared.stroke ?? 'none', blend: rest.blend ?? shared.blend ?? 'multiply' }));
    } catch (e) { throw new ArgError((e as Error).message); }
  };
  const top = Object.fromEntries(Object.entries(a).filter(([k]) => !FIT.includes(k) && k !== 'items'));
  if (Array.isArray(a.items)) return { ...top, items: a.items.flatMap((it: Record<string, any>) => one(it, a)) };
  const made = one(a);
  return made.length === 1 && made[0] === a ? a : made.length === 1 ? { ...top, ...made[0] } : { ...top, items: made };
}
