import { z } from 'zod';
import type { ToolDef } from './types.js';
import { respond } from './respond.js';
import { readAiBleed } from '../aifile.js';
import { project, checkDocFields } from './brief.js';

const UNIT: Record<string, number> = { pt: 1, px: 1, mm: 72 / 25.4, in: 72 };
const r2 = (n: number) => Math.round(n * 100) / 100;

export const document_info: ToolDef = {
  name: 'document_info',
  description: 'Compact summary of a document (default: active): colour space, bleed (session units, source xmp|file|unknown), artboards (rect [x,y,w,h] in session coordinates), layers (item counts, hidden/non-printing/locked), counts by type, global swatches with their colours, spot colours, paragraph/character styles, fonts used (text frames per font), selection count, and issues (RGB in CMYK, empty text, empty groups, unnamed text outside named groups, overset area text, unstyled text = frames left on the default paragraph style when the document has its own styles). checks:false skips the slow checks. Default reply: name, colorSpace, units, bleed, artboardCount, counts, issues; add sections with fields (artboards, layers, swatches, styles, fonts, issues).',
  shape: { doc: z.string().optional().describe('document name, default active'), checks: z.boolean().optional(), fields: z.array(z.string()).optional() },
  step: (a) => { checkDocFields(a); const { fields: _f, ...args } = a; return { cmd: 'document_info', args }; },
  async run(a, { rt, settings }) {
    checkDocFields(a);
    const { fields: _f, ...args } = a;
    const env = await rt.cmd<any>('document_info', args);
    const d = env.data;
    if (env.ok && d && !d.bleed) {
      // not recorded by us: read it from the file on disk (exact only when there are no unsaved changes)
      if (d.path && /\.ai$/i.test(d.path)) {
        try {
          const b = await readAiBleed(d.path), k = UNIT[settings.units] ?? 1;
          if (b) d.bleed = { left: r2(b.left / k), top: r2(b.top / k), right: r2(b.right / k), bottom: r2(b.bottom / k), source: d.saved ? 'file' : 'file (unsaved changes not included)' };
        } catch { /* unreadable file: leave unknown */ }
      }
      if (!d.bleed) d.bleed = { source: 'unknown', note: 'Illustrator cannot report a bleed: it is known for documents made with documents new, or once saved as .ai' };
    }
    if (env.ok) env.data = project('document_info', d, a, settings);
    return respond(env);
  },
};
