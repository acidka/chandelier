// Image work without platform tools (phase 7 W3: no macOS `sips`): a PNG codec on Node's zlib, JPEG decoding with
// jpeg-js (pure JS), crop and area-average resize, and the comparison behind preview {reference}.
// PNG: 8- and 16-bit, non-interlaced, grey / grey+alpha / RGB / RGBA / palette, all five row filters; encodes 8-bit
// RGB or RGBA. Other formats (HEIC, TIFF, WebP, interlaced PNG) are not decoded here: callers may convert them with a
// platform tool first (see decodeImage).
import zlib from 'node:zlib';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import jpeg from 'jpeg-js';

/** rgb: 3 bytes per pixel, alpha composited on white; a: optional alpha (1 byte per pixel) for transparent images */
export interface Img { w: number; h: number; rgb: Uint8Array; a?: Uint8Array }

/** A pixel darker than this counts as content (text, rules), so paper tones, JPEG noise and light tints don't. */
/** compare(): a pixel is content when a channel differs from the image's own background by more than this */
const INK_DIFF = 40;
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
  if ((depth !== 8 && depth !== 16) || (depth === 16 && type === 3) || interlace) throw new Error(`unsupported PNG (bit depth ${depth}, interlace ${interlace}): 8- or 16-bit, non-interlaced`);
  const ch0 = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[type];
  if (!ch0) throw new Error('unsupported PNG colour type ' + type);
  const bpp = ch0 * depth / 8; // bytes per pixel (the filter unit)
  const raw = zlib.inflateSync(Buffer.concat(idat)), rstride = w * bpp, full = Buffer.alloc(rstride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (rstride + 1)], src = y * (rstride + 1) + 1, dst = y * rstride;
    for (let x = 0; x < rstride; x++) {
      const a = x >= bpp ? full[dst + x - bpp] : 0, b = y ? full[dst - rstride + x] : 0, c = x >= bpp && y ? full[dst - rstride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : (pb <= pc ? b : c); }
      full[dst + x] = v & 255;
    }
  }
  // 16-bit: keep the high byte of each sample
  const ch = ch0, px = depth === 16 ? Buffer.alloc(w * h * ch) : full;
  if (depth === 16) for (let i = 0; i < px.length; i++) px[i] = full[i * 2];
  const rgb = new Uint8Array(w * h * 3), alpha = type === 4 || type === 6 || trns ? new Uint8Array(w * h) : undefined;
  for (let i = 0; i < w * h; i++) {
    let r: number, g: number, bl: number, al = 255;
    if (type === 0) r = g = bl = px[i];
    else if (type === 4) { r = g = bl = px[i * 2]; al = px[i * 2 + 1]; }
    else if (type === 2) { r = px[i * 3]; g = px[i * 3 + 1]; bl = px[i * 3 + 2]; }
    else if (type === 6) { r = px[i * 4]; g = px[i * 4 + 1]; bl = px[i * 4 + 2]; al = px[i * 4 + 3]; }
    else { const k = px[i]; r = palette![k * 3]; g = palette![k * 3 + 1]; bl = palette![k * 3 + 2]; if (trns && k < trns.length) al = trns[k]; }
    if (alpha) alpha[i] = al;
    const m = al / 255; // composite on white
    rgb[i * 3] = Math.round(r * m + 255 * (1 - m)); rgb[i * 3 + 1] = Math.round(g * m + 255 * (1 - m)); rgb[i * 3 + 2] = Math.round(bl * m + 255 * (1 - m));
  }
  return alpha ? { w, h, rgb, a: alpha } : { w, h, rgb };
}

export function decodeJpeg(buf: Buffer): Img {
  const d = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024, maxResolutionInMP: 200 });
  const n = d.width * d.height, rgb = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) { rgb[i * 3] = d.data[i * 4]; rgb[i * 3 + 1] = d.data[i * 4 + 1]; rgb[i * 3 + 2] = d.data[i * 4 + 2]; }
  return { w: d.width, h: d.height, rgb };
}

/** 'png' | 'jpeg' | null from the first bytes. */
export function sniff(buf: Buffer): 'png' | 'jpeg' | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(SIG)) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  return null;
}

/** Decode a PNG or JPEG. Throws for anything else (the caller may convert it with a platform tool and retry). */
export function decodeImage(buf: Buffer): Img {
  const k = sniff(buf);
  if (k === 'png') return decodePng(buf);
  if (k === 'jpeg') return decodeJpeg(buf);
  throw new Error('not a PNG or JPEG image');
}

