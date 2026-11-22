// PDF post-processing with pdf-lib: merge per-artboard PDFs, set TrimBox/BleedBox after a bleed export, measure boxes.
import { readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import type { Bleed } from './aifile.js';

export type Box = [number, number, number, number]; // x, y, w, h (PDF points, origin bottom-left)
export interface PageBoxes { media: Box; trim: Box; bleed: Box }

const box = (r: { x: number; y: number; width: number; height: number }): Box =>
  [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 1000) / 1000) as Box;

/** Append the pages of the other files to the first one (its catalog, incl. PDF/X OutputIntents, is kept). */
export async function mergePdfs(files: string[], out: string): Promise<void> {
  const first = await PDFDocument.load(readFileSync(files[0]), { updateMetadata: false });
  for (const f of files.slice(1)) {
    const src = await PDFDocument.load(readFileSync(f), { updateMetadata: false });
    const pages = await first.copyPages(src, src.getPageIndices());
    for (const p of pages) first.addPage(p);
  }
  writeFileSync(out, await first.save({ useObjectStreams: false, updateFieldAppearances: false }));
}

/**
 * Normalise the page boxes after an export where every artboard was grown by the bleed b.
 * Illustrator's TrimBox is the (grown) artboard; presets may add the DOCUMENT bleed around it (PDF/X-4 does).
 * Result: MediaBox = CropBox = BleedBox = grown artboard (artboard + b), TrimBox = original artboard.
 * Works whatever the document bleed is, known or not.
 */
export async function setBleedBoxes(file: string, b: Bleed): Promise<void> {
  const doc = await PDFDocument.load(readFileSync(file), { updateMetadata: false });
  for (const p of doc.getPages()) {
    const t = p.getTrimBox();
    p.setMediaBox(t.x, t.y, t.width, t.height);
    p.setCropBox(t.x, t.y, t.width, t.height);
    p.setBleedBox(t.x, t.y, t.width, t.height);
    p.setTrimBox(t.x + b.left, t.y + b.bottom, t.width - b.left - b.right, t.height - b.top - b.bottom);
  }
  writeFileSync(file, await doc.save({ useObjectStreams: false, updateFieldAppearances: false }));
}

export async function pdfInfo(file: string): Promise<{ pages: number; version: string; pdfx: string | null; boxes: PageBoxes[] }> {
  const bytes = readFileSync(file);
  const s = bytes.subarray(0, Math.min(bytes.length, 4_000_000)).toString('latin1');
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return {
    pages: doc.getPageCount(),
    version: s.slice(5, 8),
    pdfx: /GTS_PDFXVersion\s*\(([^)]*)\)/.exec(s)?.[1] ?? /GTS_PDFXVersion>([^<]*)</.exec(s)?.[1] ?? null,
    boxes: doc.getPages().map((p) => ({ media: box(p.getMediaBox()), trim: box(p.getTrimBox()), bleed: box(p.getBleedBox()) })),
  };
}
