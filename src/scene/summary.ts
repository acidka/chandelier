// scene: the 1-page summary an agent reads instead of the pixels (one JSON line, a region table, inks, hints).
import { de76, labHex } from './color.js';
import { nearPairs } from './quantize.js';
import { findOverlaps } from './overlap.js';
import type { Scene } from './types.js';

export interface SummaryOpts { show?: number[]; showColour?: number; limit?: number; file?: string }

const pct = (v: number) => (v >= 1 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v.toFixed(3));
const pad = (s: string, n: number) => (s.length >= n ? s + ' ' : s + ' '.repeat(n - s.length));

/** ids as "r1-r4 r7": consecutive ids joined, in id order */
export function idRanges(ids: number[]): string {
  const v = [...new Set(ids)].sort((a, b) => a - b), out: string[] = [];
  for (let i = 0; i < v.length; i++) { let j = i; while (j + 1 < v.length && v[j + 1] === v[j] + 1) j++; out.push(j > i ? `r${v[i]}-r${v[j]}` : `r${v[i]}`); i = j; }
  return out.join(' ');
}

export const alive = (s: Scene) => s.seg.regions.filter((r) => r.area > 0);

export function kindOf(s: Scene, id: number): string {
  const m = s.meta[id];
  const p = s.prims[id], shape = p ? (p.kind === 'polygon' ? `poly${p.n}` : p.kind) : '';
  if (m.stroke && !m.drop && !m.text) { const st = s.shapes.find((sh) => sh.region === id)?.stroke; return st ? `stroke ${st.width}` : 'stroke?'; }
  const k = m.drop ? (s.fillers.has(id) ? `drop→r${s.fillers.get(id)}` : 'drop') : m.text ? 'text' : m.placeholder ? 'box' : m.logo ? 'logo' : m.ramp ? (shape ? shape + '+ramp' : 'ramp') : shape || 'flat';
  return m.multiply ? k + '×' : k;
}

export function conf(s: Scene, id: number): number {
  return Math.min(s.seg.regions[id].homog, s.iou[id] ?? 0);
}

