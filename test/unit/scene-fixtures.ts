// Synthetic images for the scene tests: shapes painted at 4× and averaged down (real anti-aliasing), seeded noise,
// optional JPEG round trip. No client files.
import jpeg from 'jpeg-js';
import { resize, type Img } from '../../src/image.js';

export type RGB = [number, number, number];
/** a shape: inside(x, y) in final-image px, and its colour; later shapes paint over earlier ones */
export interface Shape { inside: (x: number, y: number) => boolean; c: RGB }

export const rect = (x: number, y: number, w: number, h: number, c: RGB): Shape => ({ inside: (px, py) => px >= x && px < x + w && py >= y && py < y + h, c });
export const ellipse = (cx: number, cy: number, rx: number, ry: number, c: RGB, rot = 0): Shape => {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  return { inside: (px, py) => { const dx = px - cx, dy = py - cy, u = dx * cs + dy * sn, v = -dx * sn + dy * cs; return (u * u) / (rx * rx) + (v * v) / (ry * ry) <= 1; }, c };
};
/** everything below y = f(x) */
export const below = (f: (x: number) => number, c: RGB): Shape => ({ inside: (px, py) => py >= f(px), c });
export const ring = (cx: number, cy: number, r0: number, r1: number, c: RGB): Shape => ({ inside: (px, py) => { const d = Math.hypot(px - cx, py - cy); return d >= r0 && d <= r1; }, c });

export function mulberry32(seed: number): () => number {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export interface PaintOpts { bg?: RGB; ss?: number; noise?: number; seed?: number; jpeg?: number }

export function paint(w: number, h: number, shapes: Shape[], o: PaintOpts = {}): Img {
  const ss = o.ss ?? 4, W = w * ss, H = h * ss, bg = o.bg ?? [255, 255, 255];
  const rgb = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const px = (x + 0.5) / ss, py = (y + 0.5) / ss;
    let c: RGB = bg;
    for (const s of shapes) if (s.inside(px, py)) c = s.c;
    rgb.set(c, (y * W + x) * 3);
  }
  let img = ss === 1 ? { w, h, rgb } : resize({ w: W, h: H, rgb }, w, h);
  if (o.noise) {
    const rnd = mulberry32(o.seed ?? 7), out = new Uint8Array(img.rgb.length);
    for (let i = 0; i < out.length; i++) {
      const g = (rnd() + rnd() + rnd() + rnd() - 2) * Math.sqrt(3) * o.noise; // ~gaussian, σ = noise
      out[i] = Math.max(0, Math.min(255, Math.round(img.rgb[i] + g)));
    }
    img = { w, h, rgb: out };
  }
  if (o.jpeg) img = jpegRoundTrip(img, o.jpeg);
  return img;
}

export function jpegRoundTrip(img: Img, quality: number): Img {
  const data = Buffer.alloc(img.w * img.h * 4);
  for (let i = 0; i < img.w * img.h; i++) { data[i * 4] = img.rgb[i * 3]; data[i * 4 + 1] = img.rgb[i * 3 + 1]; data[i * 4 + 2] = img.rgb[i * 3 + 2]; data[i * 4 + 3] = 255; }
  const enc = jpeg.encode({ data, width: img.w, height: img.h }, quality).data;
  const dec = jpeg.decode(enc, { useTArray: true, formatAsRGBA: false });
  return { w: dec.width, h: dec.height, rgb: new Uint8Array(dec.data) };
}

export const px = (img: Img, x: number, y: number): RGB => { const i = (Math.round(y) * img.w + Math.round(x)) * 3; return [img.rgb[i], img.rgb[i + 1], img.rgb[i + 2]]; };
