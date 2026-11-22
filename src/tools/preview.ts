import { z } from 'zod';
import { readFileSync, copyFileSync, rmSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDef, Ctx } from './types.js';
import { J, fail, ArgError } from './types.js';
import { runStep, respond } from './respond.js';
import { refSchema } from './common.js';
import { errorText } from './respond.js';
import { decodePng, encodePng, compare, crop, resize, readImage, shrinkPngFile } from '../image.js';

let n = 0;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** run a tool with its run() or its step (preflight has run(), document_info only a step) */
async function callTool(tool: ToolDef, args: any, ctx: Ctx): Promise<CallToolResult> {
  try { return tool.run ? await tool.run(args, ctx) : respond(await runStep(tool, args, ctx)); }
  catch (e) { return fail(e instanceof ArgError ? e.message : String((e as Error)?.message ?? e)); }
}

export const preview: ToolDef = {
  name: 'preview',
  description: `Look at the active document: renders a PNG and returns it as an image. One of: artboard (index, default active), refs (items, framed with pad, default 5%), region ([x,y,w,h] from artboard's top-left if given, else the active one's; may lie off it). max_px = longest side (default 1024) or width = exact px. background "white" | "transparent". save_to copies the PNG (with reference: the comparison, and the render as <name>.preview.png).
reference: an image (PNG/JPEG) to compare with → ONE image [reference | preview | difference in red] (600 px panels) + rmse (0 = same), content_box in both (shift/scale show an offset or wrong size) and the 3 most different regions [x,y,w,h]. reference_crop: [x,y,w,h] in image pixels to cut the page out first.
One check call: more [artboards] → extra renders (default 500 px); preflight:true, info:true (document_info) add those results.`,
  shape: {
    artboard: z.number().min(0).optional(),
    refs: refSchema.optional(),
    region: z.array(z.number()).length(4).optional(),
    pad: z.number().min(0).optional(),
    max_px: z.number().min(16).max(4096).optional(),
    width: z.number().min(16).max(8192).optional(),
    background: z.enum(['white', 'transparent']).optional(),
    save_to: z.string().optional(),
    reference: z.string().optional(),
    reference_crop: z.array(z.number()).length(4).optional(),
    more: z.array(z.number().min(0)).max(12).optional(),
    preflight: z.boolean().optional(),
    info: z.boolean().optional(),
  },
  async run(a, ctx) {
    const { more, preflight, info, ...main } = a;
    const res = await render(main, ctx);
    if (res.isError) return res;
    for (const k of more ?? []) {
      const r = await render({ artboard: k, max_px: a.max_px ?? 500, background: a.background }, ctx);
      res.content.push(...(r.isError ? [{ type: 'text' as const, text: `artboard ${k}: ` + (r.content[0] as { text: string }).text }] : r.content));
    }
    for (const [on, name] of [[preflight, 'preflight'], [info, 'document_info']] as const) {
      if (!on) continue;
      const r = await callTool(ctx.tools.get(name)!, {}, ctx);
      res.content.push({ type: 'text', text: `${name}: ` + (r.content[0] as { text: string }).text });
    }
    return res;
  },
};

async function render(a: any, { rt, tmp }: Ctx): Promise<CallToolResult> {
  const id = ++n, file = join(tmp, `p${id}.png`);
  const reference = a.reference ? resolve(a.reference) : null;
  if (reference && !existsSync(reference)) return fail('reference not found: ' + reference);
  const args = { ...a, path: file, save_to: undefined, reference: undefined, reference_crop: undefined,
    max_px: a.max_px ?? (reference && !a.width ? 600 : undefined), background: reference ? 'white' : a.background };
  const env = await rt.cmd<Record<string, any>>('preview', args);
  if (!env.ok) return { content: [{ type: 'text', text: errorText(env) }], isError: true };
  const v = env.data!;
  if (typeof v.resize_to === 'number') {
    // Illustrator renders at >= 72 ppi; shrink to the asked size here (pure JS, any platform)
    try {
      const px = v.px as number[], got = shrinkPngFile(file, v.resize_to as number);
      v.px = [got.w, got.h];
      v.scale = Math.round((v.scale as number) * got.w / px[0] * 1000) / 1000;
    } catch { /* keep the larger image */ }
    delete v.resize_to;
  }
  let data: Buffer;
  try { data = readFileSync(file); } catch { return fail('Illustrator did not write the preview image.'); }
  if (a.save_to && !reference) { const p = resolve(a.save_to); mkdirSync(dirname(p), { recursive: true }); copyFileSync(file, p); v.saved_to = p; }
  if (!reference) {
    rmSync(file, { force: true });
    return { content: [{ type: 'image', data: data.toString('base64'), mimeType: 'image/png' }, { type: 'text', text: J(v) }] };
  }
  // compare with the reference: crop it and resize it to the preview's exact pixel size, then diff
  const prev = decodePng(data);
  let ref;
  try {
    ref = await readImage(reference, join(tmp, `r${id}.png`));
    if (a.reference_crop) { const [cx, cy, cw, ch] = a.reference_crop; ref = crop(ref, cx, cy, cw, ch); }
    ref = resize(ref, prev.w, prev.h);
  } catch (e) { return fail('Could not read the reference image: ' + (e as Error).message); }
  const c = compare(ref, prev);
  rmSync(file, { force: true });
  // fractions of the rendered area → session coordinates
  const [rx, ry, rw, rh] = v.rect as number[];
  const toRect = (f: number[]) => [r2(rx + f[0] * rw), r2(ry + f[1] * rh), r2(f[2] * rw), r2(f[3] * rh)];
  const stats: Record<string, unknown> = {
    ...v, compared_with: reference, rmse: c.rmse,
    regions: c.regions.map((g) => ({ rect: toRect([g.cell[0] / 4, g.cell[1] / 4, 0.25, 0.25]), diff: g.diff })),
  };
  if (c.ink) {
    const R = toRect(c.ink.reference), P = toRect(c.ink.preview);
    stats.content_box = { reference: R, preview: P, shift: [r2(P[0] - R[0]), r2(P[1] - R[1])], scale: [r2(P[2] / R[2]), r2(P[3] / R[3])] };
  }
  const composite = encodePng(c.composite);
  if (a.save_to) {
    const p = resolve(a.save_to), q = p.replace(/(\.png)?$/i, '.preview.png');
    mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, composite); writeFileSync(q, data);
    stats.saved_to = p; stats.preview_saved_to = q;
  }
  return { content: [{ type: 'image', data: composite.toString('base64'), mimeType: 'image/png' }, { type: 'text', text: J(stats) }] };
}