/** Cut [x, y, w, h] (pixels, clamped to the image). */
export function crop(img: Img, x: number, y: number, w: number, h: number): Img {
  const x0 = Math.max(0, Math.min(img.w - 1, Math.round(x))), y0 = Math.max(0, Math.min(img.h - 1, Math.round(y)));
  const cw = Math.max(1, Math.min(img.w - x0, Math.round(w))), chh = Math.max(1, Math.min(img.h - y0, Math.round(h)));
  const rgb = new Uint8Array(cw * chh * 3), a = img.a ? new Uint8Array(cw * chh) : undefined;
  for (let r = 0; r < chh; r++) {
    rgb.set(img.rgb.subarray(((y0 + r) * img.w + x0) * 3, ((y0 + r) * img.w + x0 + cw) * 3), r * cw * 3);
    if (a) a.set(img.a!.subarray((y0 + r) * img.w + x0, (y0 + r) * img.w + x0 + cw), r * cw);
  }
  return a ? { w: cw, h: chh, rgb, a } : { w: cw, h: chh, rgb };
}

/** Cut [x, y, w, h] (pixels, may lie partly outside): the outside is white. */
export function cropPad(img: Img, x: number, y: number, w: number, h: number): Img {
  const W = Math.max(1, Math.round(w)), H = Math.max(1, Math.round(h)), X = Math.round(x), Y = Math.round(y);
  const rgb = new Uint8Array(W * H * 3).fill(255);
  for (let r = 0; r < H; r++) {
    const sy = Y + r; if (sy < 0 || sy >= img.h) continue;
    const x0 = Math.max(0, X), x1 = Math.min(img.w, X + W); if (x1 <= x0) continue;
    rgb.set(img.rgb.subarray((sy * img.w + x0) * 3, (sy * img.w + x1) * 3), (r * W + (x0 - X)) * 3);
  }
  return { w: W, h: H, rgb };
}

/** Resize to exactly w × h: area averaging (each target pixel = the mean of the source area it covers), good for
 * downscaling and fine for the mild upscaling a reference may need. */
export function resize(img: Img, w: number, h: number): Img {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  if (w === img.w && h === img.h) return img;
  const sx = img.w / w, sy = img.h / h, rgb = new Uint8Array(w * h * 3), a = img.a ? new Uint8Array(w * h) : undefined;
  for (let ty = 0; ty < h; ty++) {
    const fy0 = ty * sy, fy1 = Math.min(img.h, fy0 + Math.max(sy, 1)), y0 = Math.floor(fy0), y1 = Math.min(img.h - 1, Math.ceil(fy1) - 1);
    for (let tx = 0; tx < w; tx++) {
      const fx0 = tx * sx, fx1 = Math.min(img.w, fx0 + Math.max(sx, 1)), x0 = Math.floor(fx0), x1 = Math.min(img.w - 1, Math.ceil(fx1) - 1);
      let r = 0, g = 0, b = 0, al = 0, wt = 0;
      for (let y = y0; y <= y1; y++) {
        const wy = Math.min(y + 1, fy1) - Math.max(y, fy0);
        if (wy <= 0) continue;
        for (let x = x0; x <= x1; x++) {
          const wx = Math.min(x + 1, fx1) - Math.max(x, fx0);
          if (wx <= 0) continue;
          const k = wx * wy, i = y * img.w + x;
          r += img.rgb[i * 3] * k; g += img.rgb[i * 3 + 1] * k; b += img.rgb[i * 3 + 2] * k; if (a) al += img.a![i] * k; wt += k;
        }
      }
      const o = ty * w + tx;
      rgb[o * 3] = Math.round(r / wt); rgb[o * 3 + 1] = Math.round(g / wt); rgb[o * 3 + 2] = Math.round(b / wt);
      if (a) a[o] = Math.round(al / wt);
    }
  }
  return a ? { w, h, rgb, a } : { w, h, rgb };
}

