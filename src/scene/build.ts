// scene build: the scene → ordinary batch steps (one Apple event = one undo step): clear the layer, global swatches,
// then one path per drawn region, bottom to top (new items go in front, so order is z). Coordinates stay in working
// px; create_path's scale and x, y place them on the target rect.
import { segsToD, type Seg } from '../fitcurve.js';
import { labSpec } from './color.js';
import { stacked } from './stack.js';
import { skipped } from './analyze.js';
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
  const shapes = stacked(s.pm, s.seg.regions, s.z, s.fits, { tile: s.tile, skip: skipped(s) });
  const used = [...new Set(shapes.map((sh) => s.meta[sh.region].colour))].sort((a, b) => a - b);
  const head: BatchStep[] = [
    { tool: 'delete_items', args: { refs: `layer:${layer}` } },
    { tool: 'layers', args: { action: 'add', name: layer } },
    ...used.filter((ci) => !s.colours[ci].swatch).map((ci) => ({ tool: 'swatches', args: { action: 'add', kind: 'global', name: swatchName(s, ci, layer), color: labSpec(s.colours[ci].L, s.colours[ci].a, s.colours[ci].b) } })),
  ];
  // points on the image border run out into the bleed
  const push = (p: number[]) => [p[0] <= 1e-6 ? -bx : p[0] >= w - 1e-6 ? w + bx : p[0], p[1] <= 1e-6 ? -by : p[1] >= h - 1e-6 ? h + by : p[1]];
  const bleedSegs = (loop: Seg[]): Seg[] => (bx || by ? loop.map((c) => c.map(push) as Seg) : loop);
  const items = shapes.map((sh) => ({
    d: segsToD(sh.loops.map(bleedSegs), true),
    fill: `swatch:${swatchName(s, s.meta[sh.region].colour, layer)}`,
    ...(sh.holes ? { fill_rule: 'evenodd' } : {}),
    name: s.meta[sh.region].name ?? `${layer} r${sh.region}`,
    note: `scene ${s.id} r${sh.region}`,
  }));
  const base = { layer, x: rx, y: ry, scale: [sx, sy], stroke: 'none' };
  const batches: BatchStep[][] = [head];
  let cur = batches[0], n = 0, bytes = JSON.stringify(head).length, size = bytes;
  for (const it of items) {
    const b = JSON.stringify(it).length;
    if (size + b > MAX_BYTES && cur.length > (cur === batches[0] ? head.length : 0)) { cur = []; batches.push(cur); size = 0; n = 0; }
    let step = cur[cur.length - 1];
    if (!step || step.tool !== 'create_path' || (step.args.items as unknown[]).length >= MAX_ITEMS) {
      step = { tool: 'create_path', args: { ...base, items: [] }, ...(o.artboard !== undefined ? { artboard: o.artboard } : {}) };
      cur.push(step);
    }
    (step.args.items as unknown[]).push(it);
    size += b; bytes += b; n++;
  }
  return { batches, items: items.length, swatches: head.length - 2, anchors: shapes.reduce((a, sh) => a + sh.loops.reduce((x, l) => x + l.length, 0), 0), bytes, regions: shapes.map((sh) => sh.region) };
}
