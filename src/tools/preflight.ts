import { z } from 'zod';
import type { ToolDef } from './types.js';
import { text } from './types.js';
import { errorText, clip } from './respond.js';
import { readAiBleed } from '../aifile.js';
import { imageColorMode } from '../imagefile.js';
import { J } from './types.js';

const CATS = ['missing_font', 'broken_link', 'rgb_in_cmyk', 'overset_text', 'white_overprint', 'registration_color', 'low_res', 'empty_text', 'default_text',
  'off_artboard', 'small_text', 'hairline', 'no_bleed', 'low_contrast', 'off_token', 'spot_color', 'overprint', 'transparency', 'live_text', 'empty_group'] as const;

export const preflight: ToolDef = {
  name: 'preflight',
  description: `Print checks of the active document in one pass. Hidden items and hidden/non-printing layers are skipped (counted in skipped_non_printing) unless include_non_printing.
errors: missing_font, broken_link, rgb_in_cmyk (paths, text, RGB images), overset_text, white_overprint ·
warnings: registration_color (art painted with [Registration]), low_res (< min_dpi, default 300), empty_text, default_text (unnamed 12 pt Myriad leftovers), off_artboard, small_text (< min_text_pt, default 5), hairline (< hairline_pt, default 0.25), no_bleed (art at an artboard edge, document without bleed), low_contrast (text below WCAG AA on what lies under it; RGB documents, any with contrast:true), off_token (colours/fonts/sizes outside tokens {colors, fonts, sizes}) ·
info: spot_color (real spot inks only — global process swatches are not spots), overprint, transparency, live_text (one count line), empty_group.
Also returns inks (process plates, spot inks) and the bleed. ignore: categories to skip; max_items per category (default 20).`,
  shape: {
    ignore: z.array(z.enum(CATS)).optional(),
    include_non_printing: z.boolean().optional(),
    min_dpi: z.number().positive().optional(),
    min_text_pt: z.number().min(0).optional(),
    hairline_pt: z.number().min(0).optional(),
    max_items: z.number().min(0).max(500).optional(),
    contrast: z.boolean().optional(),
    tokens: z.object({ colors: z.array(z.string()).optional(), fonts: z.array(z.string()).optional(), sizes: z.array(z.number()).optional() }).optional(),
  },
  step: (a) => ({ cmd: 'preflight', args: a }),
  async run(a, { rt }) {
    const env = await rt.cmd<any>('preflight', a);
    if (!env.ok) return { content: [{ type: 'text', text: errorText(env) }], isError: true };
    const d = env.data;
    let bleed = d.bleed, source = bleed ? 'xmp' : 'unknown';
    if (!bleed && d.path && /\.ai$/i.test(d.path)) {
      try { bleed = await readAiBleed(d.path); if (bleed) source = d.saved ? 'file' : 'file (unsaved changes not included)'; } catch { /* unknown */ }
    }
    const hasBleed = bleed && (bleed.left || bleed.top || bleed.right || bleed.bottom);
    if (!hasBleed && d.edge_items > 0 && !(a.ignore ?? []).includes('no_bleed')) {
      d.checks.no_bleed = { severity: 'warning', count: d.edge_items, items: [], note: `${d.edge_items} item(s) reach past an artboard edge but the document bleed is ${bleed ? 0 : 'unknown'}: export with bleed (export {bleed}) or the edge will show white after trimming` };
      d.summary.warnings += d.edge_items;
    }
    // linked raster images: Illustrator can't tell their colour mode, the file header can
    if (!(a.ignore ?? []).includes('rgb_in_cmyk')) {
      for (const l of d.linked as { uuid: string; name?: string; path: string }[]) {
        let mode = 'unknown';
        try { mode = imageColorMode(l.path); } catch { /* unreadable */ }
        if (mode !== 'rgb' && mode !== 'indexed') continue;
        const c = (d.checks.rgb_in_cmyk ??= { severity: 'error', count: 0, items: [] });
        c.count++; d.summary.errors++; d.ok = false;
        if (c.items.length < d.max) c.items.push({ uuid: l.uuid, name: l.name, type: 'placed', detail: `linked ${mode.toUpperCase()} image ${l.path}` });
      }
    }
    d.bleed_pt = bleed ? { ...bleed, source } : { source };
    delete d.path; delete d.saved; delete d.bleed; delete d.edge_items; delete d.linked; delete d.max;
    return text(clip(J(d)));
  },
};
