// Read tools: find_items, get_items, get_tree, selection. All run inside Illustrator as one step each.
import { z } from 'zod';
import type { ToolDef } from './types.js';

import { one, refSchema, rect } from './common.js';
export { refSchema };
const FIELDS = ['uuid', 'type', 'name', 'box', 'layer', 'parent', 'text', 'font', 'size', 'fill', 'stroke', 'sw', 'opacity', 'hidden', 'locked', 'selected', 'artboard'] as const;
const TYPES = ['path', 'text', 'group', 'compound', 'raster', 'placed', 'symbol', 'plugin', 'mesh', 'graph'] as const;

export const find_items: ToolDef = {
  name: 'find_items',
  description: `Find items in the active document (all depths) in one pass. All filters are optional and combine (AND):
type ("path"|"text"|"group"|"compound"|"raster"|"placed"|"symbol"|"plugin"|"mesh"|"graph" or an array), name (glob: * and ?), text (substring of text contents, case-insensitive), font (substring of the PostScript or "Family Style" name), size (font size, or [min,max]), fill / stroke (colour, same syntax as everywhere: "cmyk(…)", "swatch:Name", "none"…), layer (name, includes sublayers), in (ref of a layer or group), artboard (index: touching it), within ([x,y,w,h]: touching it), top_level (direct children of layers only), hidden / locked / selected (booleans), guides (true = only guides, false = no guides).
Returns {total, by_type, items:[…fields], more?}. fields default ["uuid","type","name","box"]; also: layer, parent, text, font, size, fill, stroke, sw, opacity, hidden, locked, selected, artboard. limit default 50, offset for paging, count_only for just the counts.`,
  shape: {
    type: z.union([z.enum(TYPES), z.array(z.enum(TYPES))]).optional(),
    name: z.string().optional(), text: z.string().optional(), font: z.string().optional(),
    size: z.union([z.number(), z.array(z.number()).length(2)]).optional(),
    fill: z.string().optional(), stroke: z.string().optional(),
    layer: z.string().optional(), in: one.optional(), artboard: z.number().min(0).optional(), within: rect.optional(),
    top_level: z.boolean().optional(), guides: z.boolean().optional(), hidden: z.boolean().optional(), locked: z.boolean().optional(), selected: z.boolean().optional(),
    fields: z.array(z.enum(FIELDS)).optional(),
    limit: z.number().min(0).max(1000).optional(), offset: z.number().min(0).optional(), count_only: z.boolean().optional(),
  },
  step: (a) => ({ cmd: 'find_items', args: a }),
};

export const get_items: ToolDef = {
  name: 'get_items',
  description: 'Full detail of items by refs: box (visible) and geo (geometric) [x,y,w,h], layer, parent, opacity, blend, hidden/locked; paths: closed, points count, area, fill, stroke, sw, dash, cap, join, clipping (+ "path": points with in/out handles if points:true); text: kind (point/area/path), contents, anchor (baseline start of point text), lines, align, paragraph_style, runs [{text, font, size, fill, leading, tracking}] (runs:false to skip); groups: items, clipped; placed: file (missing_link); symbols: symbol. limit default 100.',
  shape: {
    refs: refSchema,
    points: z.boolean().optional(), runs: z.boolean().optional(),
    limit: z.number().min(1).max(1000).optional(),
  },
  step: (a) => ({ cmd: 'get_items', args: a }),
};

export const get_tree: ToolDef = {
  name: 'get_tree',
  description: 'Outline of the active document: layers → sublayers → groups → items, as {tree:[{layer, count, sublayers?, children:[{type, uuid, name, text?, count?, children?}]}], note?}. root: "layer:Name" or a group ref (default all layers). depth default 2; limit = children shown per container (default 50, then {more:N}); max_nodes = items in the whole answer (default 300). boxes:true adds [x,y,w,h]. Within a layer, sublayers are listed apart from items.',
  shape: {
    root: one.optional(),
    depth: z.number().min(0).max(20).optional(),
    limit: z.number().min(1).max(1000).optional(),
    max_nodes: z.number().min(1).max(5000).optional(),
    boxes: z.boolean().optional(),
  },
  step: (a) => ({ cmd: 'get_tree', args: a }),
};

export const selection: ToolDef = {
  name: 'selection',
  description: 'Read or change the selection in the active document. action: "get" (default) | "set" (refs) | "add" (refs) | "remove" (refs) | "clear" | "all" (top-level items; or only those on layer / artboard). Locked and hidden items are skipped (with a warning). Returns {count, items:[…fields]} (fields as in find_items, default uuid/type/name/box; limit default 50).',
  shape: {
    action: z.enum(['get', 'set', 'add', 'remove', 'clear', 'all']).optional(),
    refs: refSchema.optional(),
    layer: z.string().optional(), artboard: z.number().min(0).optional(),
    fields: z.array(z.enum(FIELDS)).optional(),
    limit: z.number().min(0).max(1000).optional(),
  },
  step: (a) => ({ cmd: 'selection', args: a }),
};
