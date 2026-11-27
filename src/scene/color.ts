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
// linear light → sRGB byte without a power per call (it was 5 % of an analyze): TH[k] is the linear value where the
// rounded byte goes from k to k + 1, so the byte is the number of thresholds at or below c (the same rounding as
// round(gamma(c) · 255), the thresholds being that curve's inverse at k + 0.5)
const TH = new Float64Array(255);
for (let k = 0; k < 255; k++) { const v = (k + 0.5) / 255; TH[k] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
const byte = (c: number) => {
  if (!(c >= TH[0])) return 0;
  if (c >= TH[254]) return 255;
  let lo = 0, hi = 254; // TH[lo] <= c < TH[hi]
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (TH[m] <= c) lo = m; else hi = m; }
  return lo + 1;
};

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

/** Where colour m lies between colours p and q, all Lab: t in 0..1 along p → q, measured in sRGB (anti-aliasing and
 * soft edges mix there, and a mix of two inks is a curve, not a line, in Lab); -1 when m is farther than tol (sRGB
 * units, 0–255 per channel) from that segment. */
export function mixT(m: ArrayLike<number>, p: ArrayLike<number>, q: ArrayLike<number>, tol: number): number {
  const M = labToRgb(m[0], m[1], m[2]), P = labToRgb(p[0], p[1], p[2]), Q = labToRgb(q[0], q[1], q[2]);
  const v = [Q[0] - P[0], Q[1] - P[1], Q[2] - P[2]], u = [M[0] - P[0], M[1] - P[1], M[2] - P[2]];
  const vv = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
  if (!vv) return -1;
  const t = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / vv;
  return Math.hypot(u[0] - t * v[0], u[1] - t * v[1], u[2] - t * v[2]) < tol ? t : -1;
}
