import { z } from 'zod';
import type { ToolDef } from './types.js';
import { ArgError } from './types.js';
import { fitToD, shadeToD, projective, bilinearMap, fitCurve, bez, type Seg } from '../fitcurve.js';

/** The point of a fitted curve where a list's end meets it: where the line through the list's last two points crosses
 * the curve near the end (so a short list still reaches it), else the curve's point nearest to the end. */
export function nearestOn(segs: Seg[], end: number[], prev: number[]): number[] {
  const pts: number[][] = [];
  for (const c of segs) for (let i = 0; i <= 64; i++) pts.push(bez(c, i / 64));
  const d = [end[0] - prev[0], end[1] - prev[1]], L = Math.hypot(d[0], d[1]);
  let best: number[] | null = null, bt = Infinity;
  if (L > 1e-9) {
    const u = [d[0] / L, d[1] / L];
    for (let i = 1; i < pts.length; i++) {
      // segment pts[i-1]–pts[i] against the ray end + t·u (t may be negative: a list that overshoots comes back)
      const a = pts[i - 1], b = pts[i], e = [b[0] - a[0], b[1] - a[1]], den = u[0] * e[1] - u[1] * e[0];
      if (Math.abs(den) < 1e-12) continue;
      const w = [a[0] - end[0], a[1] - end[1]], t = (w[0] * e[1] - w[1] * e[0]) / den, s = (w[0] * u[1] - w[1] * u[0]) / den;
      if (s < -1e-9 || s > 1 + 1e-9) continue;
      if (Math.abs(t) < Math.abs(bt)) { bt = t; best = [end[0] + t * u[0], end[1] + t * u[1]]; }
    }
  }
  let near = pts[0], nd = Infinity;
  for (const q of pts) { const dd = Math.hypot(q[0] - end[0], q[1] - end[1]); if (dd < nd) { nd = dd; near = q; } }
  // the crossing only when it is about as close as the nearest point (a ray can hit the curve far away)
  return best && Math.abs(bt) <= 3 * nd + 1 ? best : near;
}
import { styleShape, placeShape, STYLE_HELP, itemsSchema } from './common.js';

const xy = z.array(z.number()).length(2);
const point = z.union([xy, z.object({ a: xy, in: xy.optional(), out: xy.optional() })]);
const pathProps = {
  points: z.array(point).optional().describe('[x,y] or {a, in, out} (Bézier handles; as get_items returns)'),
  closed: z.boolean().optional(),
  paths: z.array(z.array(point)).optional().describe('several point lists → one compound path (holes)'),
  fit: z.array(z.any()).optional().describe('measured points [[x,y],…] or several lists (joined by lines) → smooth curve, anchors at extremes; {onto: pts} after a list: its end lands on that curve'),
  tolerance: z.number().positive().optional().describe('fit: max miss (default 1)'),
  extend: z.union([z.number(), z.array(z.number()).length(2)]).optional().describe('fit: run on past the ends ([start, end])'),
  anchors: z.array(xy).optional().describe('fit: forced anchors'),
  map: z.object({ from: z.array(xy).length(4), to: z.array(xy).length(4), bilinear: z.boolean().optional() }).optional().describe('fit: 4-point map applied first (bilinear: as scene)'),
  shade: z.object({ to: z.union([z.number(), z.array(z.array(z.number()))]), steps: z.number().int().min(2).max(60).optional(), taper: z.number().min(0).optional() }).optional()
    .describe('fit = edge: multiply fade (opacity, fill) to none at to (distance or edge points); taper'),
  clip_to: z.union([z.string(), z.number()]).optional().describe('path ref: clip the new paths to a copy of it'),
  d: z.string().optional().describe('SVG path data (any command); several subpaths → compound path'),
  x: z.number().optional(), y: z.number().optional(),
  scale: z.union([z.number().positive(), z.array(z.number().positive()).length(2)]).optional().describe('multiplies coordinates ([sx, sy]); then x, y offset'),
  fill_rule: z.enum(['nonzero', 'evenodd']).optional(),
  ...styleShape,
};

export const create_path: ToolDef = {
  name: 'create_path',
  description: `Create a path from points, several point lists (compound path), SVG path data "d" (y down, session units; scale and x, y place it) or measured points (fit).
Default paint: closed → black fill, open → 1 pt black stroke.
${STYLE_HELP}
Placement: layer or parent. Many at once: items:[{…}]. Returns {count, items:[{uuid, name, type, box}]}.`,
  shape: { ...pathProps, ...placeShape, items: itemsSchema(2000) },
  step: (a) => ({ cmd: 'create_path', args: withFit(a) }),
};

/** fit → d (Node side; the runtime only sees SVG path data), for the call and each of its items; fit + shade → one
 * item per shading step */
function withFit(a: Record<string, any>): Record<string, any> {
  const ok = (l: unknown) => Array.isArray(l) && l.length >= 2 && l.every((q) => Array.isArray(q) && q.length >= 2 && q.every((v) => typeof v === 'number' && isFinite(v)));
  const FIT = ['fit', 'tolerance', 'extend', 'map', 'shade', 'anchors'];
  const one = (o: Record<string, any>, shared: Record<string, any> = {}): Record<string, any>[] => {
    const g = (k: string) => o[k] ?? shared[k];
    if (o.fit === undefined) {
      for (const k of ['shade', 'extend', 'map', 'anchors']) if (o[k] !== undefined) throw new ArgError(`${k} needs fit (the measured points).`);
      return [o];
    }
    if (o.points || o.paths || o.d) throw new ArgError('fit replaces points, paths and d: give one.');
    let parts = Array.isArray(o.fit[0]?.[0]) || o.fit.some((x: any) => x && !Array.isArray(x) && x.onto) ? o.fit : [o.fit];
    // {onto: points} after a list: that list's end lands exactly on the curve fitted through those points (before the
    // first list: the first list's start) — a band edge that meets another edge, without a boolean cutter
    const snaps: { list: number; end: boolean; onto: number[][] }[] = [];
    const lists: number[][][] = [];
    for (const x of parts) {
      if (x && !Array.isArray(x) && typeof x === 'object') {
        if (!ok(x.onto)) throw new ArgError('fit: {onto: [[x,y], …]} needs ≥ 2 points of the curve to land on.');
        snaps.push(lists.length ? { list: lists.length - 1, end: true, onto: x.onto } : { list: 0, end: false, onto: x.onto });
      } else lists.push(x);
    }
    parts = lists;
    if (!parts.length || !parts.every(ok)) throw new ArgError('fit: [[x,y], …] (≥ 2 points) or a list of such lists.');
    const rest = Object.fromEntries(Object.entries(o).filter(([k]) => !FIT.includes(k)));
    const shade = o.shade;
    try {
      const mp = g('map'), m = mp ? (mp.bilinear ? bilinearMap : projective)(mp.from, mp.to) : null;
      if (m) parts = parts.map((l: number[][]) => l.map(m));
      for (const sn of snaps) {
        const onto = m ? sn.onto.map(m) : sn.onto, l = parts[sn.list];
        const at = sn.end ? l.length - 1 : 0, p = nearestOn(fitCurve(onto, { tolerance: g('tolerance') }), l[at], l[sn.end ? Math.max(0, at - 1) : Math.min(l.length - 1, 1)]);
        parts[sn.list] = l.map((q: number[], i: number) => (i === at ? p : q));
      }
      const am = g('anchors') as number[][] | undefined;
      const fo = { tolerance: g('tolerance'), extend: g('extend'), anchors: am && m ? am.map(m) : am };
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
