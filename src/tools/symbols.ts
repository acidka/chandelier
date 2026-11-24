import { z } from 'zod';
import type { ToolDef } from './types.js';
import { refSchema } from './common.js';

// 0.2.1: symbols. Kept short — every agent request re-reads the tool list (budget test).
export const symbols: ToolDef = {
  name: 'symbols',
  description: `Symbols. action: "list" → [{name, instances}] · "create" (refs, name; the items become one instance, keep:true leaves them) · "place" (name, x, y, w?, h?, layer?) · "replace" (refs = instances, name) · "expand" (refs: instances → editable art) · "remove" (name; force:true also deletes its instances).`,
  shape: {
    action: z.enum(['list', 'create', 'place', 'replace', 'expand', 'remove']).optional(),
    name: z.string().optional(), refs: refSchema.optional(),
    x: z.number().optional(), y: z.number().optional(), w: z.number().positive().optional(), h: z.number().positive().optional(),
    layer: z.string().optional(), keep: z.boolean().optional(), force: z.boolean().optional(),
  },
  step: (a) => ({ cmd: 'symbols', args: a }),
};
