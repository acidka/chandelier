import { z } from 'zod';
import { readFileSync, copyFileSync, rmSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDef, Ctx } from './types.js';
import { J, fail, ArgError } from './types.js';
import { runStep, respond } from './respond.js';
import { refSchema } from './common.js';
import { errorText } from './respond.js';
import { decodePng, encodePng, compare, crop, resize, readImage, shrinkPngFile, diffRegions } from '../image.js';
import { view, type Frame } from '../imageview.js';
import { imageColorMode, imagePpi } from '../imagefile.js';
import { pdfInfo } from '../pdf.js';

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
reference: an image (PNG/JPEG) to compare with → ONE image [reference | preview | difference in red] (600 px panels) + rmse (0 = same), content_box in both (shift/scale show an offset or wrong size) and differences: up to 6 regions {rect, kind: shifted (with shift [dx, dy] = preview − reference) | missing | extra | changed, items there}. reference_crop: [x,y,w,h] in image pixels to cut the page out first.
One check call: more [artboards] → extra renders (default 500 px); preflight:true, info:true (document_info) add those results.
image: look at a file instead, no Python/PIL/Swift needed (PNG, JPEG…; .pdf/.ai/.eps/.svg page via Illustrator, page default 1) → px, ppi, content_box, background. region crops and zooms it (image px; pages: session units); grid: true | step → labelled lines; sample: [[x,y] | [x,y,w,h]] → hex, rgb, cmyk.`,
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
    image: z.string().optional(),
    page: z.number().min(1).optional(),
    grid: z.union([z.boolean(), z.number().positive()]).optional(),
    sample: z.array(z.array(z.number()).min(2).max(4)).max(24).optional(),
  },
  async run(a, ctx) {
    if (a.image) return imagePreview(a, ctx);
    if (a.grid || a.sample || a.page) return fail('grid, sample and page work with image (a file to look at).');
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
    delete v.doc_bounds;
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
  // differences (0.4): blobs, each classified (shifted by [dx, dy] / missing / extra / changed) with the items there
  const regions = diffRegions(ref, prev);
  const db = v.doc_bounds as number[];
  let at: { uuid: string; name?: string; type: string; text?: string }[][] = [];
  if (regions.length && db) {
    const W = db[2] - db[0], H = db[1] - db[3];
    const docRect = (f: number[]) => [db[0] + f[0] * W, db[1] - f[1] * H, db[0] + (f[0] + f[2]) * W, db[1] - (f[1] + f[3]) * H];
    const env2 = await rt.cmd<typeof at>('items_at', { rects: regions.map((g) => docRect(g.box)) });
    if (env2.ok) at = env2.data!;
  }
  delete v.doc_bounds;
  const stats: Record<string, unknown> = {
    ...v, compared_with: reference, rmse: c.rmse,
    differences: regions.map((g, i) => ({ rect: toRect(g.box), kind: g.kind, ...(g.shift ? { shift: [r2(g.shift[0] * rw), r2(g.shift[1] * rh)] } : {}), diff: g.diff, items: at[i]?.length ? at[i] : undefined })),
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

const VECTOR = /\.(pdf|ai|eps|svgz?)$/i;

/** preview {image}: a file, not the document. Raster files never need Illustrator; pages of vector files are
 * rendered by it (render_file opens, captures and closes the file). */
async function imagePreview(a: any, { rt, tmp, settings }: Ctx): Promise<CallToolResult> {
  const path = resolve(a.image);
  if (!existsSync(path)) return fail('image not found: ' + path);
  for (const k of ['reference', 'refs', 'more', 'preflight', 'info']) if (a[k] !== undefined) return fail(`image works alone: drop ${k} (image takes region, grid, sample, page, max_px, save_to).`);
  if (a.region && (a.region[2] <= 0 || a.region[3] <= 0)) return fail('region needs a positive width and height.');
  const id = ++n, max = a.max_px ?? (a.width ? a.width : 1024);
  let frame: Frame, info: Record<string, unknown>;
  if (VECTOR.test(path)) {
    const out = join(tmp, `f${id}.png`);
    const env = await rt.cmd<Record<string, any>>('render_file', { path, page: a.page ? Math.round(a.page) : undefined, region: a.region, max_px: max, out });
    if (!env.ok) return { content: [{ type: 'text', text: errorText(env) }], isError: true };
    const d = env.data!;
    let img;
    try { img = decodePng(readFileSync(out)); } catch { return fail('Illustrator did not render ' + path); } finally { rmSync(out, { force: true }); }
    const [rx, ry] = d.rect as number[];
    frame = { img, ox: rx, oy: ry, k: img.w / (d.rect as number[])[2] };
    info = { file: path, page: a.page ?? 1, page_size: d.page_size, units: settings.units, ...(d.artboards ? { artboards: d.artboards } : {}), ...(d.already_open ? { already_open: true } : {}), ...(a.region ? { region: d.rect } : {}) };
    if (/\.pdf$/i.test(path)) { try { const p = await pdfInfo(path); info.pages = p.pages; } catch { /* encrypted or odd PDF: the render is still good */ } }
  } else {
    let img;
    try { img = await readImage(path, join(tmp, `i${id}.png`)); } catch (e) { return fail((e as Error).message); }
    info = { file: path, px: [img.w, img.h] };
    const ppi = imagePpi(path); if (ppi) info.ppi = ppi;
    const color = imageColorMode(path); if (color !== 'unknown') info.color = color;
    let ox = 0, oy = 0;
    if (a.region) {
      const [x, y, w, h] = a.region;
      if (x >= img.w || y >= img.h || x + w <= 0 || y + h <= 0) return fail(`region lies outside the image (${img.w} × ${img.h} px).`);
      img = crop(img, x, y, w, h); ox = Math.max(0, Math.round(x)); oy = Math.max(0, Math.round(y));
      info.region = [ox, oy, img.w, img.h];
    }
    frame = { img, ox, oy, k: 1 };
  }
  const v = view(frame, { grid: a.grid, sample: a.sample, max_px: max });
  const png = encodePng(v.img);
  const { img: _i, ...stats } = v;
  const res: Record<string, unknown> = { ...info, ...stats };
  if (a.save_to) { const p = resolve(a.save_to); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, png); res.saved_to = p; }
  return { content: [{ type: 'image', data: png.toString('base64'), mimeType: 'image/png' }, { type: 'text', text: J(res) }] };
}
