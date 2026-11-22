import { z } from 'zod';
import type { ToolDef } from './types.js';
import { refSchema } from './common.js';
import { charShape, paraShape } from './text.js';

const { character_style: _c, ...charProps } = charShape;
const { paragraph_style: _p, ...paraProps } = paraShape;

export const styles: ToolDef = {
  name: 'styles',
  description: `Paragraph, character and graphic styles (kind, default "paragraph").
action: "list" (names; spec = the props this tool stored for styles it made — Illustrator can't report style attributes safely) · "create" (name + props; refs applies it right away) · "update" (name + props to change; new_name) · "apply" (name, refs: text frames or groups; character styles can target match text; clear_overrides default true) · "remove".
Paragraph props: font, size, fill/color, leading, tracking, caps, … + align, space_before/after, indents, hyphenation. Character props: the font/colour ones.
Graphic styles: list and apply only (they can't be created from scripts).`,
  shape: {
    action: z.enum(['list', 'create', 'update', 'apply', 'remove']).optional(),
    kind: z.enum(['paragraph', 'character', 'graphic']).optional(),
    name: z.string().optional(), new_name: z.string().optional(),
    refs: refSchema.optional(),
    match: z.string().optional(),
    clear_overrides: z.boolean().optional(),
    ...charProps, ...paraProps,
  },
  step: (a) => ({ cmd: 'styles', args: a }),
};
