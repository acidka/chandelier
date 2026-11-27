// scene build: the scene → ordinary batch steps (one Apple event = one undo step): clear the layer, global swatches,
// then one path per drawn region, bottom to top (new items go in front, so order is z). Coordinates stay in working
// px; create_path's scale and x, y place them on the target rect.
import { segsToD, bez, type Seg } from '../fitcurve.js';
import { labHex, de76 } from './color.js';
import { live, primSegs } from './primitives.js';
import type { Scene } from './types.js';

export interface BuildOpts {
  /** [x, y, w, h] in session units on the target artboard */
  rect: number[];
  /** session units the shapes run past the image border (border points move outward) */
  bleed?: number;
  layer?: string;
  artboard?: number;
  /** where the layer goes: "top" | "bottom" | "above:Name" | "below:Name"; omitted = top for a new layer, an existing
   * layer stays where it is */
  position?: string;
  /** what the build replaces: the whole layer (default), only these items (a rebuild: hand-added items stay), or
   * nothing (a new layer) */
  clear?: 'layer' | 'none' | string[];
  /** points per session unit (stroke widths are in pt): mm 2.835, in 72; default 1 */
  ptPerUnit?: number;
}

export interface BatchStep { tool: string; args: Record<string, unknown>; artboard?: number }

// at most 100 items per step: the runtime lists only the first 100 created items of a step (A.outList), and the build
// must know every uuid to replace exactly its own items on a rebuild
const MAX_ITEMS = 100, MAX_BYTES = 1_500_000;

export const swatchName = (s: Scene, ci: number, layer: string) => s.colours[ci].swatch ?? s.colours[ci].name ?? `${layer} c${ci}`;

/** steps in one or more batches (more only when a batch would be too large for one call) */
export interface TextBox { rect: number[]; colour: string; cap: number; regions: string }