/** Scale so the longest side is `max` (never up). */
export function fitLongest(img: Img, max: number): Img {
  const k = max / Math.max(img.w, img.h);
  return k >= 1 ? img : resize(img, img.w * k, img.h * k);
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b: Buffer): number { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(kind: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(kind, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
/** 8-bit RGB, or RGBA when the image has alpha (the stored rgb is composited on white, so it is un-composited). */
export function encodePng(img: Img): Buffer {
  const ihdr = Buffer.alloc(13), ch = img.a ? 4 : 3;
  ihdr.writeUInt32BE(img.w, 0); ihdr.writeUInt32BE(img.h, 4); ihdr[8] = 8; ihdr[9] = img.a ? 6 : 2;
  const stride = img.w * ch, raw = Buffer.alloc((stride + 1) * img.h);
  for (let y = 0; y < img.h; y++) {
    if (!img.a) { Buffer.from(img.rgb.buffer, img.rgb.byteOffset + y * img.w * 3, img.w * 3).copy(raw, y * (stride + 1) + 1); continue; }
    for (let x = 0; x < img.w; x++) {
      const i = y * img.w + x, o = y * (stride + 1) + 1 + x * 4, al = img.a[i], m = al / 255;
      for (let k = 0; k < 3; k++) raw[o + k] = m > 0 ? Math.max(0, Math.min(255, Math.round((img.rgb[i * 3 + k] - 255 * (1 - m)) / m))) : 0;
      raw[o + 3] = al;
    }
  }
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
  // content = pixels clearly different from the image's own background (median of its border): a photo of a box on
  // a table has a light background and a kraft panel, so "darker than 150" found the whole photo (bug #8)
  const bb = (img: Img) => {
    const ch: number[][] = [[], [], []], st = Math.max(1, Math.floor((w + h) / 400));
    const take = (x: number, y: number) => { const i = (y * w + x) * 3; for (let k = 0; k < 3; k++) ch[k].push(img.rgb[i + k]); };
    for (let x = 0; x < w; x += st) { take(x, my); take(x, h - 1 - my); }
    for (let y = 0; y < h; y += st) { take(mx, y); take(w - 1 - mx, y); }
    const bg = ch.map((a) => a.sort((p, q) => p - q)[a.length >> 1]);
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = my; y < h - my; y++) for (let x = mx; x < w - mx; x++) {
      const i = (y * w + x) * 3;
      if (Math.max(Math.abs(img.rgb[i] - bg[0]), Math.abs(img.rgb[i + 1] - bg[1]), Math.abs(img.rgb[i + 2] - bg[2])) > INK_DIFF) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    return x1 < 0 ? null : [x0 / w, y0 / h, (x1 - x0 + 1) / w, (y1 - y0 + 1) / h].map((v) => Math.round(v * 1000) / 1000);
  };
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

/** Read an image file. PNG and JPEG are decoded here on every platform; other formats (HEIC, TIFF, WebP, interlaced
 * PNG…) are converted to PNG with macOS `sips` first when it exists. */
export async function readImage(path: string, tmpPng: string): Promise<Img> {
  const buf = readFileSync(path);
  try { return decodeImage(buf); } catch (e) {
    if (process.platform !== 'darwin') throw new Error(`${(e as Error).message}: use a PNG or JPEG image`);
    try {
      await promisify(execFile)('sips', ['-s', 'format', 'png', path, '--out', tmpPng]);
      return decodePng(readFileSync(tmpPng));
    } catch { throw new Error(`cannot read ${path}: use a PNG or JPEG image`); }
    finally { rmSync(tmpPng, { force: true }); }
  }
}

/** Shrink a PNG file in place so its longest side is `max`. */
export function shrinkPngFile(path: string, max: number): { w: number; h: number } {
  const img = fitLongest(decodePng(readFileSync(path)), max);
  writeFileSync(path, encodePng(img));
  return { w: img.w, h: img.h };
}

/** A difference between reference and preview (0.4 visual diff). box: fractions [x, y, w, h] of the page. */
export interface DiffRegion {
  box: number[];
  kind: 'shifted' | 'missing' | 'extra' | 'changed'; // shifted: the same content, moved by shift; missing: only in the reference; extra: only in the preview
  shift?: [number, number];                          // fractions of the page width / height (preview − reference)
  diff: number;                                      // mean difference in the box, 0…1
}

/** Find the regions where two same-size images differ: 8-connected blobs of different blocks, each classified, and
 * for moved content the local shift (search ±5 % of the page, coarse to fine). Largest first. */
export function diffRegions(ref: Img, prev: Img, max = 6): DiffRegion[] {
  const { w, h } = ref;
  if (prev.w !== w || prev.h !== h) throw new Error('images differ in size');
  const gray = (img: Img) => { const g = new Float32Array(w * h); for (let i = 0; i < w * h; i++) g[i] = (img.rgb[i * 3] * 0.299 + img.rgb[i * 3 + 1] * 0.587 + img.rgb[i * 3 + 2] * 0.114); return g; };
  const A = gray(ref), Bg = gray(prev);
  const B = Math.max(4, Math.round(Math.max(w, h) / 80)), bw = Math.ceil(w / B), bh = Math.ceil(h / B);
  const mx = Math.max(2, Math.round(w / 100)), my = Math.max(2, Math.round(h / 100));
  const on = new Uint8Array(bw * bh), sum = new Float64Array(bw * bh);
  for (let y = my; y < h - my; y++) for (let x = mx; x < w - mx; x++) {
    const d = Math.abs(A[y * w + x] - Bg[y * w + x]), k = Math.floor(y / B) * bw + Math.floor(x / B);
    sum[k] += d;
    if (d > 48) on[k]++;
  }
  const lit = new Uint8Array(bw * bh);
  for (let k = 0; k < bw * bh; k++) if (on[k] > B * B * 0.03) lit[k] = 1;
  // blobs: 8-connected, one block of gap bridged (letters of a word, parts of a block)
  const seen = new Int32Array(bw * bh).fill(-1), blobs: { x0: number; y0: number; x1: number; y1: number; n: number; s: number }[] = [];
  for (let k = 0; k < bw * bh; k++) {
    if (!lit[k] || seen[k] >= 0) continue;
    const id = blobs.length, st = [k], b = { x0: bw, y0: bh, x1: -1, y1: -1, n: 0, s: 0 };
    seen[k] = id;
    while (st.length) {
      const c = st.pop()!, cx = c % bw, cy = Math.floor(c / bw);
      b.x0 = Math.min(b.x0, cx); b.y0 = Math.min(b.y0, cy); b.x1 = Math.max(b.x1, cx); b.y1 = Math.max(b.y1, cy); b.n++; b.s += sum[c];
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
        const q = ny * bw + nx;
        if (lit[q] && seen[q] < 0) { seen[q] = id; st.push(q); }
      }
    }
    blobs.push(b);
  }
  // content = anything clearly not paper (light colours count too; a dark-only threshold missed a mid green)
  const ink = (img: Img, x0: number, y0: number, x1: number, y1: number) => { let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 3; if (Math.min(img.rgb[i], img.rgb[i + 1], img.rgb[i + 2]) < 225) n++; } return n; };
  const S = Math.max(2, Math.min(60, Math.round(Math.max(w, h) * 0.05)));
  const sad = (x0: number, y0: number, x1: number, y1: number, dx: number, dy: number, step: number) => {
    let s = 0, n = 0;
    for (let y = y0; y < y1; y += step) {
      const py = y + dy; if (py < 0 || py >= h) { n++; s += 255; continue; }
      for (let x = x0; x < x1; x += step) { const px = x + dx; s += px < 0 || px >= w ? 255 : Math.abs(A[y * w + x] - Bg[py * w + px]); n++; }
    }
    return n ? s / n : 0;
  };
  const out: (DiffRegion & { weight: number })[] = [];
  for (const b of blobs) {
    if (b.n < 2) continue;
    const x0 = b.x0 * B, y0 = b.y0 * B, x1 = Math.min(w, (b.x1 + 1) * B), y1 = Math.min(h, (b.y1 + 1) * B);
    const meanD = b.s / ((x1 - x0) * (y1 - y0)) / 255;
    if (meanD < 0.03) continue; // anti-aliasing and rendering noise (export vs screen capture), not a difference
    const iR = ink(ref, x0, y0, x1, y1), iP = ink(prev, x0, y0, x1, y1);
    // local shift: the reference content (box) against the preview moved by (dx, dy)
    const base = sad(x0, y0, x1, y1, 0, 0, 1);
    let best = base, bx = 0, by = 0;
    const st = Math.max(1, Math.round(S / 12));
    for (let dy = -S; dy <= S; dy += st) for (let dx = -S; dx <= S; dx += st) { const v = sad(x0, y0, x1, y1, dx, dy, 2); if (v < best) { best = v; bx = dx; by = dy; } }
    const cx = bx, cy = by;
    for (let dy = cy - st; dy <= cy + st; dy++) for (let dx = cx - st; dx <= cx + st; dx++) { const v = sad(x0, y0, x1, y1, dx, dy, 1); if (v < best) { best = v; bx = dx; by = dy; } }
    let kind: DiffRegion['kind'];
    // a shift only when the content is on both sides in similar amounts (else moving the window off it also 'helps')
    if ((bx || by) && best < base * 0.45 && iR > 0 && iP > 0 && Math.min(iR, iP) > Math.max(iR, iP) * 0.5) kind = 'shifted';
    else if (iR > 0 && iP < iR * 0.25) kind = 'missing';
    else if (iP > 0 && iR < iP * 0.25) kind = 'extra';
    else kind = 'changed';
    const f = (v: number) => Math.round(v * 1000) / 1000;
    const r: DiffRegion & { weight: number } = { box: [f(x0 / w), f(y0 / h), f((x1 - x0) / w), f((y1 - y0) / h)], kind, diff: f(meanD), weight: b.n * meanD };
    if (kind === 'shifted') r.shift = [f(bx / w), f(by / h)];
    out.push(r);
  }
  return out.sort((a, b) => b.weight - a.weight).slice(0, max).map(({ weight: _w, ...r }) => r);
}
