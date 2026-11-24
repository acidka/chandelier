// PDF post-processing with pdf-lib: merge per-artboard PDFs, set TrimBox/BleedBox after a bleed export, measure boxes.
import { readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument, PDFName, PDFString, PDFArray, PDFDict, PDFHexString } from 'pdf-lib';
import { conditionId, type Icc } from './icc.js';
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

/** Replace the PDF/X output intent with an ICC profile (0.4). The colour numbers are not converted: the intent tells
 * the printer which press condition the CMYK values were made for. */
export async function setOutputIntent(file: string, icc: Icc): Promise<void> {
  const doc = await PDFDocument.load(readFileSync(file), { updateMetadata: false });
  const bytes = readFileSync(icc.path);
  const n = icc.space === 'CMYK' ? 4 : icc.space === 'GRAY' ? 1 : 3;
  const profile = doc.context.register(doc.context.flateStream(bytes, { N: n }));
  const intent = doc.context.obj({
    Type: 'OutputIntent', S: 'GTS_PDFX',
    OutputConditionIdentifier: PDFString.of(conditionId(icc.name)), OutputCondition: PDFString.of(icc.name),
    RegistryName: PDFString.of('http://www.color.org'), Info: PDFString.of(icc.name), DestOutputProfile: profile,
  });
  doc.catalog.set(PDFName.of('OutputIntents'), doc.context.obj([intent]));
  writeFileSync(file, await doc.save({ useObjectStreams: false, updateFieldAppearances: false }));
}

function outputIntentOf(doc: PDFDocument): string | null {
  const arr = doc.catalog.lookupMaybe(PDFName.of('OutputIntents'), PDFArray);
  const d = arr?.size() ? arr.lookupMaybe(0, PDFDict) : undefined;
  if (!d) return null;
  for (const k of ['Info', 'OutputCondition', 'OutputConditionIdentifier']) {
    const v = d.get(PDFName.of(k));
    if (v instanceof PDFString || v instanceof PDFHexString) { const t = v.decodeText().trim(); if (t) return t; }
  }
  return null;
}

export async function pdfInfo(file: string): Promise<{ pages: number; version: string; pdfx: string | null; output_intent: string | null; boxes: PageBoxes[] }> {
  const bytes = readFileSync(file);
  const s = bytes.subarray(0, Math.min(bytes.length, 4_000_000)).toString('latin1');
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return {
    pages: doc.getPageCount(),
    version: s.slice(5, 8),
    pdfx: /GTS_PDFXVersion\s*\(([^)]*)\)/.exec(s)?.[1] ?? /GTS_PDFXVersion>([^<]*)</.exec(s)?.[1] ?? null,
    output_intent: outputIntentOf(doc),
    boxes: doc.getPages().map((p) => ({ media: box(p.getMediaBox()), trim: box(p.getTrimBox()), bleed: box(p.getBleedBox()) })),
  };
}