export function buildSteps(s: Scene, o: BuildOpts): { batches: BatchStep[][]; items: number; swatches: number; anchors: number; bytes: number; regions: number[]; textBoxes: TextBox[] } {
  const layer = o.layer ?? 'Scene', { w, h } = s.work, [rx, ry, rw, rh] = o.rect;
  const sx = rw / w, sy = rh / h, bx = (o.bleed ?? 0) / sx, by = (o.bleed ?? 0) / sy;
  // a loop of one segment collapses to a single point in Illustrator ("no drawable segments") and would fail the whole
  // build: such loops are left out, and a region with nothing left is not drawn (a primitive is always drawable)
  const shapes = s.shapes
    .map((sh) => (s.prims[sh.region] ? sh : { ...sh, loops: sh.loops.filter((l) => l.length >= 2) }))
    .filter((sh) => s.prims[sh.region] || sh.loops.length);
  const used =[...new Set(shapes.map((sh) => s.meta[sh.region].colour))].sort((a, b) => a - b);
  const ramps = shapes.filter((sh) => s.ramps[sh.region]);
  const head: BatchStep[] = [
    ...(o.clear === 'none' || (Array.isArray(o.clear) && !o.clear.length) ? [] : [{ tool: 'delete_items', args: { refs: Array.isArray(o.clear) ? o.clear : `layer:${layer}` } }]),
    { tool: 'layers', args: { action: 'add', name: layer, ...(o.position ? { position: o.position } : {}) } },
    // hex, not lab(): Illustrator refuses a Lab colour in a global swatch (MRAP, quirk C34); it converts hex through the document profile
    ...used.filter((ci) => !s.colours[ci].swatch).map((ci) => ({ tool: 'swatches', args: { action: 'add', kind: 'global', name: swatchName(s, ci, layer), color: labHex(s.colours[ci].L, s.colours[ci].a, s.colours[ci].b) } })),
    // a ramp: its own gradient swatch; stops placed where Illustrator's default span (the item's box extent along the
    // turned to the angle) meets our projection range
    ...ramps.map((sh) => {
      const rp = s.ramps[sh.region]!, g = rampGeom(s, sh, sx, sy, bx, by), qc = rp.ux * rp.cx + rp.uy * rp.cy;
      const at = (t: number) => Math.max(0, Math.min(100, Math.round(((100 * (qc + t - g.q0)) / (g.q1 - g.q0)) * 10) / 10));
      return { tool: 'swatches', args: { action: 'add', kind: 'gradient', name: `${layer} r${sh.region} ramp`, type: 'linear', stops: [{ color: labHex(rp.c0[0], rp.c0[1], rp.c0[2]), at: at(rp.t0) }, { color: labHex(rp.c1[0], rp.c1[1], rp.c1[2]), at: at(rp.t1) }] } };
    }),
  ];
  // points on the image border run out into the bleed
  const push = (p: number[]) => [p[0] <= 1e-6 ? -bx : p[0] >= w - 1e-6 ? w + bx : p[0], p[1] <= 1e-6 ? -by : p[1] >= h - 1e-6 ? h + by : p[1]];
  const bleedSegs = (loop: Seg[]): Seg[] => (bx || by ? loop.map((c) => c.map(push) as Seg) : loop);
  const r2 = (v: number) => Math.round(v * 1000) / 1000;
  const items = shapes.map((sh) => {
    const rp = s.ramps[sh.region], angle = rp ? rampGeom(s, sh, sx, sy, bx, by).angle : 0;
    const common = { fill: rp ? `gradient:${layer} r${sh.region} ramp@${angle}` : `swatch:${swatchName(s, s.meta[sh.region].colour, layer)}`, name: s.meta[sh.region].name ?? `${layer} r${sh.region}`, note: `scene ${s.id} r${sh.region}` };
    const pr = s.prims[sh.region];
    if (sh.stroke) {
      // a centreline stroke (F18): no fill, the measured width; open bands butt-capped, corners mitred
      const sw = r2(sh.stroke.width * ((sx + sy) / 2) * (o.ptPerUnit ?? 1));
      return { tool: 'create_path', item: { d: segsToD([sh.stroke.segs], sh.stroke.closed), fill: 'none', stroke: common.fill, stroke_width: sw, join: 'miter', cap: 'butt', name: common.name, note: common.note } };
    }
    if (pr && live(pr)) {
      // a live shape in session units; a side on the image border runs into the bleed
      let x0 = pr.cx - pr.a, x1 = pr.cx + pr.a, y0 = pr.cy - pr.b, y1 = pr.cy + pr.b;
      if (pr.kind === 'rect') { if (x0 < 0.75) x0 = -bx; if (y0 < 0.75) y0 = -by; if (x1 > w - 0.75) x1 = w + bx; if (y1 > h - 0.75) y1 = h + by; }
      const shape = pr.kind === 'rounded' ? 'rounded_rect' : pr.kind === 'circle' ? 'ellipse' : pr.kind;
      return { tool: 'create_shape', item: { ...(sh.blend ? { blend: sh.blend } : {}), shape, x: r2(rx + x0 * sx), y: r2(ry + y0 * sy), w: r2((x1 - x0) * sx), h: r2((y1 - y0) * sy), ...(pr.kind === 'rounded' ? { r: r2(pr.r! * Math.min(sx, sy)) } : {}), ...common } };
    }
    return { tool: 'create_path', item: { d: segsToD(sh.loops.map(bleedSegs), true), ...(sh.holes ? { fill_rule: 'evenodd' } : {}), ...(sh.blend ? { blend: sh.blend } : {}), ...common } };
  });
  const swatchSteps = head.filter((x) => x.tool === 'swatches' && x.args.kind === 'global').length;
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
  // logos: the mark and what is drawn on it, grouped; placeholders: a named empty box on top
  const last = batches[batches.length - 1], nameOf = (id: number) => s.meta[id].name ?? `${layer} r${id}`;
  const drawn = new Set(shapes.map((sh) => sh.region));
  s.meta.forEach((m, id) => {
    if (!m.logo || !drawn.has(id)) return;
    const bb = s.seg.regions[id].bbox;
    const members = shapes.map((sh) => sh.region).filter((r) => s.z[r] >= s.z[id] && inBox(s.seg.regions[r].bbox, bb));
    last.push({ tool: 'arrange_items', args: { action: 'group', refs: members.map((r) => `name:${nameOf(r)}`), name: `Logo r${id}` } });
  });
  s.meta.forEach((m, id) => {
    if (!m.placeholder || !s.seg.regions[id].area) return;
    const b = s.seg.regions[id].bbox;
    last.push({ tool: 'create_shape', args: { layer, shape: 'rect', x: r2(rx + b[0] * sx), y: r2(ry + b[1] * sy), w: r2((b[2] - b[0] + 1) * sx), h: r2((b[3] - b[1] + 1) * sy), fill: 'none', stroke: '#999999', stroke_width: 0.5, dash: [2, 2], name: m.name ?? `Placeholder r${id}` } });
  });
  // text boxes for the agent's create_text: session units, the text's ink and cap height
  const textBoxes = s.textBoxes.filter((tb) => tb.ids.some((i) => s.meta[i].text)).map((tb) => {
    const ink = textInk(s, tb.ids), c = s.colours[ink.colour];
    return { rect: [r2(rx + tb.rect[0] * sx), r2(ry + tb.rect[1] * sy), r2(tb.rect[2] * sx), r2(tb.rect[3] * sy)], colour: c.swatch ? `swatch:${c.swatch}` : labHex(c.L, c.a, c.b), cap: r2(ink.cap * sy), regions: tb.ids.map((i) => 'r' + i).join(' ') };
  });
  return { textBoxes, batches, items: items.length, swatches: swatchSteps, anchors: shapes.reduce((a, sh) => a + sh.loops.reduce((x, l) => x + l.length, 0), 0), bytes, regions: shapes.map((sh) => sh.region) };
}

/** The text in a box: the ink that stands out from what it sits on (F47: the largest region was the paper around the
 * letters, so the caption came back #ffffff), and its cap height from the letters' heights (F44, F50: the box height
 * was given as cap). Counters sit on their letter, whose filler is the paper: same ink as the paper, not chosen. */
