import { z } from 'zod';
import type { ToolDef } from './types.js';
import { one, refSchema, placeShape, blendSchema, itemsSchema } from './common.js';

const ALIGN = ['left', 'center', 'right', 'justify', 'justify_all'] as const;
/** Character attributes (pt for sizes). */
export const charShape = {
  font: z.string().optional().describe('fuzzy: "Arial Bold" or a PostScript name'),
  size: z.number().positive().optional().describe('pt'),
  fill: z.string().optional().describe('text colour'),
  color: z.string().optional().describe('same as fill'),
  stroke: z.string().optional(), stroke_width: z.number().min(0).optional(),
  leading: z.union([z.number().positive(), z.literal('auto')]).optional().describe('pt or "auto"'),
  tracking: z.number().optional().describe('1/1000 em'),
  baseline_shift: z.number().optional(),
  underline: z.boolean().optional(), strikethrough: z.boolean().optional(),
  caps: z.enum(['normal', 'all', 'small', 'all_small']).optional(),
  horizontal_scale: z.number().positive().optional().describe('%'),
  character_style: z.string().optional().describe('applied first, then the props above'),
};
/** Paragraph attributes. */
export const paraShape = {
  align: z.enum(ALIGN).optional(),
  paragraph_style: z.string().optional().describe('applied first (clears overrides), then the props'),
  space_before: z.number().optional(), space_after: z.number().optional(),
  first_indent: z.number().optional(), left_indent: z.number().optional(), right_indent: z.number().optional(),
  hyphenation: z.boolean().optional(),
};
const textProps = {
  text: z.string().optional().describe('"\\n" starts a new paragraph'),
  kind: z.enum(['point', 'area', 'path']).optional(),
  x: z.number().optional(), y: z.number().optional(),
  y_ref: z.enum(['baseline', 'top']).optional(),
  w: z.number().optional(), h: z.number().optional(),
  on_path: one.optional(),
  keep_path: z.boolean().optional(),
  ...charShape, ...paraShape,
  opacity: z.number().min(0).max(100).optional(), blend: blendSchema.optional(),
  name: z.string().optional(), note: z.string().optional(), hidden: z.boolean().optional(), locked: z.boolean().optional(),
};

const gridShape = z.object({
  x: z.number(), y: z.number(), cols: z.number().min(1), dx: z.number(), dy: z.number(),
  cells: z.array(z.any()).describe('row by row: text, null/"" (empty) or {text, ...props}'),
  col_props: z.record(z.string(), z.record(z.string(), z.any())).optional().describe('per column index: {"5": {fill}}'),
});

/** Expand a grid into create_text items: cell i sits at column i % cols, row floor(i / cols). */
export function expandGrid(g: z.infer<typeof gridShape>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  g.cells.forEach((cell: unknown, i: number) => {
    if (cell === null || cell === undefined || cell === '') return;
    const col = i % g.cols, row = Math.floor(i / g.cols);
    const own = typeof cell === 'object' ? (cell as Record<string, unknown>) : { text: String(cell) };
    if (own.text === undefined || own.text === null || own.text === '') return;
    out.push({ ...(g.col_props?.[String(col)] ?? {}), x: g.x + col * g.dx, y: g.y + row * g.dy, ...own, text: String(own.text) });
  });
  return out;
}

export const create_text: ToolDef = {
  name: 'create_text',
  description: `Create text frames. Atomic: if styling fails the frame is removed.
point (x, y; y = first BASELINE unless y_ref:"top"; align left|center|right anchors at x) · area (x, y, w, h; reports overset) · path (on_path = a path ref; keep_path copies it). kind defaults from the props given.
Character: font (fuzzy), size, fill/color, stroke, leading, tracking, baseline_shift, underline, strikethrough, caps, horizontal_scale, character_style. Paragraph: align, paragraph_style, space_before/after, indents, hyphenation (sizes in pt).
Placement: layer or parent. Many at once: items:[{text, x, y, …}] with shared props at the top level, or grid {x, y, cols, dx, dy, cells, col_props} for tables and calendars (x, y = first cell; align applies per cell).
Returns {count, items:[{uuid, name, type, box}], overset?}.`,
  shape: { ...textProps, ...placeShape, items: itemsSchema(5000), grid: gridShape.optional() },
  step: (a) => {
    if (!a.grid) return { cmd: 'create_text', args: a };
    const { grid, ...rest } = a;
    return { cmd: 'create_text', args: { ...rest, items: [...(a.items ?? []), ...expandGrid(grid)] } };
  },
};

// ranges: loose objects (they take every create_text prop): repeating the schema doubled this tool's size
const rangeShape = z.record(z.string(), z.any());

export const edit_text: ToolDef = {
  name: 'edit_text',
  description: `Change text frames (refs: text frames or groups containing them). In order:
contents (replace all text) → replace {find, with, all (default true), ignore_case} (without refs: in EVERY text frame of the document; keeps the styling of the replaced text) → paragraph props / character props for the whole frame → ranges:[{start, end | match, nth, …props}] to style parts.
Props as in create_text. Returns {count, items, edits, overset?}.`,
  shape: {
    refs: refSchema.optional(),
    contents: z.string().optional(),
    replace: z.object({ find: z.string().min(1), with: z.string().optional(), all: z.boolean().optional(), ignore_case: z.boolean().optional() }).optional(),
    ranges: z.array(rangeShape).optional().describe('[{start, end (exclusive; negative = from the end) | match, nth (0-based), ignore_case, ...character/paragraph props}]'),
    ...charShape, ...paraShape,
  },
  step: (a) => ({ cmd: 'edit_text', args: a }),
};
