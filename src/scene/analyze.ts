// scene analyze: the whole pixel pipeline in one call — rectify, Lab, smooth, quantize, regions, planar map, fits,
// z order, own render and error. recompute() redoes the geometry after edits.
import { createHash } from 'node:crypto';
import { fitLongest, type Img } from '../image.js';
import { rgbToLab, labToRgb, de76, type Lab } from './color.js';
import { planeStats, findRamps, rampOf } from './ramps.js';
import { rectify } from './rectify.js';
import { bilateral } from './smooth.js';
import { quantize, type Quant } from './quantize.js';
import { segment, regionStats } from './regions.js';
import { planarMap } from './planar.js';
import { fitEdges } from './fitedges.js';
import { zOrder, stacked, fillers, type Shape } from './stack.js';
import { partPts } from './planar.js';
import { detectPrimitive, primSegs, type Prim } from './primitives.js';
import { rasterize, rmse } from './raster.js';
import { centreline, strokeOutline } from './stroke.js';
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
  const r = rectify(src, { crop: p.crop, map: p.map, bilinear: p.bilinear, size: p.size, maxPx: p.maxPx, upscale: p.upscale });
  const work = r.img, raw = rgbToLab(work), lab = bilateral(raw, { passes: d.passes });
  const skip = work.a ? work.a.map((v) => (v < 128 ? 1 : 0)) : undefined;
  const quant = sortInks(quantize(lab, { colors: p.colors, minDe: p.minDe, skip }));
  // noise measured at ≤ 600 px: a full-resolution JPEG of flat art has pixel noise too, a photo keeps its grain
  const small = fitLongest(work, 600), sl = rgbToLab(small);
  return { work, toSource: r.toSource, lab, quant, photo: p.photo ?? isPhoto(sl, bilateral(sl)) };
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
    zMoves: [], tile: false, tol: d.tol, edits: [], textBoxes: [], fillers: new Map(),
    pm: null as never, fits: [], z: [], prims: [], ramps: [], shapes: [], render: work, iou: [], estRmse: 0, ms: 0,
  };
  if (p.ownInks !== false) ownInks(s, Math.max(minArea, 20));
  s.initial = snapshot(s);
  recompute(s);
  s.ms = Math.round(performance.now() - t0);
  return s;
}

/** a region's colour inside, 2 px or more from its outline (an outline mixes with its neighbours: a small region's
 * plain mean is pulled towards them); n = 0 when it has no such pixels */
export function interiorMeans(map: Int32Array, w: number, h: number, nReg: number, lab: Lab): { n: number; L: number; a: number; b: number; spread: number }[] {
  const acc = new Float64Array(nReg * 5), R = 2;
  // rows first: run of the same region ≥ 2R+1 around x, then the same over columns of that mask
  const row = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let start = 0;
    for (let x = 1; x <= w; x++) {
      if (x < w && map[y * w + x] === map[y * w + start]) continue;
      for (let k = start + R; k <= x - 1 - R; k++) row[y * w + k] = 1;
      start = x;
    }
  }
  for (let y = R; y < h - R; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, r = map[i];
    if (r < 0 || !row[i]) continue;
    let ok = true;
    for (let k = -R; k <= R && ok; k++) ok = row[i + k * w] === 1 && map[i + k * w] === r;
    if (!ok) continue;
    const o = r * 5;
    acc[o]++; acc[o + 1] += lab.L[i]; acc[o + 2] += lab.A[i]; acc[o + 3] += lab.B[i];
    acc[o + 4] += lab.L[i] ** 2 + lab.A[i] ** 2 + lab.B[i] ** 2;
  }
  // spread: rms ΔE of the inside pixels from their mean (one colour: small; two inks in one region: large)
  return Array.from({ length: nReg }, (_, r) => {
    const o = r * 5, n = acc[o];
    if (!n) return { n: 0, L: 0, a: 0, b: 0, spread: 0 };
    const L = acc[o + 1] / n, a = acc[o + 2] / n, b = acc[o + 3] / n;
    return { n, L, a, b, spread: Math.sqrt(Math.max(0, acc[o + 4] / n - L * L - a * a - b * b)) };
  });
}

/** the inks come from a colour histogram, which has no sense of space: a small region of its own colour (lips, a
 * button) loses its centre to a bigger ink 15–35 ΔE away. A region whose inside sits more than 2 × min_de (≥ 10)
 * from its ink moves to an ink near its colour — an existing one, or a new one shared by regions of that colour.
 * Only one-colour insides (spread < 1.5 × that): a region that took in pieces of two inks (letters merged into a ring)
 * would get their average, a third colour that is in neither */
