// scene edit: a small command language (strings keep the tool schema small). Region ids (rN) and ink ids (cN) never
// change; a merged or emptied region just disappears from the summary.
import { rgbLab } from './color.js';
import { recompute } from './analyze.js';
import type { Scene, Colour } from './types.js';

export interface EditResult { changed: boolean; show?: number[]; showColour?: number }

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

/** apply edits in order; geometry is recomputed once at the end when anything changed */
export function applyEdits(s: Scene, edits: string[]): EditResult {
  const res: EditResult = { changed: false };
  const R = s.seg.regions;
  edits.forEach((raw, i) => {
    const fail = (why: string): never => { throw new Error(`edit ${i + 1} "${raw}": ${why}`); };
    const t = raw.trim().split(/\s+/);
    const region = (x: string | undefined) => {
      const m = x?.match(reg);
      if (!m) fail(`expected a region id like r3, got "${x ?? ''}"`);
      const id = +m![1];
      if (!R[id] || !R[id].area) fail(`r${id} does not exist (or was merged away)`);
      return id;
    };
    const inkId = (x: string) => { const id = +x.match(ink)![1]; if (!s.colours[id]) fail(`c${id} does not exist`); return id; };
    const head = t[0]?.toLowerCase();
    if (head === 'merge') {
      if (t.length < 3) fail('needs two or more regions');
      const ids = t.slice(1).map(region), to = ids[0];
      const from = new Set(ids.slice(1));
      for (let p = 0; p < s.seg.map.length; p++) if (from.has(s.seg.map[p])) s.seg.map[p] = to;
      for (const f of from) { R[f].area = 0; s.meta[f] = { colour: s.meta[f].colour }; }
      s.zMoves = s.zMoves.filter((m) => !from.has(m.id) && !(m.ref !== undefined && from.has(m.ref)));
      res.changed = true;
    } else if (head === 'ramp') {
      // ramp rA [rB …]: one region (merged) with a linear gradient from its pixels
      if (t.length < 2) fail('needs a region');
      const ids = t.slice(1).map(region), to = ids[0], from = new Set(ids.slice(1));
      if (from.size) {
        for (let p = 0; p < s.seg.map.length; p++) if (from.has(s.seg.map[p])) s.seg.map[p] = to;
        for (const f of from) { R[f].area = 0; s.meta[f] = { colour: s.meta[f].colour }; }
      }
      s.meta[to].ramp = true;
      res.changed = true;
    } else if (reg.test(t[0]) && t[1] === 'flat') {
      s.meta[region(t[0])].ramp = false; res.changed = true;
    } else if (head === 'drop' || head === 'keep') {
      if (t.length < 2) fail('needs a region');
      for (const id of t.slice(1).map(region)) { s.meta[id].drop = head === 'drop'; if (head === 'keep') s.meta[id].text = false; }
      res.changed = true;
    } else if (head === 'name') {
      const what = t[1] ?? '', text = t.slice(2).join(' ');
      if (!text) fail('needs a name');
      if (ink.test(what)) s.colours[inkId(what)].name = text; else s.meta[region(what)].name = text;
    } else if (head === 'tolerance') {
      if (t.length === 2) { const v = +t[1]; if (!(v > 0)) fail('tolerance must be > 0 (px)'); s.tol = v; }
      else { const id = region(t[1]), v = +t[2]; if (!(v > 0)) fail('tolerance must be > 0 (px)'); s.meta[id].tol = v; }
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
      const id = inkId(t[0]), spec = t.slice(2).join('');
      if (!spec) fail('needs a colour');
      s.colours[id] = { ...colourOf(spec, s.colours[id]), name: s.colours[id].name };
      res.changed = true;
    } else if (reg.test(t[0]) && t[1] === '=') {
      const id = region(t[0]), spec = t.slice(2).join('');
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
      s.meta[region(t[0])].text = true; res.changed = true;
    } else fail('unknown edit (merge, ramp, rN flat, drop, keep, rN = colour, cN = colour, name, rN over|under rM, rN top|bottom, rN ellipse|circle|rect|rounded|polygon|free|auto, tolerance, show, stack on|off, rN text)');
  });
  s.edits.push(...edits);
  if (res.changed) recompute(s);
  return res;
}
