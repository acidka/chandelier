// preview {image}: look at an image file without Python/PIL or Swift. Crop a region, zoom it, draw a labelled
// coordinate grid, sample colours, find the content box. Pure JS on src/image.ts.
// A "frame" maps source coordinates (image pixels, or session units for a page Illustrator rendered) to the pixels
// of `img`: pixel = (u - ox) * k.
import { resize, type Img } from './image.js';

export interface Frame { img: Img; ox: number; oy: number; k: number }
export interface ViewOpts { grid?: number | boolean; sample?: number[][]; max_px?: number }
export interface Sample { at: number[]; hex: string; rgb: number[]; cmyk: number[] }
export interface View { img: Img; shown_px: [number, number]; zoom: number; grid?: number; content_box?: number[]; background?: string; samples?: Sample[] }

const r2 = (v: number) => Math.round(v * 100) / 100;
const hex = (c: number[]) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

/** Naive RGB → CMYK (no colour profile): a starting point for swatches, not a separation. */
export function rgbToCmyk([r, g, b]: number[]): number[] {
  const k = 1 - Math.max(r, g, b) / 255;
  if (k >= 1) return [0, 0, 0, 100];
  return [r, g, b].map((v) => Math.round((1 - v / 255 - k) / (1 - k) * 100)).concat(Math.round(k * 100));
}

/** Mean colour of a pixel rectangle (clamped). */
function mean(img: Img, x0: number, y0: number, x1: number, y1: number): number[] {
  x0 = Math.max(0, Math.min(img.w - 1, Math.floor(x0))); y0 = Math.max(0, Math.min(img.h - 1, Math.floor(y0)));
  x1 = Math.max(x0 + 1, Math.min(img.w, Math.ceil(x1))); y1 = Math.max(y0 + 1, Math.min(img.h, Math.ceil(y1)));
  const s = [0, 0, 0];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * img.w + x) * 3; s[0] += img.rgb[i]; s[1] += img.rgb[i + 1]; s[2] += img.rgb[i + 2]; }
  const n = (x1 - x0) * (y1 - y0);
  return s.map((v) => Math.round(v / n));
}

/** Colour at [x, y] (a 3 × 3 px mean, so JPEG noise doesn't decide) or the mean of [x, y, w, h], in frame units. */
export function sampleAt(f: Frame, at: number[]): Sample {
  const px = (u: number, o: number) => (u - o) * f.k;
  let c: number[];
  if (at.length >= 4) c = mean(f.img, px(at[0], f.ox), px(at[1], f.oy), px(at[0] + at[2], f.ox), px(at[1] + at[3], f.oy));
  else { const x = px(at[0], f.ox), y = px(at[1], f.oy); c = mean(f.img, x - 1, y - 1, x + 2, y + 2); }
  return { at, hex: hex(c), rgb: c, cmyk: rgbToCmyk(c) };
}

/** Background = median of the border pixels; content = pixels clearly different from it (a 1 % margin is ignored:
 * scans and photos often carry an edge shadow). Box in frame units. */
export function contentBox(f: Frame): { box: number[] | null; background: string } {
  const { img } = f, { w, h } = img, ch: number[][] = [[], [], []];
  const take = (x: number, y: number) => { const i = (y * w + x) * 3; for (let k = 0; k < 3; k++) ch[k].push(img.rgb[i + k]); };
  const st = Math.max(1, Math.floor((w + h) / 400));
  for (let x = 0; x < w; x += st) { take(x, 0); take(x, h - 1); }
  for (let y = 0; y < h; y += st) { take(0, y); take(w - 1, y); }
  const bg = ch.map((a) => a.sort((p, q) => p - q)[a.length >> 1]);
  const mx = Math.max(1, Math.round(w / 100)), my = Math.max(1, Math.round(h / 100));
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = my; y < h - my; y++) for (let x = mx; x < w - mx; x++) {
    const i = (y * w + x) * 3;
    if (Math.max(Math.abs(img.rgb[i] - bg[0]), Math.abs(img.rgb[i + 1] - bg[1]), Math.abs(img.rgb[i + 2] - bg[2])) > 40) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const box = x1 < 0 ? null : [f.ox + x0 / f.k, f.oy + y0 / f.k, (x1 - x0 + 1) / f.k, (y1 - y0 + 1) / f.k].map(r2);
  return { box, background: hex(bg) };
}

/** A round grid step giving about 10 lines over the longer side (1, 2 or 5 × 10^n). */
export function niceStep(span: number): number {
  const raw = span / 10, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

// 3 × 5 digits (and "-", "."), one row per string, for grid labels
const GLYPH: Record<string, string[]> = {
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '001', '001', '001'], 8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'], '-': ['000', '000', '111', '000', '000'], '.': ['000', '000', '000', '000', '010'],
};

