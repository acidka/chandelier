// Colour mode of an image file from its header (linked images in a CMYK document: RGB ones are a print issue).
import { openSync, readSync, closeSync } from 'node:fs';

export type ColorMode = 'rgb' | 'cmyk' | 'gray' | 'indexed' | 'unknown';

function head(path: string, n: number): Buffer {
  const fd = openSync(path, 'r');
  try { const b = Buffer.alloc(n); const got = readSync(fd, b, 0, n, 0); return b.subarray(0, got); } finally { closeSync(fd); }
}

export function imageColorMode(path: string): ColorMode {
  const b = head(path, 256 * 1024);
  // PNG: IHDR colour type at byte 25 (0 gray, 2 RGB, 3 indexed, 4 gray+alpha, 6 RGBA)
  if (b.length > 26 && b.readUInt32BE(0) === 0x89504e47) return ({ 0: 'gray', 2: 'rgb', 3: 'indexed', 4: 'gray', 6: 'rgb' } as Record<number, ColorMode>)[b[25]] ?? 'unknown';
  // PSD: "8BPS", colour mode (uint16) at byte 24 (1 gray, 2 indexed, 3 RGB, 4 CMYK)
  if (b.length > 26 && b.toString('latin1', 0, 4) === '8BPS') return ({ 1: 'gray', 2: 'indexed', 3: 'rgb', 4: 'cmyk' } as Record<number, ColorMode>)[b.readUInt16BE(24)] ?? 'unknown';
  // JPEG: component count in the first SOFn segment (1 gray, 3 RGB/YCbCr, 4 CMYK/YCCK)
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1], len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return ({ 1: 'gray', 3: 'rgb', 4: 'cmyk' } as Record<number, ColorMode>)[b[i + 9]] ?? 'unknown';
      i += 2 + len;
    }
  }
  return 'unknown';
}
