// scene: a small anti-aliased rasterizer for our own Bézier shapes (4 sub-scanlines, exact horizontal coverage). It
// renders the scene without Illustrator: the error estimate in analyze, the overlay's flat preview, per-region fit
// checks, refine's prediction.
import { bez, type Seg } from '../fitcurve.js';
import type { Img } from '../image.js';

export interface RShape { loops: Seg[][]; rgb: number[]; evenodd?: boolean; id?: number }

/** Bézier loops → closed polylines (about 0.5 px per step) */
export function flatten(loops: Seg[][]): number[][][] {
  return loops.map((segs) => {
    const out: number[][] = [];
    for (const c of segs) {
      const est = Math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]) + Math.hypot(c[2][0] - c[1][0], c[2][1] - c[1][1]) + Math.hypot(c[3][0] - c[2][0], c[3][1] - c[2][1]);
      const n = Math.max(1, Math.min(400, Math.ceil(est / 0.5)));
      for (let i = out.length ? 1 : 0; i <= n; i++) out.push(bez(c, i / n));
    }
    return out;
  });
}

const SUB = 4;

/** Paint shapes in order onto an image (default white). ids: per pixel, the last shape covering more than half of it. */
export function rasterize(shapes: RShape[], w: number, h: number, o: { bg?: number[]; ids?: boolean } = {}): { img: Img; ids?: Int32Array } {
  const bg = o.bg ?? [255, 255, 255], acc = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) { acc[i * 3] = bg[0]; acc[i * 3 + 1] = bg[1]; acc[i * 3 + 2] = bg[2]; }
  const ids = o.ids ? new Int32Array(w * h).fill(-1) : undefined, cov = new Float32Array(w);
  for (const s of shapes) {
    // edges: [x0, y0, x1, y1, dir] with y0 < y1
    const E: number[][] = [];
    let ymin = Infinity, ymax = -Infinity;
    for (const poly of flatten(s.loops)) for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if (a[1] === b[1]) continue;
      const e = a[1] < b[1] ? [a[0], a[1], b[0], b[1], 1] : [b[0], b[1], a[0], a[1], -1];
      E.push(e); ymin = Math.min(ymin, e[1]); ymax = Math.max(ymax, e[3]);
    }
    if (!E.length) continue;
    E.sort((p, q) => p[1] - q[1]);
    const y0 = Math.max(0, Math.floor(ymin)), y1 = Math.min(h - 1, Math.ceil(ymax));
    let start = 0;
    const active: number[][] = [];
    for (let y = y0; y <= y1; y++) {
      cov.fill(0);
      let any = false;
      for (let k = 0; k < SUB; k++) {
        const sy = y + (k + 0.5) / SUB;
        while (start < E.length && E[start][1] <= sy) active.push(E[start++]);
        for (let i = active.length - 1; i >= 0; i--) if (active[i][3] <= sy) active.splice(i, 1);
        const xs: number[][] = [];
        for (const e of active) if (e[1] <= sy && sy < e[3]) xs.push([e[0] + ((sy - e[1]) / (e[3] - e[1])) * (e[2] - e[0]), e[4]]);
        if (xs.length < 2) continue;
        xs.sort((p, q) => p[0] - q[0]);
        let wind = 0;
        for (let i = 0; i + 1 < xs.length; i++) {
          wind = s.evenodd ? wind ^ 1 : wind + xs[i][1];
          if (!wind) continue;
          span(cov, w, xs[i][0], xs[i + 1][0]);
          any = true;
        }
      }
      if (!any) continue;
      for (let x = 0; x < w; x++) {
        const c = Math.min(1, cov[x] / SUB);
        if (c <= 0) continue;
        const i = (y * w + x) * 3;
        acc[i] += (s.rgb[0] - acc[i]) * c; acc[i + 1] += (s.rgb[1] - acc[i + 1]) * c; acc[i + 2] += (s.rgb[2] - acc[i + 2]) * c;
        if (ids && c > 0.5) ids[y * w + x] = s.id ?? 0;
      }
    }
  }
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0; i < rgb.length; i++) rgb[i] = Math.round(acc[i]);
  return { img: { w, h, rgb }, ids };
}

/** add coverage of the horizontal span [a, b) to the row (fractional ends) */
function span(cov: Float32Array, w: number, a: number, b: number): void {
  a = Math.max(0, a); b = Math.min(w, b);
  if (b <= a) return;
  const ia = Math.floor(a), ib = Math.floor(b);
  if (ia === ib) { cov[ia] += b - a; return; }
  cov[ia] += ia + 1 - a;
  for (let x = ia + 1; x < ib; x++) cov[x] += 1;
  if (ib < w) cov[ib] += b - ib;
}

/** root-mean-square difference, 0..1 */
export function rmse(a: Img, b: Img): number {
  let s = 0;
  for (let i = 0; i < a.rgb.length; i++) { const d = a.rgb[i] - b.rgb[i]; s += d * d; }
  return Math.sqrt(s / a.rgb.length) / 255;
}
