// scene: the 1-page summary an agent reads instead of the pixels (one JSON line, a region table, inks, hints).
import { de76, labHex } from './color.js';
import { nearPairs } from './quantize.js';
import type { Scene } from './types.js';

export interface SummaryOpts { show?: number[]; showColour?: number; limit?: number; file?: string }

const pct = (v: number) => (v >= 1 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v.toFixed(3));
const pad = (s: string, n: number) => (s.length >= n ? s + ' ' : s + ' '.repeat(n - s.length));

export const alive = (s: Scene) => s.seg.regions.filter((r) => r.area > 0);

export function kindOf(s: Scene, id: number): string {
  const m = s.meta[id];
  const p = s.prims[id], shape = p ? (p.kind === 'polygon' ? `poly${p.n}` : p.kind) : '';
  return m.drop ? 'drop' : m.text ? 'text' : m.ramp ? (shape ? shape + '+ramp' : 'ramp') : shape || 'flat';
}

export function conf(s: Scene, id: number): number {
  return Math.min(s.seg.regions[id].homog, s.iou[id] ?? 0);
}

export function summary(s: Scene, o: SummaryOpts = {}): string {
  const { w, h } = s.work, total = w * h, regs = alive(s).sort((a, b) => b.area - a.area);
  const usedColours = [...new Set(regs.map((r) => s.meta[r.id].colour))].sort((a, b) => a - b);
  const anchors = s.fits.reduce((a, f) => a + f.length, 0);
  const head = { id: s.id, file: o.file, px: [w, h], ...(s.photo ? { photo: true } : {}), regions: regs.length, colours: usedColours.length, edges: s.pm.edges.length, anchors, est_rmse: s.estRmse, ms: s.ms };
  const lines = [JSON.stringify(head)];
  const limit = o.limit ?? 40;
  let rows = regs.slice(0, limit);
  if (o.show?.length) rows = o.show.map((id) => s.seg.regions[id]).filter((r) => r && r.area > 0);
  if (o.showColour !== undefined) rows = regs.filter((r) => s.meta[r.id].colour === o.showColour);
  lines.push('id    colour   area%   kind    z    next              conf c    name');
  for (const r of rows) {
    const c = s.colours[s.meta[r.id].colour];
    const next = [...r.nbrs.entries()].filter(([n]) => s.seg.regions[n].area > 0).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n]) => 'r' + n).join(' ');
    lines.push(pad('r' + r.id, 6) + pad(labHex(c.L, c.a, c.b), 9) + pad(pct((r.area / total) * 100), 8) + pad(kindOf(s, r.id), 8) + pad(String(s.z[r.id]), 5) + pad(next || '-', 18) + pad(conf(s, r.id).toFixed(2).replace(/^0/, ''), 5) + pad('c' + s.meta[r.id].colour, 5) + (s.meta[r.id].name ?? ''));
  }
  if (!o.show && o.showColour === undefined && regs.length > limit) {
    const rest = regs.slice(limit), max = (rest[0].area / total) * 100;
    lines.push(`+${rest.length} regions ≤ ${pct(max)} % (show r${rest[0].id}… or show r<a>-r<b>)`);
  }
  // inks
  const members = new Map<number, number[]>();
  for (const r of regs) { const c = s.meta[r.id].colour; if (!members.has(c)) members.set(c, []); members.get(c)!.push(r.id); }
  lines.push('colours: ' + usedColours.map((ci) => {
    const c = s.colours[ci], m = members.get(ci)!;
    return `c${ci} ${c.swatch ? 'swatch:' + c.swatch : labHex(c.L, c.a, c.b)}${c.name ? ' "' + c.name + '"' : ''} ${m.slice(0, 5).map((i) => 'r' + i).join(' ')}${m.length > 5 ? ` +${m.length - 5}` : ''}`;
  }).join(' · '));
  // hints
  const hints: string[] = [], minDe = s.params.minDe;
  for (const g of s.rampGroups) {
    const live = g.ids.filter((i) => s.seg.regions[i].area > 0);
    if (g.merged) { if (live.length && !s.meta[live[0]].ramp) hints.push(`r${live[0]}: lighting flattened (ΔL ${g.dL}; "ramp r${live[0]}" keeps it as a gradient)`); }
    else if (live.length > 1) hints.push(`ramp ${live.slice(0, 6).map((i) => 'r' + i).join(' ')} (ΔL ${g.dL}: one gradient? or merge = flat)`);
  }
  hints.splice(4);
  const pairs: [number, number, number][] = [];
  for (const r of regs) for (const n of r.nbrs.keys()) {
    const q = s.seg.regions[n];
    if (n > r.id && q.area > 0) { const d = de76(r.L, r.a, r.b, q.L, q.a, q.b); if (d < minDe * 1.5) pairs.push([d, r.id, n]); }
  }
  pairs.sort((a, b) => a[0] - b[0]).slice(0, 4).forEach(([d, a, b]) => hints.push(`merge r${a} r${b} (ΔE ${d.toFixed(1)})`));
  nearPairs(s.quant, minDe * 1.5).filter((p) => usedColours.includes(p.a) && usedColours.includes(p.b)).slice(0, 3).forEach((p) => hints.push(`c${p.b} = c${p.a}? (ΔE ${p.de.toFixed(1)})`));
  regs.filter((r) => r.area > 20 && (2 * r.area) / r.perim < 2.5).slice(0, 3).forEach((r) => hints.push(`r${r.id} sliver ${((2 * r.area) / r.perim).toFixed(1)} px`));
  regs.filter((r) => !['drop', 'text'].includes(kindOf(s, r.id)) && r.area > total * 0.002 && conf(s, r.id) < 0.8).slice(0, 3).forEach((r) => hints.push(`r${r.id} conf ${conf(s, r.id).toFixed(2)} (merge? tolerance r${r.id} ${(s.tol / 2).toFixed(1)}?)`));
  if (hints.length) lines.push('hints: ' + hints.join(' · '));
  return lines.join('\n');
}
