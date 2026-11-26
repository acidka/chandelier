// scene analyze: the whole pixel pipeline in one call — rectify, Lab, smooth, quantize, regions, planar map, fits,
// z order, own render and error. recompute() redoes the geometry after edits.
import { createHash } from 'node:crypto';
import { fitLongest, type Img } from '../image.js';
import { rgbToLab, labToRgb, type Lab } from './color.js';
import { planeStats, findRamps, rampOf } from './ramps.js';
import { rectify } from './rectify.js';
import { bilateral } from './smooth.js';
import { quantize, type Quant } from './quantize.js';
import { segment, regionStats } from './regions.js';
import { planarMap } from './planar.js';
import { fitEdges } from './fitedges.js';
import { zOrder, stacked, type Shape } from './stack.js';
import { partPts } from './planar.js';
import { detectPrimitive, primSegs, type Prim } from './primitives.js';
import { rasterize, rmse } from './raster.js';
import { DETAIL, type Params, type Scene } from './types.js';

let counter = 0;
export const nextId = () => `s${++counter}`;

/** quantizer centres sorted by pixel count (c0 = the commonest ink), labels remapped */
function sortInks(q: Quant): Quant {
  const order = q.counts.map((_, i) => i).sort((a, b) => q.counts[b] - q.counts[a]), to = new Uint8Array(256).fill(255);
  order.forEach((c, n) => { to[c] = n; });
  const centres = new Float32Array(q.k * 3);
  order.forEach((c, n) => centres.set(q.centres.subarray(c * 3, c * 3 + 3), n * 3));
  return { k: q.k, centres, counts: order.map((c) => q.counts[c]), labels: q.labels.map((v) => to[v]) };
}

/** the deterministic part before regions: working image, Lab, inks (a saved scene reloads through this) */
export function prepare(src: Img, p: Params) {
  const d = DETAIL[p.detail];
  const r = rectify(src, { crop: p.crop, map: p.map, bilinear: p.bilinear, size: p.size, maxPx: p.maxPx });
  const work = r.img, raw = rgbToLab(work), lab = bilateral(raw, { passes: d.passes });
  const skip = work.a ? work.a.map((v) => (v < 128 ? 1 : 0)) : undefined;
  const quant = sortInks(quantize(lab, { colors: p.colors, minDe: p.minDe, skip }));
  // noise measured at ≤ 600 px: a full-resolution JPEG of flat art has pixel noise too, a photo keeps its grain
  const small = fitLongest(work, 600), sl = rgbToLab(small);
  return { work, toSource: r.toSource, lab, quant, photo: isPhoto(sl, bilateral(sl)) };
}

export function analyze(src: Img, p: Params, o: { id?: string; dir: string; path: string; bytes?: Buffer }): Scene {
  const t0 = performance.now(), d = DETAIL[p.detail];
  const { work, toSource, lab, quant, photo } = prepare(src, p);
  const r = { toSource };
  const minArea = Math.max(4, Math.round(Math.max(12, work.w * work.h * 5e-5) * d.area));
  const seg = segment(lab, quant.labels, { minDe: p.minDe, minArea, centres: quant.centres });
  // ramps: bands of one gradient. A photo's are lighting: merged into one flat region; artwork's: a hint
  const st = planeStats(seg.map, work.w, work.h, lab, seg.regions.length);
  const rampGroups = findRamps(seg.regions, st, p.minDe, Math.max(minArea, work.w * work.h * 5e-4)).map((ids) => {
    const L = ids.map((i) => seg.regions[i].L);
    return { ids, dL: Math.round(Math.max(...L) - Math.min(...L)), merged: photo };
  });
  if (photo) {
    const to = new Int32Array(seg.regions.length).map((_, i) => i);
    for (const g of rampGroups) for (const i of g.ids.slice(1)) to[i] = g.ids[0];
    for (let i = 0; i < seg.map.length; i++) if (seg.map[i] >= 0) seg.map[i] = to[seg.map[i]];
  }
  const colours = Array.from({ length: quant.k }, (_, i) => ({ L: quant.centres[i * 3], a: quant.centres[i * 3 + 1], b: quant.centres[i * 3 + 2] }));
  const s: Scene = {
    id: o.id ?? nextId(), dir: o.dir, params: p,
    source: { path: o.path, sha1: o.bytes ? createHash('sha1').update(o.bytes).digest('hex') : '', w: src.w, h: src.h },
    work, toSource: r.toSource, lab, photo, rampGroups, quant, seg, colours,
    meta: seg.regions.map((g) => ({ colour: Math.max(0, g.group) })),
    zMoves: [], tile: false, tol: d.tol, edits: [], textBoxes: [],
    pm: null as never, fits: [], z: [], prims: [], ramps: [], shapes: [], render: work, iou: [], estRmse: 0, ms: 0,
  };
  recompute(s);
  s.ms = Math.round(performance.now() - t0);
  return s;
}

export const colourRgb = (s: Scene, id: number) => { const c = s.colours[s.meta[id].colour]; return labToRgb(c.L, c.a, c.b); };

