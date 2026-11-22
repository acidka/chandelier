// Minimal PNG codec (no dependencies: Node's zlib) and image comparison for preview {reference}.
// Decodes 8-bit non-interlaced PNGs (grey, grey+alpha, RGB, RGBA, palette) with all five row filters;
// encodes 8-bit RGB. Reference JPEGs are converted to PNG with macOS `sips` before decoding.
import zlib from 'node:zlib';

export interface Img { w: number; h: number; rgb: Uint8Array } // 3 bytes per pixel, alpha composited on white

/** A pixel darker than this counts as content (text, rules), so paper tones, JPEG noise and light tints don't. */
const INK = 150;
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function decodePng(buf: Buffer): Img {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG file');
  let pos = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0, palette: Buffer | null = null, trns: Buffer | null = null;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), kind = buf.toString('latin1', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (kind === 'PLTE') palette = data;
    else if (kind === 'tRNS') trns = data;
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || interlace) throw new Error(`unsupported PNG (bit depth ${depth}, interlace ${interlace}): only 8-bit non-interlaced`);
  const ch = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[type];
  if (!ch) throw new Error('unsupported PNG colour type ' + type);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[dst + x - ch] : 0, b = y ? px[dst - stride + x] : 0, c = x >= ch && y ? px[dst - stride + x - ch] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : (pb <= pc ? b : c); }
      px[dst + x] = v & 255;
    }
  }
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    let r: number, g: number, bl: number, al = 255;
    if (type === 0) r = g = bl = px[i];
    else if (type === 4) { r = g = bl = px[i * 2]; al = px[i * 2 + 1]; }
    else if (type === 2) { r = px[i * 3]; g = px[i * 3 + 1]; bl = px[i * 3 + 2]; }
    else if (type === 6) { r = px[i * 4]; g = px[i * 4 + 1]; bl = px[i * 4 + 2]; al = px[i * 4 + 3]; }
    else { const k = px[i]; r = palette![k * 3]; g = palette![k * 3 + 1]; bl = palette![k * 3 + 2]; if (trns && k < trns.length) al = trns[k]; }
    const m = al / 255; // composite on white
    rgb[i * 3] = Math.round(r * m + 255 * (1 - m)); rgb[i * 3 + 1] = Math.round(g * m + 255 * (1 - m)); rgb[i * 3 + 2] = Math.round(bl * m + 255 * (1 - m));
  }
  return { w, h, rgb };
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b: Buffer): number { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(kind: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(kind, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
export function encodePng(img: Img): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.w, 0); ihdr.writeUInt32BE(img.h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const stride = img.w * 3, raw = Buffer.alloc((stride + 1) * img.h);
  for (let y = 0; y < img.h; y++) Buffer.from(img.rgb.buffer, img.rgb.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

export interface Comparison {
  composite: Img;            // reference | preview | difference (red = different)
  rmse: number;              // 0 = identical … 1
  ink: { reference: number[]; preview: number[] } | null; // bounding box of non-white pixels [x, y, w, h] as fractions of the page
  regions: { cell: [number, number]; diff: number }[];    // 4×4 grid cells (col, row) with the largest mean difference
}

/** Compare two images of the same size. */
export function compare(ref: Img, prev: Img, grid = 4): Comparison {
  if (ref.w !== prev.w || ref.h !== prev.h) throw new Error('images differ in size');
  const { w, h } = ref, gap = Math.max(4, Math.round(w / 100));
  const cw = w * 3 + gap * 2, out = new Uint8Array(cw * h * 3).fill(255);
  let sq = 0;
  const cells = new Float64Array(grid * grid), counts = new Float64Array(grid * grid);
  // a 1 % margin is ignored: photographed or cropped references often carry an edge shadow or border
  const mx = Math.max(2, Math.round(w / 100)), my = Math.max(2, Math.round(h / 100));
  const bb = (img: Img) => { let x0 = w, y0 = h, x1 = -1, y1 = -1; for (let y = my; y < h - my; y++) for (let x = mx; x < w - mx; x++) { const i = (y * w + x) * 3; if (Math.min(img.rgb[i], img.rgb[i + 1], img.rgb[i + 2]) < INK) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } } return x1 < 0 ? null : [x0 / w, y0 / h, (x1 - x0 + 1) / w, (y1 - y0 + 1) / h].map((v) => Math.round(v * 1000) / 1000); };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      let d = 0;
      for (let k = 0; k < 3; k++) { const e = ref.rgb[i + k] - prev.rgb[i + k]; d += Math.abs(e); sq += e * e; }
      d /= 3;
      const ci = Math.min(grid - 1, Math.floor(y * grid / h)) * grid + Math.min(grid - 1, Math.floor(x * grid / w));
      cells[ci] += d; counts[ci]++;
      const o = (y * cw + x) * 3, o2 = (y * cw + x + w + gap) * 3, o3 = (y * cw + x + 2 * (w + gap)) * 3;
      for (let k = 0; k < 3; k++) { out[o + k] = ref.rgb[i + k]; out[o2 + k] = prev.rgb[i + k]; }
      const t = Math.min(255, d * 3);
      out[o3] = 255; out[o3 + 1] = 255 - t; out[o3 + 2] = 255 - t;
    }
  }
  const regions = Array.from(cells, (s, i) => ({ cell: [i % grid, Math.floor(i / grid)] as [number, number], diff: Math.round(s / counts[i] / 255 * 1000) / 1000 }))
    .sort((a, b) => b.diff - a.diff).slice(0, 3);
  const ri = bb(ref), pi = bb(prev);
  return { composite: { w: cw, h, rgb: out }, rmse: Math.round(Math.sqrt(sq / (w * h * 3)) / 255 * 1000) / 1000, ink: ri && pi ? { reference: ri, preview: pi } : null, regions };
}
