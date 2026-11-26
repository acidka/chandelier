// scene: image → editable vector scene (0.6, S1). The pixel work happens in Node; Illustrator only at build.
// Shipped in 0.6 (was behind CHANDELIER_SCENE=1 while built). Plan: docs/research/scene-plan.md.
import { z } from 'zod';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDef, Ctx } from './types.js';
import { fail, J } from './types.js';
import { readImage, encodePng, decodePng, resize, type Img } from '../image.js';
import { measure, refine, heatMap } from '../scene/refine.js';
import { analyze } from '../scene/analyze.js';
import { applyEdits } from '../scene/edits.js';
import { summary } from '../scene/summary.js';
import { overlay } from '../scene/overlay.js';
import { buildSteps } from '../scene/build.js';
import { put, save, get, fileOf } from '../scene/store.js';
import type { Params, Scene } from '../scene/types.js';

const xy = z.array(z.number()).length(2);
let tmpN = 0;

export const scene: ToolDef = {
  name: 'scene',
  description: `Image → editable vector scene; the pixel work happens here, Illustrator only at build. Image px until build.
"analyze": image (PNG/JPEG); crop [x,y,w,h] px or map: 4 corners px (TL,TR,BR,BL) of a photographed face (bilinear: tapered face); size [w,h] target aspect; colors (max inks, 16); min_de (6: closer inks merge); detail low|normal|high → id, a 1-page summary (regions: id, colour, area %, kind, z, next, conf, ink; hints) + overlay (ids on the image | flat render).
"edit": id, edits ["merge r3 r4" (r3 keeps its ink), "drop r12 r20-r40" (the region it sits on fills it; "… fill r0" to choose, "… fill none" = left empty), "drop < 0.05" (all under 0.05 %), "drop in x y w h" (all inside the box), "keep r12", "undo", "undo 3", "reset", "r2 = swatch:Brand", "c1 = #d9822b", "r3 = c1", "r3 over r5", "r3 top", "name r3 Wave", "name c0 Kraft", "tolerance r3 0.5", "r9 ellipse|circle|rect|rounded|polygon|free|auto", "ramp r3 r4 r5" (one region, linear gradient), "r3 flat", "layers r3 r5" (translucent: their overlap drawn by both, multiply), "r10 logo" (grouped, finer), "r4 placeholder", "text x y w h" (regions in the box left for live text; build returns text_boxes), "r7 text", "stack off", "show r40-r80"] → summary (overlay: true adds the image).
"build": id; rect (default the artboard), artboard, bleed, layer ("Scene"), position (new layer: "top" default; "bottom", "below:Name"; an existing layer stays put unless given) → one undo step: global swatches + one path (or live rect/ellipse for clean primitives) per region, bottom to top; a re-build replaces its own items (regions you deleted stay dropped, items you added stay).
"refine": id; threshold (ΔE, 6) → measures the build (Illustrator render; own render before a build) per region and edge against the image, corrects shifted inks and re-fits edges that miss, rebuilds once → report + heat map | new render.
dir: where scene.json is kept (default a temp folder; id may be its path).`,
  shape: {
    action: z.enum(['analyze', 'edit', 'build', 'refine']),
    image: z.string().optional(),
    crop: z.array(z.number()).length(4).optional(),
    map: z.array(xy).length(4).optional(),
    bilinear: z.boolean().optional(),
    size: xy.optional(),
    colors: z.number().int().min(2).max(64).optional(),
    min_de: z.number().min(0).optional(),
    detail: z.enum(['low', 'normal', 'high']).optional(),
    max_px: z.number().min(200).max(3000).optional(),
    id: z.string().optional(),
    edits: z.array(z.string()).max(200).optional(),
    overlay: z.boolean().optional(),
    rect: z.array(z.number()).length(4).optional(),
    artboard: z.number().min(0).optional(),
    bleed: z.number().min(0).optional(),
    layer: z.string().optional(),
    position: z.string().optional(),
    threshold: z.number().positive().optional(),
    dir: z.string().optional(),
  },
  async run(a, ctx) {
    try {
      if (a.action === 'analyze') return await doAnalyze(a, ctx);
      if (!a.id) return fail(`${a.action} needs id (from analyze) or a scene.json path`);
      const s = await get(a.id, join(ctx.tmp, `scene-src${++tmpN}.png`));
      if (a.action === 'edit') return doEdit(s, a);
      if (a.action === 'build') return await doBuild(s, a, ctx);
      return await doRefine(s, a, ctx);
    } catch (e) { return fail((e as Error).message); }
  },
};