export function summary(s: Scene, o: SummaryOpts = {}): string {
  const { w, h } = s.work, total = w * h, regs = alive(s).sort((a, b) => b.area - a.area);
  const drawnRegs = regs.filter((r) => !s.meta[r.id].drop && !s.meta[r.id].text && !s.meta[r.id].placeholder);
  const usedColours = [...new Set(drawnRegs.map((r) => s.meta[r.id].colour))].sort((a, b) => a - b);
  // what the build writes: the drawn shapes' segments (a shared edge counts in each shape that uses it)
  const anchors = s.shapes.reduce((a, sh) => a + sh.loops.reduce((x, l) => x + l.length, 0), 0);
  const head = { id: s.id, file: o.file, px: [w, h], ...(s.photo ? { photo: true } : {}), regions: regs.length, drawn: drawnRegs.length, colours: usedColours.length, edges: s.pm.edges.length, anchors, est_rmse: s.estRmse, ms: s.ms };
  const lines = [JSON.stringify(head)];
  const limit = o.limit ?? 40;
  let rows = regs.slice(0, limit);
  if (o.show?.length) rows = o.show.map((id) => s.seg.regions[id]).filter((r) => r && r.area > 0);
  if (o.showColour !== undefined) rows = regs.filter((r) => s.meta[r.id].colour === o.showColour);
  // where (F49): the region's box in the analyzed image's px, so ids can be picked without reading the overlay
  lines.push('id    colour   area%   kind      z    where           next              conf c    name');
  for (const r of rows) {
    const c = s.colours[s.meta[r.id].colour];
    const next = [...r.nbrs.entries()].filter(([n]) => s.seg.regions[n].area > 0).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n]) => 'r' + n).join(' ');
    lines.push(pad('r' + r.id, 6) + pad(labHex(c.L, c.a, c.b), 9) + pad(pct((r.area / total) * 100), 8) + pad(kindOf(s, r.id), 10) + pad(String(s.z[r.id]), 5) + pad(`${r.bbox[0]},${r.bbox[1]} ${r.bbox[2] - r.bbox[0] + 1}x${r.bbox[3] - r.bbox[1] + 1}`, 16) + pad(next || '-', 18) + pad(conf(s, r.id).toFixed(2).replace(/^0/, ''), 5) + pad('c' + s.meta[r.id].colour, 5) + (s.meta[r.id].name ?? ''));
  }
  if (!o.show && o.showColour === undefined && regs.length > limit) {
    const rest = regs.slice(limit), max = (rest[0].area / total) * 100;
    lines.push(`+${rest.length} regions ≤ ${pct(max)} % (show r${rest[0].id}… or show r<a>-r<b>)`);
  }
  // inks
  const members = new Map<number, number[]>();
  for (const r of drawnRegs) { const c = s.meta[r.id].colour; if (!members.has(c)) members.set(c, []); members.get(c)!.push(r.id); }
  lines.push('colours: ' + usedColours.map((ci) => {
    const c = s.colours[ci], m = members.get(ci)!;
    return `c${ci} ${c.swatch ? 'swatch:' + c.swatch : labHex(c.L, c.a, c.b)}${c.name ? ' "' + c.name + '"' : ''} ${m.slice(0, 5).map((i) => 'r' + i).join(' ')}${m.length > 5 ? ` +${m.length - 5}` : ''}`;
  }).join(' · '));
  // hints
  const hints: string[] = [], minDe = s.params.minDe;
  // many tiny regions (small text, texture): one edit drops them, the shapes below fill their place
  const tiny = drawnRegs.filter((r) => r.area < total * 5e-4);
  if (s.photo && usedColours.length > 6) hints.push(`photo with ${usedColours.length} inks: if the artwork is fewer flat inks rendered with a material (foil, emboss, print on texture), analyze again with colors = that number`);
  if (tiny.length > 60) hints.push(`${tiny.length} regions under 0.05 % (small text or texture): "drop < 0.05", or "text x y w h" over text`);
  for (const g of s.rampGroups) {
    const live = g.ids.filter((i) => s.seg.regions[i].area > 0);
    if (g.merged) { if (live.length && !s.meta[live[0]].ramp) hints.push(`r${live[0]}: lighting flattened (ΔL ${g.dL}; "ramp r${live[0]}" keeps it as a gradient)`); }
    // every band, as ranges (F22: the first 6 of 12 bands were listed, the rest stayed flat stripes in the gradient)
    else if (live.length > 1) hints.push(`ramp ${idRanges(live)} (ΔL ${g.dL}: one gradient? or merge = flat)`);
  }
  hints.splice(4);
  findOverlaps(s).filter((o) => !s.meta[o.a].multiply && !s.meta[o.x].drop).slice(0, 3).forEach((o) => hints.push(`r${o.x} ≈ r${o.a} × r${o.b} over r${o.s} (ΔE ${o.de}: layers r${o.a} r${o.b})`));
  const pairs: [number, number, number][] = [];
  for (const r of regs) for (const n of r.nbrs.keys()) {
    const q = s.seg.regions[n];
    if (n > r.id && q.area > 0) { const d = de76(r.L, r.a, r.b, q.L, q.a, q.b); if (d < minDe * 1.5) pairs.push([d, r.id, n]); }
  }
  pairs.sort((a, b) => a[0] - b[0]).slice(0, 4).forEach(([d, a, b]) => hints.push(`merge r${a} r${b} (ΔE ${d.toFixed(1)})`));
  nearPairs(s.quant, minDe * 1.5).filter((p) => usedColours.includes(p.a) && usedColours.includes(p.b)).slice(0, 3).forEach((p) => hints.push(`c${p.b} = c${p.a}? (ΔE ${p.de.toFixed(1)})`));
  regs.filter((r) => r.area > 20 && (2 * r.area) / r.perim < 2.5).slice(0, 3).forEach((r) => hints.push(`r${r.id} sliver ${((2 * r.area) / r.perim).toFixed(1)} px`));
  regs.filter((r) => !['drop', 'text', 'box'].includes(kindOf(s, r.id)) && r.area > total * 0.002 && conf(s, r.id) < 0.8).slice(0, 3).forEach((r) => hints.push(`r${r.id} conf ${conf(s, r.id).toFixed(2)} (merge? tolerance r${r.id} ${(s.tol / 2).toFixed(1)}?)`));
  if (hints.length) lines.push('hints: ' + hints.slice(0, 10).join(' · ') + (hints.length > 10 ? ` (+${hints.length - 10})` : ''));
  return lines.join('\n');
}
