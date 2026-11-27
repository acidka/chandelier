// Field projection (configure {reply: "brief"} and per-call fields): replies keep only what the next step needs,
// because every result is re-read on each later agent request. Brief is the default; reply "full" without fields
// leaves data untouched.
import { ArgError } from './types.js';
import type { Settings } from '../settings.js';

/** get_items keys (A.detail in core.jsx); a named key brings its companion (path → path_truncated, …). */
export const ITEM_FIELDS = ['uuid', 'type', 'name', 'box', 'geo', 'layer', 'parent', 'opacity', 'blend', 'hidden', 'locked', 'selected', 'note',
  'closed', 'points', 'area', 'clipping', 'fill', 'stroke', 'sw', 'dash', 'cap', 'join', 'path',
  'kind', 'contents', 'anchor', 'lines', 'align', 'paragraph_style', 'runs',
  'paths', 'items', 'clipped', 'file', 'missing_link', 'embedded', 'symbol'] as const;
export const ITEM_BRIEF = ['uuid', 'type', 'name', 'box', 'geo'];
const COMPANION: Record<string, string> = { path: 'path_truncated', runs: 'runs_truncated', contents: 'length' };

/** document_info sections (each brings its keys) and the brief head */
export const DOC_SECTIONS: Record<string, string[]> = {
  artboards: ['activeArtboard', 'artboards'],
  layers: ['layers'],
  swatches: ['globalSwatches', 'spotColors', 'swatchCount'],
  styles: ['paragraphStyles', 'characterStyles'],
  fonts: ['fonts'],
  issues: ['issues'],
};
export const DOC_BRIEF = ['name', 'colorSpace', 'units', 'bleed', 'artboardCount', 'counts', 'issues'];

/** created / changed items (A.outList); reads and the agent's own scripts keep their lists */
export const LIST_MAX = 20;
const KEEP = new Set(['get_items', 'find_items', 'selection', 'get_tree', 'run_script']);

const pick = (o: Record<string, unknown>, keys: string[]) => {
  const r: Record<string, unknown> = {};
  for (const k of keys) if (o[k] !== undefined) r[k] = o[k];
  return r;
};

function check(fields: unknown, known: readonly string[], tool: string): string[] | undefined {
  if (fields === undefined) return undefined;
  const list = fields as string[];
  const bad = list.filter((f) => !known.includes(f));
  if (bad.length) throw new ArgError(`${tool}: unknown field "${bad[0]}". Fields: ${known.join(', ')}.`);
  return list;
}

/** get_items keys for this call: its fields, else the brief set (plus path / runs when points / runs is asked for). */
function itemFields(a: any, s: Settings): string[] | undefined {
  const f = check(a?.fields, ITEM_FIELDS, 'get_items');
  if (f || s.reply !== 'brief') return f;
  return [...ITEM_BRIEF, ...(a?.points ? ['path'] : []), ...(a?.runs === true ? ['runs'] : [])];
}

/** get_items runtime args: skip the text runs and anchor lists the projection would drop. */
export function getItemsArgs(a: any, s: Settings): Record<string, unknown> {
  const { fields: _fields, ...rest } = a;
  const f = itemFields(a, s);
  if (!f) return rest;
  return { ...rest, runs: f.includes('runs'), points: f.includes('path') };
}

/** Checked at step time, so a bad name fails before Illustrator runs anything. */
export function checkDocFields(a: any): void { check(a.fields, Object.keys(DOC_SECTIONS), 'document_info'); }

/** The reply of one tool (alone or as a batch step) for the session's reply mode and the call's fields. */
export function project(tool: string, data: any, args: any, s: Settings): any {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const fields: string[] | undefined = args?.fields;
  if (tool === 'get_items') {
    const f = itemFields(args, s);
    if (!f || !Array.isArray(data.items)) return data;
    const keys = [...f, ...f.map((k) => COMPANION[k]).filter(Boolean)];
    return { ...data, items: data.items.map((it: Record<string, unknown>) => pick(it, keys)) };
  }
  if (tool === 'document_info') {
    if (!fields && s.reply !== 'brief') return data;
    const out = pick({ ...data, artboardCount: Array.isArray(data.artboards) ? data.artboards.length : undefined }, DOC_BRIEF);
    for (const f of fields ?? []) Object.assign(out, pick(data, DOC_SECTIONS[f]));
    return out;
  }
  if (s.reply === 'brief' && !KEEP.has(tool) && typeof data.count === 'number' && Array.isArray(data.items) && data.items.every((i: any) => i && typeof i === 'object' && 'uuid' in i)) {
    const items = data.items.slice(0, LIST_MAX).map((i: Record<string, unknown>) => pick(i, ['uuid', 'box']));
    const { more: _more, ...rest } = data;
    return { ...rest, items, ...(data.count > items.length ? { more: `${data.count - items.length} more not listed` } : {}) };
  }
  return data;
}
