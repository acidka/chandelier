// scene: sRGB ↔ CIE Lab (D65) and colour formatting. Lab is where the scene measures colour: ΔE76 distances are what
// a designer sees as "the same ink" (swatches recolor uses ΔE76 too).
import type { Img } from '../image.js';

/** A Lab image: three planes, one value per pixel. */
export interface Lab { w: number; h: number; L: Float32Array; A: Float32Array; B: Float32Array }

const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const XN = 0.95047, ZN = 1.08883, E = 216 / 24389, K = 24389 / 27;
const fxyz = (t: number) => (t > E ? Math.cbrt(t) : (K * t + 16) / 116);

/** one sRGB colour (0–255) → [L, a, b] */
export function rgbLab(r: number, g: number, b: number): [number, number, number] {
  const R = LIN[r], G = LIN[g], Bl = LIN[b];
  const x = fxyz((0.4124564 * R + 0.3575761 * G + 0.1804375 * Bl) / XN);
  const y = fxyz(0.2126729 * R + 0.7151522 * G + 0.0721750 * Bl);
  const z = fxyz((0.0193339 * R + 0.1191920 * G + 0.9503041 * Bl) / ZN);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** Whole image → Lab planes (alpha ignored: rgb is already composited on white). Cached per distinct colour. */
export function rgbToLab(img: Img): Lab {
  const n = img.w * img.h, L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n);
  const cache = new Map<number, [number, number, number]>();
  for (let i = 0; i < n; i++) {
    const r = img.rgb[i * 3], g = img.rgb[i * 3 + 1], b = img.rgb[i * 3 + 2], key = (r << 16) | (g << 8) | b;
    let v = cache.get(key);
    if (!v) { v = rgbLab(r, g, b); if (cache.size < 1 << 20) cache.set(key, v); }
    L[i] = v[0]; A[i] = v[1]; B[i] = v[2];
  }
  return { w: img.w, h: img.h, L, A, B };
}

const finv = (t: number) => (t * t * t > E ? t * t * t : (116 * t - 16) / K);
const gam = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const byte = (c: number) => Math.max(0, Math.min(255, Math.round(gam(c) * 255)));

/** [L, a, b] → sRGB bytes (out-of-gamut colours clipped) */
export function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const x = finv(fx) * XN, y = L > K * E ? fy * fy * fy : L / K, z = finv(fz) * ZN;
  return [
    byte(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
    byte(-0.9692660 * x + 1.8760108 * y + 0.0415560 * z),
    byte(0.0556434 * x - 0.2040259 * y + 1.0572252 * z),
  ];
}

/** ΔE76 */
export const de76 = (L1: number, a1: number, b1: number, L2: number, a2: number, b2: number) => Math.hypot(L1 - L2, a1 - a2, b1 - b2);

export const rgbHex = (c: number[]) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
export const labHex = (L: number, a: number, b: number) => rgbHex(labToRgb(L, a, b));
/** colour string for the runtime (A.color accepts lab(L,a,b)) */
export const labSpec = (L: number, a: number, b: number) => `lab(${[L, a, b].map((v) => Math.round(v * 10) / 10).join(',')})`;