export function ownInks(s: Scene, minInner: number): number {
  const { w, h } = s.work, T = Math.max(10, 2 * s.params.minDe), R = s.seg.regions;
  const inner = interiorMeans(s.seg.map, w, h, R.length, s.lab);
  const far = R.map((_, i) => i).filter((i) => {
    const m = inner[i], c = s.colours[s.meta[i].colour];
    return R[i].area && m.n >= minInner && m.spread < T * 1.5 && de76(m.L, m.a, m.b, c.L, c.a, c.b) > T;
  }).sort((x, y) => inner[y].n - inner[x].n);
  const first = s.colours.length;
  let moved = 0;
  for (const i of far) {
    const m = inner[i];
    let best = -1, bd = Infinity;
    s.colours.forEach((c, ci) => { const d = de76(m.L, m.a, m.b, c.L, c.a, c.b); if (d < bd) { bd = d; best = ci; } });
    if (bd > (best >= first ? s.params.minDe * 1.5 : T)) {
      if (s.colours.length >= 64) continue;
      s.colours.push({ L: m.L, a: m.a, b: m.b }); best = s.colours.length - 1;
    }
    if (best !== s.meta[i].colour) { s.meta[i].colour = best; moved++; }
  }
  // a new ink is the weighted mean of its regions' insides
  for (let ci = first; ci < s.colours.length; ci++) {
    let n = 0, L = 0, a = 0, b = 0;
    for (const i of far) if (s.meta[i].colour === ci) { const m = inner[i]; n += m.n; L += m.L * m.n; a += m.a * m.n; b += m.b * m.n; }
    if (n) s.colours[ci] = { L: L / n, a: a / n, b: b / n };
  }
  return moved;
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
/** regions not filled: skipped ones and strokes (drawn on top as a centreline; what lies under them fills their place) */
const unfilled = (s: Scene) => { const k = skipped(s); s.meta.forEach((m, i) => { if (m.stroke && s.seg.regions[i]?.area) k.add(i); }); return k; };

/** geometry and checks from the current labels and meta */
export function recompute(s: Scene): void {
  const { w, h } = s.work;
  s.seg.regions = regionStats(s.seg.map, w, h, s.seg.regions.length, s.lab, s.quant.labels);
  s.pm = planarMap(s.seg.map, w, h);
  const tolOf = (e: { left: number; right: number }) => s.edgeTol?.[e.left < e.right ? `${e.left},${e.right}` : `${e.right},${e.left}`] ?? Math.min(...[e.left, e.right].map((r) => (r >= 0 ? s.meta[r].tol ?? s.tol : s.tol)));
  s.fits = fitEdges(s.pm, { tolOf });
  s.z = applyZ(s, zOrder(s.pm, s.seg.regions));
  const exact = new Map(s.meta.map((m, i) => [i, m.multiply] as const).filter(([i, m]) => m && s.seg.regions[i].area) as [number, number[]][]);
  const skip = unfilled(s), given = new Map(s.meta.map((m, i) => [i, m.fill] as const).filter(([, f]) => f !== undefined) as [number, number][]);
  s.fillers = fillers(s.seg.regions, s.z, skip, given);
  const shapes = stacked(s.pm, s.seg.regions, s.z, s.fits, { tile: s.tile, skip, exact, filler: s.fillers });
  // strokes (F18): one centreline each, slotted into the stack at the region's z
  for (const [i, m] of s.meta.entries()) {
    if (!m.stroke || !s.seg.regions[i]?.area || skipped(s).has(i)) continue;
    const st = centreline(s.seg.map, w, h, i, s.seg.regions[i].bbox, m.tol ?? s.tol);
    if (!st) continue;
    const at = shapes.findIndex((sh) => s.z[sh.region] > s.z[i]);
    shapes.splice(at < 0 ? shapes.length : at, 0, { region: i, loops: strokeOutline(st), raw: [], holes: st.closed, stroke: st });
  }
  s.prims = primitives(s, shapes);
  for (const sh of shapes) { const p = s.prims[sh.region]; if (p) { sh.loops = [primSegs(p)]; sh.holes = false; } }
  s.shapes = shapes;
  s.ramps = s.seg.regions.map((r, id) => (r.area && s.meta[id].ramp ? rampOf(s.seg.map, w, h, s.lab, id) : null));
  const out = rasterize(shapes.map((sh) => {
    const rp = s.ramps[sh.region];
    return { loops: sh.loops, rgb: colourRgb(s, sh.region), evenodd: sh.holes, id: sh.region, blend: sh.blend, grad: rp ? { ...rp, c0: labToRgb(rp.c0[0], rp.c0[1], rp.c0[2]), c1: labToRgb(rp.c1[0], rp.c1[1], rp.c1[2]) } : undefined };
  }), w, h, { ids: true, bg: [255, 255, 255] });
  s.render = out.img;
  s.drawn = out.ids;
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
    if (m.prim === 'free' || !sh.raw.length || (r.area < 60 && !m.prim)) continue;
    // automatic: one clean outline; forced: the largest outer loop (holes and pieces drawn on it don't matter)
    const outer = sh.raw.filter((l) => l.outer).sort((a, b) => a.area - b.area)[0];
    if (!outer || (!m.prim && (sh.raw.length !== 1))) continue;
    const pts: number[][] = [];
    for (const p of outer.parts) { const q = partPts(s.pm, p); pts.push(...(pts.length ? q.slice(1) : q)); }
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

/** the state right after analyze (edits `undo` / `reset` replay from here) */
export function snapshot(s: Scene): Scene['initial'] {
  return { map: new Int32Array(s.seg.map), colours: JSON.parse(JSON.stringify(s.colours)), meta: JSON.parse(JSON.stringify(s.meta)), tol: s.tol };
}
