import { z } from 'zod';
import type { ToolDef } from './types.js';
import { refSchema, rect } from './common.js';

export const layers: ToolDef = {
  name: 'layers',
  description: `Layers of the active document. Names may be "Parent/Child" paths; a bare name is looked up at any depth; "@active" / "@first" name the active / top layer; "Layer 1" also finds the localised default layer.
action: "list" (tree with items, visible, locked, printable, color, sublayers) · "add" (name; parent for a sublayer; position; props) · "update" (name → new_name and props) · "remove" (name; refuses if it has items unless force:true) · "reorder" (name, position) · "activate" (name).
Props: visible, locked, printable (false = non-printing), template, dim_images, color (layer highlight, "#rrggbb"), opacity. position: "top" | "bottom" | "above:Name" | "below:Name".`,
  shape: {
    action: z.enum(['list', 'add', 'update', 'remove', 'reorder', 'activate']).optional(),
    name: z.string().optional(), new_name: z.string().optional(), parent: z.string().optional(),
    position: z.string().optional(),
    visible: z.boolean().optional(), locked: z.boolean().optional(), printable: z.boolean().optional(),
    template: z.boolean().optional(), dim_images: z.boolean().optional(),
    color: z.string().optional(), opacity: z.number().min(0).max(100).optional(),
    activate: z.boolean().optional().describe('add: make it the active layer (default true)'),
    force: z.boolean().optional(),
  },
  step: (a) => ({ cmd: 'layers', args: a }),
};

export const artboards: ToolDef = {
  name: 'artboards',
  description: `Artboards of the active document. Rects are [x, y, w, h] with y = TOP, in session units, measured from the top-left of ARTBOARD 0 (stable: the active artboard changes), the same for reading and writing.
action: "list" · "add" (rect; or w, h → placed right of the last artboard with spacing; name) · "update" (index; name; rect or x/y/w/h; move_art:true moves the art on it along) · "remove" (index; art stays) · "activate" (index) ·
"fit_to_art" (index; to the art on it, or to refs with pad) · "grid_layout" (columns, spacing: rearrange all artboards left→right, top→bottom; their art moves along unless move_art:false) ·
"crop_marks" (around artboard index, all:true, or refs; offset from the trim (default the document bleed, at least 3 mm), length (default 5 mm), weight pt (0.25); drawn in [Registration] into a group on layer "Crop Marks").
index defaults to the active artboard.`,
  shape: {
    action: z.enum(['list', 'add', 'update', 'remove', 'activate', 'fit_to_art', 'grid_layout', 'crop_marks']).optional(),
    all: z.boolean().optional(), offset: z.number().min(0).optional(), length: z.number().positive().optional(), weight: z.number().positive().optional(), layer: z.string().optional(),
    index: z.number().min(0).optional(),
    name: z.string().optional(),
    rect: rect.optional(),
    x: z.number().optional(), y: z.number().optional(), w: z.number().positive().optional(), h: z.number().positive().optional(),
    spacing: z.number().min(0).optional(), columns: z.number().min(1).optional(),
    move_art: z.boolean().optional(),
    refs: refSchema.optional(), pad: z.number().optional(),
  },
  step: (a) => ({ cmd: 'artboards', args: a }),
};
