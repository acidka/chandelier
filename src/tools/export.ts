import { z } from 'zod';
import { mkdirSync, readdirSync, statSync, copyFileSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, extname, basename } from 'node:path';
import type { ToolDef } from './types.js';
import { text, fail, J } from './types.js';
import { refSchema } from './common.js';
import { errorText } from './respond.js';
import { readAiBleed, type Bleed } from '../aifile.js';
import { mergePdfs, setBleedBoxes, pdfInfo } from '../pdf.js';
import { shrinkPngFile } from '../image.js';

/** Clip an exported SVG to its viewBox (= the artboard): Illustrator keeps art that lies outside it, and renderers
 * other than browsers' <img> draw it. */
export function clipSvgToViewBox(svg: string): string {
  const open = svg.match(/<svg\b[^>]*>/);
  const vb = open?.[0].match(/viewBox="([^"]+)"/);
  if (!open || !vb || svg.includes('id="chandelier-artboard"')) return svg;
  const [x, y, w, h] = vb[1].trim().split(/[\s,]+/).map(Number);
  if (![x, y, w, h].every(Number.isFinite)) return svg;
  const i = open.index! + open[0].length, j = svg.lastIndexOf('</svg>');
  if (j < i) return svg;
  return svg.slice(0, i) + `<clipPath id="chandelier-artboard"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath><g clip-path="url(#chandelier-artboard)">` +
    svg.slice(i, j) + '</g>' + svg.slice(j);
}

const UNIT: Record<string, number> = { pt: 1, px: 1, mm: 72 / 25.4, in: 72 };
const EXT: Record<string, string> = { pdf: '.pdf', png: '.png', jpg: '.jpg', svg: '.svg', webp: '.webp' };
let n = 0;

function filesIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...filesIn(p)); else if (!f.startsWith('.')) out.push(p);
  }
  return out.sort();
}
const safe = (s: string) => s.replace(/[\/\\:*?"<>|]+/g, '_').trim() || 'artboard';

export const export_tool: ToolDef = {
  name: 'export',
  description: `Export the active document (it stays unchanged).
format: "pdf" | "png" | "jpg" | "svg" | "webp". artboards: [indices] | "all" (default: the active artboard). refs: export just these items (png only).
path: a file, or a folder (several outputs: <document>-<artboard>.<ext>; with a file path <stem>-<artboard>.<ext>).
PDF: preset (default "[PDF/X-4:2008]"; any name from Illustrator's PDF presets), pages "one_file" (default) | "per_artboard",
bleed: "document" (default: its bleed if known) | number | [left, top, right, bottom] in session units → pages grow by it, TrimBox = artboard, BleedBox = page. Warns about variable fonts (B10).
Raster: scale (factor, default 1) | dpi | width (px); background "white" | "transparent" (png, webp); jpg is quality 80. SVG is clipped to the artboard; svg_text "outline" | "text".
Returns {files:[{path, artboards, bytes, pages?, pdfx?, boxes?}]}.`,
  shape: {
    format: z.enum(['pdf', 'png', 'jpg', 'svg', 'webp']),
    path: z.string(),
    artboards: z.union([z.array(z.number().min(0)), z.literal('all')]).optional(),
    refs: refSchema.optional(),
    preset: z.string().optional(),
    pages: z.enum(['one_file', 'per_artboard']).optional(),
    bleed: z.union([z.literal('document'), z.number().min(0), z.array(z.number().min(0)).length(4)]).optional(),
    scale: z.number().positive().optional(), dpi: z.number().positive().optional(), width: z.number().positive().optional(),
    background: z.enum(['white', 'transparent']).optional(),
    svg_text: z.enum(['outline', 'text']).optional(),
  },
  async run(a, { T, rt, tmp, settings }) {
    const target = resolve(a.path);
    const ext = EXT[a.format];
    const warnings: string[] = [];
    if (settings.activate) await T.call('activate');

    // items → PNG via the preview capture
    if (a.refs !== undefined) {
      if (a.format !== 'png') return fail('refs export works for png only (use artboards for other formats).');
      const file = extname(target) ? target : join(target, 'items.png');
      mkdirSync(dirname(file), { recursive: true });
      const env = await rt.cmd<any>('preview', { refs: a.refs, path: file, dpi: a.dpi ?? 72 * (a.scale ?? 1), background: a.background, pad: 0 });
      if (!env.ok) return { content: [{ type: 'text', text: errorText(env) }], isError: true };
      if (env.data.resize_to) {
        const px = env.data.px as number[];
        try {
          const got = shrinkPngFile(file, env.data.resize_to);
          env.data.px = [got.w, got.h];
          env.data.scale = Math.round(env.data.scale * got.w / px[0] * 1000) / 1000;
        } catch { /* keep the larger image */ }
        delete env.data.resize_to;
      }
      return text({ files: [{ path: file, bytes: statSync(file).size, ...env.data }] });
    }

    const prep = await rt.cmd<any>('export_prep', { artboards: a.artboards, format: a.format });
    if (!prep.ok) return { content: [{ type: 'text', text: errorText(prep) }], isError: true };
    const P = prep.data;
    // bleed in pt
    let bleed: Bleed | null = null;
    if (a.format === 'pdf') {
      const k = UNIT[settings.units] ?? 1;
      if (typeof a.bleed === 'number') bleed = { left: a.bleed * k, top: a.bleed * k, right: a.bleed * k, bottom: a.bleed * k };
      else if (Array.isArray(a.bleed)) bleed = { left: a.bleed[0] * k, top: a.bleed[1] * k, right: a.bleed[2] * k, bottom: a.bleed[3] * k };
      else {
        bleed = P.bleed;
        if (!bleed && P.path && /\.ai$/i.test(P.path)) {
          try { bleed = await readAiBleed(P.path); if (bleed && !P.saved) warnings.push('Bleed read from the saved file; unsaved changes to it are not included.'); } catch { /* unknown */ }
        }
      }
      if (bleed && !(bleed.left || bleed.top || bleed.right || bleed.bottom)) bleed = null;
      if (P.variable_fonts.length) warnings.push(`Variable fonts in use (${P.variable_fonts.join(', ')}): Illustrator names their instances after the default instance in PDFs (B10). Check the fonts in the PDF; outline the text if a print shop rejects it.`);
    }
    const dir = join(tmp, `export${++n}`);
    rmSync(dir, { recursive: true, force: true });
    const oneFile = a.format === 'pdf' && (a.pages ?? 'one_file') === 'one_file';
    const env = await rt.cmd<any>('export', {
      format: a.format, artboards: a.artboards, dir, one_file: oneFile, preset: a.format === 'pdf' ? (a.preset ?? '[PDF/X-4:2008]') : undefined,
      bleed_pt: bleed ? [bleed.left, bleed.top, bleed.right, bleed.bottom] : null,
      scale: a.scale, dpi: a.dpi, width: a.width, background: a.background, svg_text: a.svg_text,
    }, { timeout: Math.max(settings.timeout, 600) });
    if (!env.ok) return { content: [{ type: 'text', text: errorText(env) }], isError: true };

    // collect files per output folder
    const produced: { file: string; artboards: number[] }[] = [];
    for (const o of env.data.outputs as { sub: string; artboards: number[] }[]) {
      const fs = filesIn(join(dir, o.sub));
      if (!fs.length) return fail(`Illustrator wrote no file for artboard(s) ${o.artboards.join(',')} (check the preset name: ${J(a.preset ?? '[PDF/X-4:2008]')}).`);
      produced.push({ file: fs[0], artboards: o.artboards });
    }
    const nameOf = (i: number) => safe(P.boards.find((b: any) => b.i === i)?.name ?? String(i));
    const docStem = safe(P.doc.replace(/\.[^.]+$/, ''));
    let outputs: { src: string; artboards: number[] }[] = produced.map((p) => ({ src: p.file, artboards: p.artboards }));
    if (oneFile && produced.length > 1) {
      const merged = join(dir, 'merged.pdf');
      await mergePdfs(produced.map((p) => p.file), merged);
      outputs = [{ src: merged, artboards: produced.flatMap((p) => p.artboards) }];
    }
    const isFile = extname(target).toLowerCase() === ext;
    const results: any[] = [];
    for (const o of outputs) {
      let dest: string;
      if (outputs.length === 1 && isFile) dest = target;
      else if (isFile) dest = join(dirname(target), `${basename(target, ext)}-${nameOf(o.artboards[0])}${ext}`);
      else dest = join(target, outputs.length === 1 && o.artboards.length > 1 ? `${docStem}${ext}` : `${docStem}-${nameOf(o.artboards[0])}${ext}`);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(o.src, dest);
      // always normalise PDF boxes: also removes a document bleed a preset added when bleed 0 was asked for
      if (a.format === 'pdf') await setBleedBoxes(dest, bleed ?? { left: 0, top: 0, right: 0, bottom: 0 });
      if (a.format === 'svg') writeFileSync(dest, clipSvgToViewBox(readFileSync(dest, 'utf8')));
      const r: any = { path: dest, artboards: o.artboards, bytes: statSync(dest).size };
      if (a.format === 'pdf') { const info = await pdfInfo(dest); Object.assign(r, { pages: info.pages, pdfx: info.pdfx, boxes: info.boxes }); }
      results.push(r);
    }
    rmSync(dir, { recursive: true, force: true });
    const res: any = { files: results };
    if (a.format === 'pdf') res.bleed_pt = bleed ?? 0;
    if (warnings.length) res.warnings = warnings;
    return text(res);
  },
};