function put(img: Img, x: number, y: number, c: number[], alpha = 1): void {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
  const i = (y * img.w + x) * 3;
  for (let k = 0; k < 3; k++) img.rgb[i + k] = Math.round(img.rgb[i + k] * (1 - alpha) + c[k] * alpha);
}

/** Text in the bitmap font (scale s) on a white box, top-left at (x, y). */
function label(img: Img, s: string, x: number, y: number, sc = 2): void {
  const w = s.length * 4 * sc + sc, h = 7 * sc;
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) put(img, x + xx, y + yy, [255, 255, 255], 0.85);
  [...s].forEach((ch, n) => (GLYPH[ch] ?? []).forEach((row, ry) => [...row].forEach((on, rx) => {
    if (on !== '1') return;
    for (let a = 0; a < sc; a++) for (let b = 0; b < sc; b++) put(img, x + sc + (n * 4 + rx) * sc + a, y + sc + ry * sc + b, [200, 0, 0]);
  })));
}

const num = (v: number) => String(Math.round(v * 100) / 100);

/** Scale for display (shrink to max_px; zoom a small region up to 8×, nearest neighbour so pixels stay sharp),
 * then draw the grid and the sample marks. */
export function view(f: Frame, o: ViewOpts = {}): View {
  const max = o.max_px ?? 1024, src = f.img;
  const z = Math.min(8, max / Math.max(src.w, src.h));
  let img: Img;
  if (z < 1) img = resize(src, src.w * z, src.h * z);
  else {
    const W = Math.max(1, Math.round(src.w * Math.floor(z))), H = Math.max(1, Math.round(src.h * Math.floor(z))), zi = Math.floor(z);
    img = { w: W, h: H, rgb: new Uint8Array(W * H * 3) };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) img.rgb.set(src.rgb.subarray(((Math.floor(y / zi)) * src.w + Math.floor(x / zi)) * 3, ((Math.floor(y / zi)) * src.w + Math.floor(x / zi)) * 3 + 3), (y * W + x) * 3);
  }
  const zoom = img.w / src.w, K = f.k * zoom; // display px per source unit
  const out: View = { img, shown_px: [img.w, img.h], zoom: r2(zoom) };
  const cb = contentBox(f);
  if (cb.box) out.content_box = cb.box;
  out.background = cb.background;
  if (o.grid) {
    const uw = src.w / f.k, uh = src.h / f.k;
    const step = typeof o.grid === 'number' ? o.grid : niceStep(Math.max(uw, uh));
    out.grid = r2(step);
    if (step * K >= 4) {
      let lastX = -1e9, lastY = -1e9;
      for (let u = Math.ceil(f.ox / step) * step; u <= f.ox + uw; u += step) {
        const x = Math.round((u - f.ox) * K), major = Math.round(u / step) % 5 === 0, c = major ? [230, 0, 0] : [0, 140, 255];
        for (let y = 0; y < img.h; y++) put(img, x, y, c, major ? 0.8 : 0.55);
        if (x - lastX >= 34 && x < img.w - 10) { label(img, num(u), x + 2, 2); lastX = x; }
      }
      for (let u = Math.ceil(f.oy / step) * step; u <= f.oy + uh; u += step) {
        const y = Math.round((u - f.oy) * K), major = Math.round(u / step) % 5 === 0, c = major ? [230, 0, 0] : [0, 140, 255];
        for (let x = 0; x < img.w; x++) put(img, x, y, c, major ? 0.8 : 0.55);
        if (y - lastY >= 18 && y > 16 && y < img.h - 10) { label(img, num(u), 2, y + 2); lastY = y; }
      }
    }
  }
  if (o.sample?.length) {
    out.samples = o.sample.map((at) => sampleAt(f, at));
    o.sample.forEach((at, n) => {
      const x = (at[0] - f.ox) * K, y = (at[1] - f.oy) * K;
      if (at.length >= 4) {
        const w = at[2] * K, h = at[3] * K;
        for (let t = 0; t <= w; t++) { put(img, x + t, y, [255, 0, 255]); put(img, x + t, y + h, [255, 0, 255]); }
        for (let t = 0; t <= h; t++) { put(img, x, y + t, [255, 0, 255]); put(img, x + w, y + t, [255, 0, 255]); }
      } else {
        for (let a = 0; a < 64; a++) { const t = a / 64 * 2 * Math.PI; put(img, x + 5 * Math.cos(t), y + 5 * Math.sin(t), [255, 0, 255]); }
      }
      label(img, String(n), x + 6, y + 6);
    });
  }
  return out;
}
