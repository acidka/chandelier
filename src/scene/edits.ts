// scene edit: a small command language (strings keep the tool schema small). Region ids (rN) and ink ids (cN) never
// change; a merged or emptied region just disappears from the summary.
import { rgbLab } from './color.js';
import { recompute } from './analyze.js';
import { regionStats } from './regions.js';
import { findOverlaps, multiplyFill } from './overlap.js';
import type { Scene, Colour } from './types.js';

export interface EditResult { changed: boolean; show?: number[]; showColour?: number; dropped?: number }

const reg = /^r(\d+)$/, ink = /^c(\d+)$/;

/** colour spec → a Colour (swatch: keeps the current look for our own render) */
function colourOf(spec: string, look: Colour): Colour {
  let m: RegExpMatchArray | null;
  if ((m = spec.match(/^swatch:(.+)$/))) return { ...look, swatch: m[1].trim(), name: undefined };
  if ((m = spec.match(/^#?([0-9a-f]{6})$/i))) { const n = parseInt(m[1], 16), [L, a, b] = rgbLab(n >> 16, (n >> 8) & 255, n & 255); return { L, a, b }; }
  if ((m = spec.match(/^#([0-9a-f]{3})$/i))) { const [L, a, b] = rgbLab(...([0, 1, 2].map((k) => parseInt(m![1][k] + m![1][k], 16)) as [number, number, number])); return { L, a, b }; }
  if ((m = spec.match(/^lab\(\s*([\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/i))) return { L: +m[1], a: +m[2], b: +m[3] };
  throw new Error(`colour "${spec}": use swatch:Name, #rrggbb, lab(L,a,b) or cN`);
}

/** apply edits in order; geometry is recomputed once at the end when anything changed. `undo [n]` and `reset` go back
 * to the analyzed state and replay the earlier edits. */
export function applyEdits(s: Scene, edits: string[]): EditResult {
  // undo / reset first: they rewrite the history, the rest of this call then applies on top
  let list = edits;
  const back = list.findIndex((e) => /^\s*(undo|reset)\b/i.test(e));
  if (back >= 0) {
    const m = list[back].trim().match(/^(undo|reset)(?:\s+(\d+))?$/i);
    if (!m) throw new Error(`edit ${back + 1} "${list[back]}": undo [n] | reset`);
    const keep = m[1].toLowerCase() === 'reset' ? [] : s.edits.slice(0, Math.max(0, s.edits.length - (m[2] ? +m[2] : 1)));
    restore(s);
    if (keep.length) applyEdits(s, keep.filter((e) => !/^\s*show\b/i.test(e)));
    const after = applyEdits(s, [...list.slice(0, back), ...list.slice(back + 1)].filter((e) => !/^\s*(undo|reset)\b/i.test(e)));
    recompute(s);
    return { ...after, changed: true };
  }
  const res: EditResult = { changed: false };
  const R = s.seg.regions;
  list.forEach((raw, i) => {
    const fail = (why: string): never => { throw new Error(`edit ${i + 1} "${raw}": ${why}`); };
    const t = raw.trim().split(/\s+/);
    const region = (x: string | undefined) => {
      const m = x?.match(reg);
      if (!m) fail(`expected a region id like r3, got "${x ?? ''}"`);
      const id = +m![1];
      if (!R[id] || !R[id].area) fail(`r${id} does not exist (or was merged away)`);
      return id;
    };
    /** region ids: rN and ranges rA-rB (gone ids inside a range are skipped) */
    const regions = (xs: string[]) => xs.flatMap((x) => {
      const m = x.match(/^r(\d+)-r?(\d+)$/);
      if (!m) return [region(x)];
      const out: number[] = [];
      for (let k = +m[1]; k <= +m[2]; k++) if (R[k]?.area) out.push(k);
      return out;
    });
    const after = (sep: string) => raw.slice(raw.indexOf(sep) + sep.length).trim(); // the rest of the line, spaces kept
    const inkId = (x: string) => { const id = +x.match(ink)![1]; if (!s.colours[id]) fail(`c${id} does not exist`); return id; };
    const head = t[0]?.toLowerCase();
    if (head === 'merge') {
      if (t.length < 3) fail('needs two or more regions');
      const ids = regions(t.slice(1)), to = ids[0];
      const from = new Set(ids.slice(1));
      for (let p = 0; p < s.seg.map.length; p++) if (from.has(s.seg.map[p])) s.seg.map[p] = to;
      for (const f of from) { R[f].area = 0; s.meta[f] = { colour: s.meta[f].colour }; }
      s.zMoves = s.zMoves.filter((m) => !from.has(m.id) && !(m.ref !== undefined && from.has(m.ref)));
      res.changed = true;
    } else if (head === 'ramp') {
      // ramp rA [rB …]: one region (merged) with a linear gradient from its pixels
      if (t.length < 2) fail('needs a region');
      const ids = regions(t.slice(1)), to = ids[0], from = new Set(ids.slice(1));
      if (from.size) {
        for (let p = 0; p < s.seg.map.length; p++) if (from.has(s.seg.map[p])) s.seg.map[p] = to;
        for (const f of from) { R[f].area = 0; s.meta[f] = { colour: s.meta[f].colour }; }
      }
      s.meta[to].ramp = true;
      res.changed = true;
    } else if (head === 'layers') {
      // layers rA rB: two translucent layers; their overlap regions are drawn by both in multiply
      if (t.length !== 3) fail('layers rA rB (two regions whose overlap is a third)');
      const a = region(t[1]), b = region(t[2]);
      const xs = findOverlaps(s, 2.5 * s.params.minDe).filter((o) => (o.a === a && o.b === b) || (o.a === b && o.b === a));
      if (!xs.length) fail(`no region between r${a} and r${b} looks like their overlap (multiply over the paper)`);
      const sub = R[xs[0].s], over = [...new Set(xs.map((o) => o.x))];
      for (const id of [a, b]) {
        const f = multiplyFill([R[id].L, R[id].a, R[id].b], [sub.L, sub.a, sub.b]);
        s.colours.push({ L: f[0], a: f[1], b: f[2], name: s.colours[s.meta[id].colour].name });
        s.meta[id].colour = s.colours.length - 1;
        s.meta[id].multiply = over;
        if (s.z[id] < Math.max(...over.map((x) => s.z[x]))) s.zMoves.push({ id, how: 'over', ref: over.reduce((p, x) => (s.z[x] > s.z[p] ? x : p)) });
      }
      for (const x of over) s.meta[x].drop = true;
      res.changed = true;
    } else if (reg.test(t[0]) && t[1] === 'flat') {
      s.meta[region(t[0])].ramp = false; res.changed = true;
    } else if (head === 'drop' || head === 'keep') {
      // drop rA rB-rC [fill rF] · drop < 0.05 (every region under that % of the image, but the bottom one)
      if (t.length < 2) fail('needs regions (r3, r10-r40) or "< area%"');
      let ids: number[], fillId: number | undefined;
      if (t[1] === '<' || t[1].startsWith('<')) {
        const pct = parseFloat(t[1] === '<' ? t[2] : t[1].slice(1));
        if (!(pct > 0)) fail('drop < area% (e.g. drop < 0.05)');
        const total = s.work.w * s.work.h;
        ids = R.filter((r) => r.area && s.z[r.id] > 0 && (r.area / total) * 100 < pct && !s.meta[r.id].drop).map((r) => r.id);
      } else {
        const f = t.indexOf('fill');
        if (f >= 0) { if (f !== t.length - 2) fail('drop rA … fill rF'); fillId = region(t[f + 1]); }
        ids = regions(t.slice(1, f >= 0 ? f : undefined));
      }
      for (const id of ids) {
        s.meta[id].drop = head === 'drop';
        if (head === 'keep') { s.meta[id].text = false; delete s.meta[id].fill; }
        else if (fillId !== undefined) s.meta[id].fill = fillId;
      }
      res.dropped = (res.dropped ?? 0) + ids.length;
      res.changed = true;
    } else if (head === 'name') {
      const what = t[1] ?? '', text = t.slice(2).join(' ');
      if (!text) fail('needs a name');
      if (ink.test(what)) s.colours[inkId(what)].name = text; else s.meta[region(what)].name = text;
    } else if (head === 'tolerance') {
      // a tolerance you set wins over the ones refine tightened
      if (t.length === 2) { const v = +t[1]; if (!(v > 0)) fail('tolerance must be > 0 (px)'); s.tol = v; s.edgeTol = {}; }
      else {
        const id = region(t[1]), v = +t[2];
        if (!(v > 0)) fail('tolerance must be > 0 (px)');
        s.meta[id].tol = v;
        for (const k of Object.keys(s.edgeTol ?? {})) if (k.split(',').map(Number).includes(id)) delete s.edgeTol![k];
      }
      res.changed = true;
    } else if (head === 'show') {
      const rest = t.slice(1);
      if (rest.length === 1 && ink.test(rest[0])) { res.showColour = inkId(rest[0]); return; }
      const ids: number[] = [];
      for (const x of rest) {
        const m = x.match(/^r(\d+)-r?(\d+)$/);
        if (m) { for (let k = +m[1]; k <= +m[2]; k++) if (R[k]?.area) ids.push(k); } else ids.push(region(x));
      }
      res.show = ids;
    } else if (head === 'stack') {
      if (t[1] !== 'on' && t[1] !== 'off') fail('stack on | stack off');
      s.tile = t[1] === 'off'; res.changed = true;
    } else if (ink.test(t[0]) && t[1] === '=') {
      const id = inkId(t[0]), spec = after('=');
      if (!spec) fail('needs a colour');
      if (ink.test(spec)) {
        // two inks are one: every region of cN takes cM (cN is no longer drawn)
        const to = inkId(spec);
        if (to !== id) for (const m of s.meta) if (m.colour === id) m.colour = to;
      } else s.colours[id] = { ...colourOf(spec, s.colours[id]), name: s.colours[id].name };
      res.changed = true;
    } else if (reg.test(t[0]) && t[1] === '=') {
      const id = region(t[0]), spec = after('=');
      if (!spec) fail('needs a colour');
      if (ink.test(spec)) s.meta[id].colour = inkId(spec);
      else { s.colours.push(colourOf(spec, s.colours[s.meta[id].colour])); s.meta[id].colour = s.colours.length - 1; }
      res.changed = true;
    } else if (reg.test(t[0]) && ['over', 'under', 'top', 'bottom'].includes(t[1])) {
      const id = region(t[0]), how = t[1] as 'over' | 'under' | 'top' | 'bottom';
      const ref = how === 'over' || how === 'under' ? region(t[2]) : undefined;
      if (ref === id) fail('a region can\'t move relative to itself');
      s.zMoves.push({ id, how, ref });
      res.changed = true;
    } else if (reg.test(t[0]) && ['ellipse', 'circle', 'rect', 'rounded', 'polygon', 'free', 'auto'].includes(t[1])) {
      const id = region(t[0]);
      s.meta[id].prim = t[1] === 'auto' ? undefined : (t[1] as 'ellipse');
      res.changed = true;
    } else if (reg.test(t[0]) && t[1] === 'text') {
      const id = region(t[0]), b = R[id].bbox;
      s.meta[id].text = true;
      s.textBoxes.push({ rect: [b[0], b[1], b[2] - b[0] + 1, b[3] - b[1] + 1], ids: [id] });
      res.changed = true;
    } else if (head === 'text') {
      // text x y w h (working px): every region inside the box is left for live text
      const v = t.slice(1).map(Number);
      if (v.length !== 4 || v.some((x) => !isFinite(x)) || v[2] <= 0 || v[3] <= 0) fail('text x y w h (image px of the analyzed image)');
      const ids = R.filter((r) => r.area && !s.meta[r.id].text && r.bbox[0] >= v[0] && r.bbox[1] >= v[1] && r.bbox[2] < v[0] + v[2] && r.bbox[3] < v[1] + v[3] && s.z[r.id] > 0).map((r) => r.id);
      if (!ids.length) fail('no region lies inside that box');
      for (const id of ids) s.meta[id].text = true;
      s.textBoxes.push({ rect: v, ids });
      res.changed = true;
    } else if (reg.test(t[0]) && (t[1] === 'logo' || t[1] === 'placeholder')) {
      const id = region(t[0]);
      if (t[1] === 'placeholder') s.meta[id].placeholder = true;
      else {
        // the mark and everything drawn on it, fitted finer
        s.meta[id].logo = true;
        for (const r of R) if (r.area && s.z[r.id] >= s.z[id] && inside(r.bbox, R[id].bbox)) s.meta[r.id].tol = s.meta[r.id].tol ?? Math.max(0.3, s.tol / 2);
      }
      res.changed = true;
    } else fail('unknown edit (undo [n], reset, merge, ramp, rN flat, layers rA rB, rN logo, rN placeholder, text x y w h, drop, keep, rN = colour, cN = colour, name, rN over|under rM, rN top|bottom, rN ellipse|circle|rect|rounded|polygon|free|auto, tolerance, show, stack on|off, rN text)');
  });
  s.edits.push(...edits);
  if (res.changed) recompute(s);
  return res;
}

const inside = (a: number[], b: number[]) => a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3];

/** back to the analyzed state (labels, inks, meta, tolerance); edits are cleared */
function restore(s: Scene): void {
  const i = s.initial;
  if (!i) throw new Error('undo / reset: this scene has no saved analyze state (analyze again)');
  s.seg.map.set(i.map);
  s.seg.regions = regionStats(s.seg.map, s.work.w, s.work.h, s.seg.regions.length, s.lab, s.quant.labels);
  s.colours = JSON.parse(JSON.stringify(i.colours));
  s.meta = JSON.parse(JSON.stringify(i.meta));
  s.tol = i.tol;
  s.zMoves = []; s.tile = false; s.edgeTol = {}; s.textBoxes = []; s.edits = [];
}
