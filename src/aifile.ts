// Reading Illustrator's own data from a saved .ai file (PDF-compatible .ai). Used for the document bleed, which
// the scripting API can set (DocumentPreset.documentBleedOffset) but not read (quirk A6/B4).
// The private data ("AIPrivateData1..n" streams) is a PostScript-like dump, zstd- (AI24+) or zlib-compressed;
// its document dictionary holds "%_<value> /Real (BleedLeftValue)" etc. Verified on 29.1, 2026-11-22.
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { PDFDocument, PDFDict, PDFName, PDFRawStream } from 'pdf-lib';

export interface Bleed { left: number; top: number; right: number; bottom: number }

export async function aiPrivateText(path: string): Promise<string | null> {
  const doc = await PDFDocument.load(readFileSync(path), { updateMetadata: false, ignoreEncryption: true });
  let holder: PDFDict | null = null;
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict && obj.get(PDFName.of('AIPrivateData1'))) { holder = obj; break; }
  }
  if (!holder) return null;
  const parts: Buffer[] = [];
  for (let i = 1; ; i++) {
    const ref = holder.get(PDFName.of('AIPrivateData' + i));
    if (!ref) break;
    const s = doc.context.lookup(ref);
    if (s instanceof PDFRawStream) parts.push(Buffer.from(s.contents));
  }
  const buf = Buffer.concat(parts);
  const head = buf.subarray(0, 64).toString('latin1');
  const zi = head.indexOf('ZStandard_Data'), ci = head.indexOf('CompressedData');
  if (zi >= 0) return (zlib as any).zstdDecompressSync(buf.subarray(zi + 14)).toString('latin1');
  if (ci >= 0) return zlib.inflateSync(buf.subarray(ci + 14)).toString('latin1');
  return buf.toString('latin1');
}

const num = (t: string, key: string): number | null => {
  const i = t.indexOf(`/Real (${key})`);
  if (i < 0) return null;
  const m = /%_([-\d.eE]+) $/.exec(t.slice(Math.max(0, i - 40), i));
  return m ? Number(m[1]) : null;
};

/** Document bleed in pt from a saved .ai file, or null if not found. */
export async function readAiBleed(path: string): Promise<Bleed | null> {
  const t = await aiPrivateText(path);
  if (!t) return null;
  const v = ['BleedLeftValue', 'BleedTopValue', 'BleedRightValue', 'BleedBottomValue'].map((k) => num(t, k));
  if (v.some((x) => x === null)) return null;
  return { left: v[0]!, top: v[1]!, right: v[2]!, bottom: v[3]! };
}
