import { z } from 'zod';
import { readFileSync, copyFileSync, rmSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDef, Ctx } from './types.js';
import { J, fail, ArgError } from './types.js';
import { runStep, respond } from './respond.js';
import { refSchema } from './common.js';
import { errorText } from './respond.js';
import { decodePng, encodePng, compare, crop, cropPad, resize, readImage, shrinkPngFile, diffRegions } from '../image.js';
import { view, type Frame } from '../imageview.js';
import { imageColorMode, imagePpi } from '../imagefile.js';
import { pdfInfo } from '../pdf.js';
import { edgeTracks } from '../edges.js';

let n = 0;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** run a tool with its run() or its step (preflight has run(), document_info only a step) */
async function callTool(tool: ToolDef, args: any, ctx: Ctx): Promise<CallToolResult> {
  try { return tool.run ? await tool.run(args, ctx) : respond(await runStep(tool, args, ctx)); }
  catch (e) { return fail(e instanceof ArgError ? e.message : String((e as Error)?.message ?? e)); }
}

export const preview: ToolDef = {
  name: 'preview',
  description: `Render the active document to a PNG image. One of: artboard (default active), refs (framed by pad, default 5%), region ([x,y,w,h] from the artboard's top-left; may lie off it). max_px = longest side (default 1024) or width in px; background white|transparent; save_to copies the PNG (with reference also <name>.compare.png).
reference: image (PNG/JPEG) of the page to compare → [reference | preview | red difference] + rmse (0 = same), content_box (shift/scale) and up to 6 differences {rect, kind shifted (shift = preview − reference) | missing | extra | changed, items}; reference_crop [x,y,w,h] px = the page in it. With region/refs the same part of the reference is compared.
more [artboards] → extra renders (500 px); preflight, info (document_info) → those results too.
image: a file instead (PNG/JPEG…; .pdf/.ai/.eps/.svg page via Illustrator, page) → px, ppi, content_box, background, no Python/Swift needed; region (px; pages: session units) crops and zooms; grid: true|step; sample [[x,y]|[x,y,w,h]] → hex, rgb, cmyk; profile: true|{step,min,rows} → edge tracks {id, tone, above, below, pts} for create_path fit.`,
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
    profile: z.union([z.boolean(), z.object({ step: z.number().positive().optional(), min: z.number().positive().optional(), rows: z.boolean().optional() })]).optional(),
  },
  async run(a, ctx) {
    if (a.image) return imagePreview(a, ctx);
    if (a.grid || a.sample || a.page || a.profile) return fail('grid, sample, page and profile work with image (a file to look at).');
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
    delete v.doc_bounds; delete v.page_bounds;
    rmSync(file, { force: true });
    return { content: [{ type: 'image', data: data.toString('base64'), mimeType: 'image/png' }, { type: 'text', text: J(v) }] };
  }
  // compare with the reference: crop it and resize it to the preview's exact pixel size, then diff
  const prev = decodePng(data);
  let ref;
  try {
    ref = await readImage(reference, join(tmp, `r${id}.png`));
    if (a.reference_crop) { const [cx, cy, cw, ch] = a.reference_crop; ref = crop(ref, cx, cy, cw, ch); }
    // the reference is the page; a region or items render only part of it (or beyond it): cut the same part
    const pg = v.page_bounds as number[] | undefined, db0 = v.doc_bounds as number[] | undefined;
    if (pg && db0) {
      const PW = pg[2] - pg[0], PH = pg[1] - pg[3];
      const fx = (db0[0] - pg[0]) / PW, fy = (pg[1] - db0[1]) / PH, fw = (db0[2] - db0[0]) / PW, fh = (db0[1] - db0[3]) / PH;
      if (Math.abs(fx) > 1e-3 || Math.abs(fy) > 1e-3 || Math.abs(fw - 1) > 1e-3 || Math.abs(fh - 1) > 1e-3) ref = cropPad(ref, fx * ref.w, fy * ref.h, fw * ref.w, fh * ref.h);
    }
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
  delete v.doc_bounds; delete v.page_bounds;
  const stats: Record<string, unknown> = {
    ...v, compared_with: reference, rmse: c.rmse,
    differences: regions.map((g, i) => ({ rect: toRect(g.box), kind: g.kind, ...(g.shift ? { shift: [r2(g.shift[0] * rw), r2(g.shift[1] * rh)] } : {}), diff: g.diff, items: at[i]?.length ? at[i] : undefined })),
  };
  if (c.ink) {
    const R = toRect(c.ink.reference), P = toRect(c.ink.preview);
    stats.content_box = contentBoxStats(R, P);
  }
  const composite = encodePng(c.composite);
  if (a.save_to) {
    // save_to is the render, as without reference; the comparison goes next to it (bug #11: the names were swapped)
    const p = resolve(a.save_to), q = p.replace(/(\.png)?$/i, '.compare.png');
    mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, data); writeFileSync(q, composite);
    stats.saved_to = p; stats.compare_saved_to = q;
  }
  return { content: [{ type: 'image', data: composite.toString('base64'), mimeType: 'image/png' }, { type: 'text', text: J(stats) }] };
}

/** content_box of a comparison. Boxes whose aspect disagrees a lot describe different things (a photo's whole
 * object, side face included, vs the artwork): a shift and scale from them misled every round (bug #8). */
export function contentBoxStats(R: number[], P: number[]): Record<string, unknown> {
  const scale = [r2(P[2] / R[2]), r2(P[3] / R[3])], aspect = scale[0] / scale[1];
  if (aspect > 1.15 || aspect < 1 / 1.15) return { reference: R, preview: P, note: 'the contents differ in shape (photo, side face or margin?): no shift/scale; use differences and close-ups' };
  return { reference: R, preview: P, shift: [r2(P[0] - R[0]), r2(P[1] - R[1])], scale };
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
  const tracks = a.profile ? edgeTracks(frame.img, a.profile === true ? {} : a.profile, frame.ox, frame.oy, frame.k) : undefined;
  const v = view(frame, { grid: a.grid, sample: a.sample, max_px: max, tracks });
  const png = encodePng(v.img);
  const { img: _i, ...stats } = v;
  const res: Record<string, unknown> = { ...info, ...stats, ...(tracks ? { tracks } : {}) };
  if (a.save_to) { const p = resolve(a.save_to); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, png); res.saved_to = p; }
  return { content: [{ type: 'image', data: png.toString('base64'), mimeType: 'image/png' }, { type: 'text', text: J(res) }] };
}
