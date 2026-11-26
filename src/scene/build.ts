// scene build: the scene → ordinary batch steps (one Apple event = one undo step): clear the layer, global swatches,
// then one path per drawn region, bottom to top (new items go in front, so order is z). Coordinates stay in working
// px; create_path's scale and x, y place them on the target rect.
import { segsToD, type Seg } from '../fitcurve.js';
import { labSpec } from './color.js';
import { live } from './primitives.js';
import type { Scene } from './types.js';

export interface BuildOpts {
  /** [x, y, w, h] in session units on the target artboard */
  rect: number[];
  /** session units the shapes run past the image border (border points move outward) */
  bleed?: number;
  layer?: string;
  artboard?: number;
}

export interface BatchStep { tool: string; args: Record<string, unknown>; artboard?: number }

const MAX_ITEMS = 1500, MAX_BYTES = 1_500_000;

export const swatchName = (s: Scene, ci: number, layer: string) => s.colours[ci].swatch ?? s.colours[ci].name ?? `${layer} c${ci}`;

/** steps in one or more batches (more only when a batch would be too large for one call) */
export function buildSteps(s: Scene, o: BuildOpts): { batches: BatchStep[][]; items: number; swatches: number; anchors: number; bytes: number; regions: number[] } {
  const layer = o.layer ?? 'Scene', { w, h } = s.work, [rx, ry, rw, rh] = o.rect;
  const sx = rw / w, sy = rh / h, bx = (o.bleed ?? 0) / sx, by = (o.bleed ?? 0) / sy;
  const shapes = s.shapes;
  const used = [...new Set(shapes.map((sh) => s.meta[sh.region].colour))].sort((a, b) => a - b);
  const ramps = shapes.filter((sh) => s.ramps[sh.region]);
  const head: BatchStep[] = [
    { tool: 'delete_items', args: { refs: `layer:${layer}` } },
    { tool: 'layers', args: { action: 'add', name: layer } },
    ...used.filter((ci) => !s.colours[ci].swatch).map((ci) => ({ tool: 'swatches', args: { action: 'add', kind: 'global', name: swatchName(s, ci, layer), color: labSpec(s.colours[ci].L, s.colours[ci].a, s.colours[ci].b) } })),
    // a ramp: its own gradient swatch; stops placed where Illustrator's default span (the item's width, centred,
    // turned to the angle) meets our projection range
    ...ramps.map((sh) => {
      const rp = s.ramps[sh.region]!, b = bbox(sh.loops), span = Math.max(1, b[2] - b[0]);
      // projection t is from the ramp's centroid; Illustrator's span is centred on the item's box
      const off = (rp.cx - (b[0] + b[2]) / 2) * rp.ux + (rp.cy - (b[1] + b[3]) / 2) * rp.uy;
      const at = (t: number) => Math.max(0, Math.min(100, Math.round((50 + (100 * (t + off)) / span) * 10) / 10));
      return { tool: 'swatches', args: { action: 'add', kind: 'gradient', name: `${layer} r${sh.region} ramp`, type: 'linear', stops: [{ color: labSpec(rp.c0[0], rp.c0[1], rp.c0[2]), at: at(rp.t0) }, { color: labSpec(rp.c1[0], rp.c1[1], rp.c1[2]), at: at(rp.t1) }] } };
    }),
  ];
  // points on the image border run out into the bleed
  const push = (p: number[]) => [p[0] <= 1e-6 ? -bx : p[0] >= w - 1e-6 ? w + bx : p[0], p[1] <= 1e-6 ? -by : p[1] >= h - 1e-6 ? h + by : p[1]];
  const bleedSegs = (loop: Seg[]): Seg[] => (bx || by ? loop.map((c) => c.map(push) as Seg) : loop);
  const r2 = (v: number) => Math.round(v * 1000) / 1000;
  const items = shapes.map((sh) => {
    const rp = s.ramps[sh.region], angle = rp ? Math.round((Math.atan2(-rp.uy * sy, rp.ux * sx) * 180) / Math.PI * 10) / 10 : 0;
    const common = { fill: rp ? `gradient:${layer} r${sh.region} ramp@${angle}` : `swatch:${swatchName(s, s.meta[sh.region].colour, layer)}`, name: s.meta[sh.region].name ?? `${layer} r${sh.region}`, note: `scene ${s.id} r${sh.region}` };
    const pr = s.prims[sh.region];
    if (pr && live(pr)) {
      // a live shape in session units; a side on the image border runs into the bleed
      let x0 = pr.cx - pr.a, x1 = pr.cx + pr.a, y0 = pr.cy - pr.b, y1 = pr.cy + pr.b;
      if (pr.kind === 'rect') { if (x0 < 0.75) x0 = -bx; if (y0 < 0.75) y0 = -by; if (x1 > w - 0.75) x1 = w + bx; if (y1 > h - 0.75) y1 = h + by; }
      const shape = pr.kind === 'rounded' ? 'rounded_rect' : pr.kind === 'circle' ? 'ellipse' : pr.kind;
      return { tool: 'create_shape', item: { ...(sh.blend ? { blend: sh.blend } : {}), shape, x: r2(rx + x0 * sx), y: r2(ry + y0 * sy), w: r2((x1 - x0) * sx), h: r2((y1 - y0) * sy), ...(pr.kind === 'rounded' ? { r: r2(pr.r! * Math.min(sx, sy)) } : {}), ...common } };
    }
    return { tool: 'create_path', item: { d: segsToD(sh.loops.map(bleedSegs), true), ...(sh.holes ? { fill_rule: 'evenodd' } : {}), ...(sh.blend ? { blend: sh.blend } : {}), ...common } };
  });
  const base: Record<string, Record<string, unknown>> = { create_path: { layer, x: rx, y: ry, scale: [sx, sy], stroke: 'none' }, create_shape: { layer, stroke: 'none' } };
  const batches: BatchStep[][] = [head];
  let cur = batches[0], n = 0, bytes = JSON.stringify(head).length, size = bytes;
  for (const { tool, item: it } of items) {
    const b = JSON.stringify(it).length;
    if (size + b > MAX_BYTES && cur.length > (cur === batches[0] ? head.length : 0)) { cur = []; batches.push(cur); size = 0; n = 0; }
    let step = cur[cur.length - 1];
    // consecutive items of one kind share a step (z order is kept: steps run in order, new items go in front)
    if (!step || step.tool !== tool || (step.args.items as unknown[]).length >= MAX_ITEMS) {
      step = { tool, args: { ...base[tool], items: [] }, ...(o.artboard !== undefined ? { artboard: o.artboard } : {}) };
      cur.push(step);
    }
    (step.args.items as unknown[]).push(it);
    size += b; bytes += b; n++;
  }
  return { batches, items: items.length, swatches: head.length - 2 - ramps.length, anchors: shapes.reduce((a, sh) => a + sh.loops.reduce((x, l) => x + l.length, 0), 0), bytes, regions: shapes.map((sh) => sh.region) };
}

/** bounding box of loops (working px): width (the gradient's default span) and centre */
function bbox(loops: Seg[][]): number[] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of loops) for (const c of l) for (const p of c) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  return [x0, y0, x1, y1];
}