export function textInk(s: Scene, ids: number[]): { colour: number; cap: number } {
  const R = s.seg.regions, col = (i: number) => s.colours[s.meta[i].colour];
  const contrast = (i: number) => { const f = s.fillers.get(i); if (f === undefined || f < 0 || !R[f]) return 0; const a = col(i), b = col(f); return de76(a.L, a.a, a.b, b.L, b.a, b.b); };
  // letters lie inside the paper around them (a label, the page between the lines): the ink whose regions lie most
  // inside another ink's region wins; counters lie inside letters too, but they are small
  const live = ids.filter((i) => R[i]?.area && contrast(i) > 10), inside = new Map<number, number>(), byInk = new Map<number, number>();
  const within = (a: number[], b: number[]) => a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3];
  for (const i of live) {
    const c = s.meta[i].colour;
    byInk.set(c, (byInk.get(c) ?? 0) + R[i].area);
    if (ids.some((j) => j !== i && R[j]?.area && s.meta[j].colour !== c && within(R[i].bbox, R[j].bbox))) inside.set(c, (inside.get(c) ?? 0) + R[i].area);
  }
  let colour: number;
  if (inside.size) colour = [...inside].sort((a, b) => b[1] - a[1])[0][0];
  else if (byInk.size) colour = [...byInk].sort((a, b) => b[1] - a[1])[0][0];
  else colour = s.meta[ids.reduce((p, i) => ((R[i]?.area ?? 0) > (R[p]?.area ?? 0) ? i : p), ids[0])].colour;
  // letters of that ink: their heights; capitals and ascenders sit at the top of the sorted list, x-height letters
  // and stray dots below — the 75th percentile is the cap height of a mixed-case line (all of them for capitals)
  const hs = ids.filter((i) => R[i]?.area && s.meta[i].colour === colour).map((i) => R[i].bbox[3] - R[i].bbox[1] + 1).sort((a, b) => a - b);
  const cap = hs.length ? hs[Math.min(hs.length - 1, Math.floor(hs.length * 0.75))] : 0;
  return { colour, cap };
}

/** Where a ramp's gradient sits in Illustrator (F22). Measured live (2026-11-27, 29.1): a linear fill's default span is
 * the extent of the item's own outline along the gradient's direction, centred on it (a rectangle: |w·cos a| + |h·sin a|;
 * an ellipse 2·√((rx·cos a)² + (ry·sin a)²)). It was taken as the box width: angled ramps came out compressed and flat
 * at both ends. Iso-lines are perpendicular to u in working px; after scaling by sx, sy their normal is (ux/sx, uy/sy),
 * the gradient's direction. Projections onto it are proportional to q = ux·x + uy·y in working px, so the stops are
 * fractions of the outline's q range. */
function rampGeom(s: Scene, sh: { region: number; loops: Seg[][] }, sx: number, sy: number, bx: number, by: number): { angle: number; q0: number; q1: number } {
  const rp = s.ramps[sh.region]!, pr = s.prims[sh.region], { w, h } = s.work;
  const nx = rp.ux / sx, ny = rp.uy / sy, a = Math.atan2(-ny, nx);
  const push = (p: number[]) => [p[0] <= 1e-6 ? -bx : p[0] >= w - 1e-6 ? w + bx : p[0], p[1] <= 1e-6 ? -by : p[1] >= h - 1e-6 ? h + by : p[1]];
  let q0 = Infinity, q1 = -Infinity;
  const take = (x: number, y: number) => { const q = rp.ux * x + rp.uy * y; if (q < q0) q0 = q; if (q > q1) q1 = q; };
  if (pr && live(pr) && pr.kind === 'rect') {
    // a live rectangle whose side is on the image border runs into the bleed (as the item does)
    let x0 = pr.cx - pr.a, x1 = pr.cx + pr.a, y0 = pr.cy - pr.b, y1 = pr.cy + pr.b;
    if (x0 < 0.75) x0 = -bx; if (y0 < 0.75) y0 = -by; if (x1 > w - 0.75) x1 = w + bx; if (y1 > h - 0.75) y1 = h + by;
    for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) take(x, y);
  } else {
    const loops = pr && live(pr) ? [primSegs(pr)] : sh.loops.map((l) => l.map((c) => c.map(push) as Seg));
    for (const l of loops) for (const c of l) for (let i = 0; i <= 16; i++) { const p = bez(c, i / 16); take(p[0], p[1]); }
  }
  if (!(q1 > q0)) q1 = q0 + 1;
  return { angle: Math.round((a * 180) / Math.PI * 10) / 10, q0, q1 };
}

/** bounding box of loops (working px): width (the gradient's default span) and centre */
function bbox(loops: Seg[][]): number[] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of loops) for (const c of l) for (const p of c) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  return [x0, y0, x1, y1];
}

const inBox = (a: number[], b: number[]) => a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3];