const page = (s: Scene, o: Parameters<typeof summary>[1] = {}, image = true): CallToolResult => ({
  content: [
    ...(image ? [{ type: 'image' as const, data: encodePng(overlay(s)).toString('base64'), mimeType: 'image/png' }] : []),
    { type: 'text' as const, text: summary(s, { ...o, file: fileOf(s) }) },
  ],
});

async function doAnalyze(a: any, ctx: Ctx): Promise<CallToolResult> {
  if (!a.image) return fail('analyze needs image (a PNG or JPEG file)');
  const path = resolve(a.image);
  if (!existsSync(path)) return fail('image not found: ' + path);
  if (a.crop && a.map) return fail('give crop or map, not both');
  const src = await readImage(path, join(ctx.tmp, `scene-src${++tmpN}.png`));
  const p: Params = { image: path, crop: a.crop, map: a.map, bilinear: a.bilinear, size: a.size, colors: a.colors ?? 16, minDe: a.min_de ?? 6, detail: a.detail ?? 'normal', maxPx: a.max_px ?? 1000 };
  const s = analyze(src, p, { dir: a.dir ? resolve(a.dir) : join(ctx.tmp, 'scenes'), path, bytes: readFileSync(path) });
  put(s); save(s);
  return page(s);
}

function doEdit(s: Scene, a: any): CallToolResult {
  if (!a.edits?.length) return { content: [{ type: 'text', text: summary(s, { file: fileOf(s) }) }] };
  const r = applyEdits(s, a.edits);
  save(s);
  return page(s, { show: r.show, showColour: r.showColour }, !!a.overlay);
}

async function doBuild(s: Scene, a: any, ctx: Ctx): Promise<CallToolResult> {
  let rect = a.rect as number[] | undefined;
  if (!rect) {
    const env = await ctx.rt.cmd<{ active: number; artboards: { i: number; rect: number[] }[] }>('artboards', { action: 'list' });
    if (!env.ok) return fail('build: could not read the artboards (is a document open?): ' + J(env.error));
    const ab = env.data!.artboards[a.artboard ?? env.data!.active];
    if (!ab) return fail(`artboard ${a.artboard} does not exist`);
    rect = [0, 0, ab.rect[2], ab.rect[3]];
  }
  const t0 = performance.now(), layer = a.layer ?? 'Scene';
  // what is on the layer now: a new layer is created (no delete step); a rebuild replaces only its own items, and regions
  // whose items were deleted since are dropped instead of coming back
  const present = await layerItems(ctx, layer);
  let clear: 'layer' | 'none' | string[] = present ? 'layer' : 'none';
  const kept: string[] = [];
  if (present && s.built?.layer === layer) {
    const own = Object.entries(s.built!.items), still = own.filter(([, u]) => present.has(u));
    if (still.length) {
      const gone = own.filter(([, u]) => !present.has(u)).map(([r]) => r);
      if (gone.length) { applyEdits(s, ['drop ' + gone.join(' ')]); kept.push(...gone); }
      // plus scene items the record misses (a build before 0.6 recorded only 100 per step): found by their names
      const mine = new Set(still.map(([, u]) => u)), names = new Set(s.meta.map((m) => m.name).filter(Boolean) as string[]);
      const sceneName = (n: string) => n.startsWith(layer + ' r') || /^(Logo|Placeholder) r\d+$/.test(n) || names.has(n);
      for (const [u, n] of present) if (!mine.has(u) && sceneName(n) && !own.some(([, x]) => x === u)) mine.add(u);
      clear = [...mine];
    }
  }
  const plan = buildSteps(s, { rect, bleed: a.bleed, layer, artboard: a.artboard, position: a.position ?? (present ? undefined : 'top'), clear });
  const batch = ctx.tools.get('batch')!;
  const items: Record<string, string> = {}, warnings: string[] = [];
  for (const steps of plan.batches) {
    const res = await batch.run!({ steps, rollback: true, stop_on_error: true }, ctx);
    const body = (res.content[0] as { text: string }).text;
    if (res.isError) return fail('build failed: ' + body);
    for (const c of res.content.slice(1)) warnings.push((c as { text: string }).text);
    const d = JSON.parse(body) as { results: { ok: boolean; data?: { items?: { uuid: string }[] } }[] };
    let k = Object.keys(items).length;
    steps.forEach((st, i) => {
      // region items only (a placeholder box is a single create_shape without items, not a region's shape)
      if ((st.tool !== 'create_path' && st.tool !== 'create_shape') || !Array.isArray(st.args.items)) return;
      const listed = d.results[i]?.data?.items ?? [];
      if (listed.length < (st.args.items as unknown[]).length) warnings.push(`step ${i}: ${listed.length} of ${(st.args.items as unknown[]).length} items listed — a rebuild may leave the rest`);
      for (const it of listed) items['r' + plan.regions[k++]] = String(it.uuid);
    });
  }
  s.built = { layer, rect, artboard: a.artboard, bleed: a.bleed, units: ctx.settings.units, items };
  save(s);
  const out = {
    id: s.id, layer, items: plan.items, swatches: plan.swatches, anchors: plan.anchors, bytes: plan.bytes, rect, units: ctx.settings.units,
    ...(plan.textBoxes.length ? { text_boxes: plan.textBoxes } : {}),
    ...(kept.length ? { dropped_deleted: kept.join(' ') } : {}),
    undo: plan.batches.length === 1 ? 'one step' : `${plan.batches.length} steps (scene too large for one call: detail low or merge)`, calls: plan.batches.length, ms: Math.round(performance.now() - t0),
  };
  return { content: [{ type: 'text', text: J(out) }, ...warnings.map((t) => ({ type: 'text' as const, text: t }))] };
}

