import { z } from 'zod';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { ToolDef } from './types.js';
import { ArgError } from './types.js';
import { refSchema, placeShape } from './common.js';

let n = 0;
export const place: ToolDef = {
  name: 'place',
  description: `Bring a file or SVG markup into the active document.
path: .png/.jpg/.tif/.psd/… (linked; embed:true embeds) · .pdf/.ai/.eps (linked; page for PDFs; editable:true imports the artwork as editable paths) · .svg (editable by default).
svg: SVG markup string instead of a file → editable artwork.
Position: x, y (top-left; default: centred on the artboard), w and/or h (fit, keep_ratio default true). layer / parent, name.
Returns {uuid, name, type, box, how: "linked" | "embedded" | "editable"}.`,
  shape: {
    path: z.string().optional(), svg: z.string().optional(),
    embed: z.boolean().optional(), editable: z.boolean().optional(),
    page: z.number().min(1).optional(),
    x: z.number().optional(), y: z.number().optional(), w: z.number().positive().optional(), h: z.number().positive().optional(),
    keep_ratio: z.boolean().optional(),
    name: z.string().optional(),
    ...placeShape,
  },
  step(a, { tmp }) {
    const args: Record<string, unknown> = { ...a };
    if (a.svg !== undefined) {
      if (!/<svg[\s>]/i.test(a.svg)) throw new ArgError('svg must be SVG markup (<svg …>…</svg>).');
      const p = join(tmp, `place${++n}.svg`);
      writeFileSync(p, a.svg);
      args.path = p; args.editable = true; delete args.svg;
    } else if (a.path) {
      args.path = resolve(a.path);
      if (!existsSync(args.path as string)) throw new ArgError('File not found: ' + args.path);
    } else throw new ArgError('Give path or svg.');
    return { cmd: 'place', args };
  },
};

export const menu_command: ToolDef = {
  name: 'menu_command',
  description: 'Escape hatch: run an Illustrator menu command by its internal name (app.executeMenuCommand), e.g. "group", "expandStyle", "Live Pathfinder Add", "OffsetPath v22" (outline stroke), "selectall", "deselectall". refs are selected first. Returns the selection afterwards. WARNING: commands that open a dialog block Illustrator until someone closes it — prefer the dedicated tools.',
  shape: { command: z.string().min(1), refs: refSchema.optional() },
  step: (a) => ({ cmd: 'menu_command', args: a }),
};

export const history: ToolDef = {
  name: 'history',
  description: 'Undo or redo in the active document. One step = one earlier tool call (a whole batch is one step); a call cannot undo itself. action "undo" (default) | "redo", count (default 1).',
  shape: { action: z.enum(['undo', 'redo']).optional(), count: z.number().min(1).max(100).optional() },
  step: (a) => ({ cmd: 'history', args: a }),
};
