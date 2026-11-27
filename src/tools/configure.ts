import { z } from 'zod';
import type { ToolDef } from './types.js';
import { text, fail } from './types.js';
import { approveLocked } from '../settings.js';

export const configure: ToolDef = {
  name: 'configure',
  description: 'Session settings used by every tool (and by AIA.* helpers in run_script). units: "pt" (default) | "mm" | "in" | "px" for positions and sizes (type sizes and stroke width stay pt). origin: "artboard" (default: top-left of the reference artboard, y grows down) | "document" (y up). artboard: index of the reference artboard (null = the active one). timeout: seconds per call (default 300). activate: front Illustrator before save/export (default true; Windows false). reply: "brief" (default: short replies, fields widens) | "full" (every key). approve: "plan" = every change needs a plan the designer approves (batch plan) | "off" (default). Returns the settings.',
  shape: {
    units: z.enum(['pt', 'mm', 'in', 'px']).optional(),
    origin: z.enum(['artboard', 'document']).optional(),
    artboard: z.number().min(0).nullable().optional(),
    timeout: z.number().min(1).max(3600).optional(),
    activate: z.boolean().optional(),
    reply: z.enum(['full', 'brief']).optional(),
    approve: z.enum(['off', 'plan']).optional(),
  },
  async run(a, { settings }) {
    if (a.approve === 'off' && approveLocked()) return fail('Approval mode is locked on here (CHANDELIER_APPROVE=plan): configure cannot turn it off.');
    for (const k of ['units', 'origin', 'artboard', 'timeout', 'activate', 'reply', 'approve'] as const) if (a[k] !== undefined) (settings as any)[k] = a[k];
    const { plan_run: _r, ...shown } = settings;
    return text(shown);
  },
};