/** uuids of the items on a layer (all depths), or null when the layer doesn't exist */
/** uuid → name of the top-level items on a layer, or null when the layer doesn't exist */
async function layerItems(ctx: Ctx, layer: string): Promise<Map<string, string> | null> {
  const out = new Map<string, string>();
  for (let offset = 0; ; offset += 1000) {
    const env = await ctx.rt.cmd<{ items: { uuid: string | number; name?: string }[]; more?: boolean }>('find_items', { layer, top_level: true, fields: ['uuid', 'name'], limit: 1000, offset });
    if (!env.ok) return null; // no such layer (or no document)
    for (const it of env.data!.items) out.set(String(it.uuid), it.name ?? '');
    if (!env.data!.more || !env.data!.items.length) return out;
  }
}

async function doRefine(s: Scene, a: any, ctx: Ctx): Promise<CallToolResult> {
  const { w, h } = s.work;
  let render: Img = s.render, source = 'own render (not built yet)';
  if (s.built) {
    const pv = ctx.tools.get('preview')!;
    const r = await pv.run!({ region: s.built.rect, width: w, ...(s.built.artboard !== undefined ? { artboard: s.built.artboard } : {}), background: 'white' }, ctx);
    const im = r.content.find((c) => c.type === 'image') as { data: string } | undefined;
    if (r.isError || !im) return fail('refine: could not render the build: ' + J(r.content));
    render = decodePng(Buffer.from(im.data, 'base64'));
    if (render.w !== w || render.h !== h) render = resize(render, w, h);
    source = 'Illustrator';
  }
  const m = measure(s, render), rep = refine(s, m, a.threshold ?? 6);
  let rebuilt: unknown = false;
  if (s.built && rep.fixed.length && !rep.reverted) {
    const b = await doBuild(s, { layer: s.built.layer, rect: s.built.rect, artboard: s.built.artboard, bleed: s.built.bleed }, ctx); // keeps the layer's place and hand-added items
    if (b.isError) return b;
    rebuilt = JSON.parse((b.content[0] as { text: string }).text);
  }
  save(s);
  const heat = heatMap(render, s.work), gap = 8, W = w * 2 + gap, rgb = new Uint8Array(W * h * 3).fill(255);
  for (let y = 0; y < h; y++) { rgb.set(heat.rgb.subarray(y * w * 3, (y + 1) * w * 3), y * W * 3); rgb.set(s.render.rgb.subarray(y * w * 3, (y + 1) * w * 3), (y * W + w + gap) * 3); }
  const out = { id: s.id, measured: source, ...rep, est_rmse_after: s.estRmse, rebuilt };
  return { content: [{ type: 'image', data: encodePng({ w: W, h, rgb }).toString('base64'), mimeType: 'image/png' }, { type: 'text', text: J(out) }] };
}
