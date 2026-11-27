// scene analyze, step 2: edge-preserving smoothing (bilateral filter on Lab). Flattens JPEG noise and paper grain so
// one ink quantizes to one colour, while band edges (large ΔE) stay sharp.
import type { Lab } from './color.js';

export interface SmoothOpts { sigmaS?: number; sigmaR?: number; passes?: number }

export function bilateral(lab: Lab, o: SmoothOpts = {}): Lab {
  const passes = o.passes ?? 1;
  if (passes <= 0) return lab;
  const ss = o.sigmaS ?? 1.5, sr = o.sigmaR ?? 5, r = Math.max(1, Math.ceil(ss * 1.5)), { w, h } = lab;
  const sw: number[] = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) sw.push(Math.exp(-(dx * dx + dy * dy) / (2 * ss * ss)));
  // range weight by squared ΔE, in steps of 0.25 up to 9σ² (beyond: 0)
  const maxD2 = 9 * sr * sr, rw = new Float32Array(Math.ceil(maxD2 * 4) + 1);
  for (let i = 0; i < rw.length; i++) rw[i] = Math.exp(-(i / 4) / (2 * sr * sr));
  let cur = lab;
  for (let p = 0; p < passes; p++) {
    const L = new Float32Array(w * h), A = new Float32Array(w * h), B = new Float32Array(w * h);
    const { L: L0, A: A0, B: B0 } = cur;
    const flat = uniform(cur, r);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, l = L0[i], a = A0[i], b = B0[i];
      // the whole window one colour (flat art: 50–70 % of the pixels): the weighted mean is that colour
      if (flat[i]) { L[i] = l; A[i] = a; B[i] = b; continue; }
      let sl = 0, sa = 0, sb = 0, sum = 0, k = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) { k += 2 * r + 1; continue; }
        for (let dx = -r; dx <= r; dx++, k++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx, dl = L0[j] - l, da = A0[j] - a, db = B0[j] - b, d2 = dl * dl + da * da + db * db;
          if (d2 >= maxD2) continue;
          const wt = sw[k] * rw[(d2 * 4) | 0];
          sl += wt * L0[j]; sa += wt * A0[j]; sb += wt * B0[j]; sum += wt;
        }
      }
      L[i] = sl / sum; A[i] = sa / sum; B[i] = sb / sum;
    }
    cur = { w, h, L, A, B };
  }
  return cur;
}

/** 1 where the (2r+1)² window around a pixel holds one exact colour: runs of equal pixels along each row, then along
 * each column of the row result */
function uniform(lab: Lab, r: number): Uint8Array {
  const { w, h, L, A, B } = lab, n = w * h, eq = (i: number, j: number) => L[i] === L[j] && A[i] === A[j] && B[i] === B[j];
  const row = new Uint8Array(n), out = new Uint8Array(n), run = new Int32Array(Math.max(w, h));
  for (let y = 0; y < h; y++) {
    const o = y * w;
    // left[x]: equal pixels ending at x; then from the right, a pixel is row-uniform when both runs reach r
    for (let x = 0; x < w; x++) run[x] = x && eq(o + x, o + x - 1) ? run[x - 1] + 1 : 1;
    let right = 0;
    for (let x = w - 1; x >= 0; x--) { right = x < w - 1 && eq(o + x, o + x + 1) ? right + 1 : 1; if (run[x] > r && right > r) row[o + x] = 1; }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) { const i = y * w + x; run[y] = row[i] ? (y && row[i - w] && eq(i, i - w) ? run[y - 1] + 1 : 1) : 0; }
    let down = 0;
    for (let y = h - 1; y >= 0; y--) { const i = y * w + x; down = row[i] ? (y < h - 1 && row[i + w] && eq(i, i + w) ? down + 1 : 1) : 0; if (run[y] > r && down > r) out[i] = 1; }
  }
  return out;
}