/** apply z moves to the automatic order */
export function applyZ(s: Scene, auto: number[]): number[] {
  const order = auto.map((_, i) => i).sort((a, b) => auto[a] - auto[b]);
  for (const m of s.zMoves) {
    const i = order.indexOf(m.id);
    if (i < 0) continue;
    order.splice(i, 1);
    if (m.how === 'top') order.push(m.id);
    else if (m.how === 'bottom') order.unshift(m.id);
    else { const j = order.indexOf(m.ref!); order.splice(m.how === 'over' ? j + 1 : j, 0, m.id); }
  }
  const z = new Array<number>(auto.length);
  order.forEach((id, n) => { z[id] = n; });
  return z;
}

/** regions not drawn (dropped, left for text) */
export const skipped = (s: Scene) => new Set(s.meta.map((m, i) => (m.drop || m.text || m.placeholder ? i : -1)).filter((i) => i >= 0));

/** geometry and checks from the current labels and meta */
export function recompute(s: Scene): void {
  const { w, h } = s.work;
  s.seg.regions = regionStats(s.seg.map, w, h, s.seg.regions.length, s.lab, s.quant.labels);
  s.pm = planarMap(s.seg.map, w, h);
  const tolOf = (e: { left: number; right: number }) => s.edgeTol?.[e.left < e.right ? `${e.left},${e.right}` : `${e.right},${e.left}`] ?? Math.min(...[e.left, e.right].map((r) => (r >= 0 ? s.meta[r].tol ?? s.tol : s.tol)));
  s.fits = fitEdges(s.pm, { tolOf });
  s.z = applyZ(s, zOrder(s.pm, s.seg.regions));
  const exact = new Map(s.meta.map((m, i) => [i, m.multiply] as const).filter(([i, m]) => m && s.seg.regions[i].area) as [number, number[]][]);
  const shapes = stacked(s.pm, s.seg.regions, s.z, s.fits, { tile: s.tile, skip: skipped(s), exact });
  s.prims = primitives(s, shapes);
  for (const sh of shapes) { const p = s.prims[sh.region]; if (p) { sh.loops = [primSegs(p)]; sh.holes = false; } }
  s.shapes = shapes;
  s.ramps = s.seg.regions.map((r, id) => (r.area && s.meta[id].ramp ? rampOf(s.seg.map, w, h, s.lab, id) : null));
  const out = rasterize(shapes.map((sh) => {
    const rp = s.ramps[sh.region];
    return { loops: sh.loops, rgb: colourRgb(s, sh.region), evenodd: sh.holes, id: sh.region, blend: sh.blend, grad: rp ? { ...rp, c0: labToRgb(rp.c0[0], rp.c0[1], rp.c0[2]), c1: labToRgb(rp.c1[0], rp.c1[1], rp.c1[2]) } : undefined };
  }), w, h, { ids: true, bg: [255, 255, 255] });
  s.render = out.img;
  s.estRmse = Math.round(rmse(s.work, out.img) * 1000) / 1000;
  // IoU of each region's visible pixels in the render vs its labels
  const inter = new Float64Array(s.seg.regions.length), uni = new Float64Array(s.seg.regions.length);
  for (let i = 0; i < w * h; i++) {
    const a = s.seg.map[i], b = out.ids![i];
    if (a >= 0) uni[a]++;
    if (b >= 0 && b !== a) uni[b]++;
    if (a >= 0 && a === b) inter[a]++;
  }
  s.iou = s.seg.regions.map((_, i) => (uni[i] ? Math.round((inter[i] / uni[i]) * 100) / 100 : 0));
}

/** S2a: primitive per drawn shape — in stacked mode the region plus what it runs under (the background is the whole
 * image: a rectangle) — when it is one boundary loop without holes and 60 px or more */
export function primitives(s: Scene, shapes: Shape[]): (Prim | null)[] {
  const out: (Prim | null)[] = s.seg.regions.map(() => null);
  if (s.tile) return out;
  for (const sh of shapes) {
    const m = s.meta[sh.region], r = s.seg.regions[sh.region];
    if (m.prim === 'free' || sh.raw.length !== 1 || !sh.raw[0].outer || (r.area < 60 && !m.prim)) continue;
    const pts: number[][] = [];
    for (const p of sh.raw[0].parts) { const q = partPts(s.pm, p); pts.push(...(pts.length ? q.slice(1) : q)); }
    out[sh.region] = detectPrimitive(pts, m.prim);
  }
  return out;
}

/** a photo or rendered mockup: inside flat areas (no edge nearby in the smoothed image) pixels still differ from their
 * smoothed selves (grain, sensor noise); flat artwork is clean there, JPEG noise sits only near its edges */
export function isPhoto(raw: Lab, smooth: Lab): boolean {
  const { w, h } = raw, d: number[] = [];
  for (let y = 2; y < h - 2; y += 2) for (let x = 2; x < w - 2; x += 2) {
    const i = y * w + x;
    let g = 0;
    for (const j of [i - 2, i + 2, i - 2 * w, i + 2 * w]) g = Math.max(g, Math.abs(smooth.L[j] - smooth.L[i]) + Math.abs(smooth.A[j] - smooth.A[i]) + Math.abs(smooth.B[j] - smooth.B[i]));
    if (g < 3) d.push(Math.hypot(raw.L[i] - smooth.L[i], raw.A[i] - smooth.A[i], raw.B[i] - smooth.B[i]));
  }
  d.sort((a, b) => a - b);
  return d.length > 100 && d[d.length >> 1] > 0.25;
}
