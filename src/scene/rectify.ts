// scene analyze, step 1: the working image. A crop, or a photographed face mapped flat (4 corners: projective, or
// row by row for a tapered face), sized so its longest side is at most maxPx. Later stages work in its pixels.
import { crop as cropImg, fitLongest, type Img } from '../image.js';
import { projective } from '../fitcurve.js';

export interface RectifyOpts {
  /** [x, y, w, h] in source px */
  crop?: number[];
  /** face corners in source px: TL, TR, BR, BL */
  map?: number[][];
  /** map each output row along a straight line between the interpolated sides (tapered faces) instead of projective */
  bilinear?: boolean;
  /** target aspect [w, h] (any units) */
  size?: number[];
  maxPx: number;
}

export interface Rectified {
  img: Img;
  /** working px (x, y) → source px */
  toSource: (x: number, y: number) => [number, number];
}

const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** bilinear sample of rgb (and alpha) at source position (x, y) in pixel-centre coordinates, edges clamped */
function sample(img: Img, x: number, y: number, out: number[]): void {
  const fx = Math.max(0, Math.min(img.w - 1, x - 0.5)), fy = Math.max(0, Math.min(img.h - 1, y - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(img.w - 1, x0 + 1), y1 = Math.min(img.h - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
  const i00 = y0 * img.w + x0, i10 = y0 * img.w + x1, i01 = y1 * img.w + x0, i11 = y1 * img.w + x1;
  for (let k = 0; k < 3; k++) out[k] += img.rgb[i00 * 3 + k] * w00 + img.rgb[i10 * 3 + k] * w10 + img.rgb[i01 * 3 + k] * w01 + img.rgb[i11 * 3 + k] * w11;
  if (img.a) out[3] += img.a[i00] * w00 + img.a[i10] * w10 + img.a[i01] * w01 + img.a[i11] * w11;
}

export function rectify(src: Img, o: RectifyOpts): Rectified {
  const maxPx = Math.max(16, Math.round(o.maxPx));
  if (!o.map) {
    const c = o.crop ?? [0, 0, src.w, src.h];
    const cut = o.crop ? cropImg(src, c[0], c[1], c[2], c[3]) : src;
    let img: Img;
    if (o.size) { // stretch to the target aspect (a crop drawn by eye is rarely exact)
      const asp = o.size[0] / o.size[1], long = Math.min(maxPx, Math.max(cut.w, cut.h));
      img = resizeTo(cut, Math.max(2, Math.round(asp >= 1 ? long : long * asp)), Math.max(2, Math.round(asp >= 1 ? long / asp : long)));
    } else img = fitLongest(cut, maxPx);
    const x0 = Math.max(0, Math.round(c[0])), y0 = Math.max(0, Math.round(c[1])), sx = cut.w / img.w, sy = cut.h / img.h;
    return { img, toSource: (x, y) => [x0 + x * sx, y0 + y * sy] };
  }
  const [TL, TR, BR, BL] = o.map;
  if (o.map.length !== 4 || o.map.some((p) => p.length !== 2)) throw new Error('map: 4 corners [x, y] (TL, TR, BR, BL).');
  // a convex quadrilateral: every turn the same way, none straight
  const turns = o.map.map((p, i) => { const q = o.map![(i + 1) % 4], r = o.map![(i + 2) % 4]; return (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]); });
  if (!(turns.every((t) => t > 1e-9) || turns.every((t) => t < -1e-9))) throw new Error('map: the four points must form a convex quadrilateral (TL, TR, BR, BL; no three in a line).');
  const natW = (dist(TL, TR) + dist(BL, BR)) / 2, natH = (dist(TL, BL) + dist(TR, BR)) / 2;
  const aspect = o.size ? o.size[0] / o.size[1] : natW / natH;
  // never larger than the face's own pixels (no invented detail), never larger than maxPx
  const long = Math.min(maxPx, Math.max(natW, natH));
  const W = Math.max(2, Math.round(aspect >= 1 ? long : long * aspect)), H = Math.max(2, Math.round(aspect >= 1 ? long / aspect : long));
  let toSource: (x: number, y: number) => [number, number];
  if (o.bilinear) {
    toSource = (x, y) => {
      const u = x / W, v = y / H;
      return [0, 1].map((k) => (1 - v) * ((1 - u) * TL[k] + u * TR[k]) + v * ((1 - u) * BL[k] + u * BR[k])) as [number, number];
    };
  } else {
    const m = projective([[0, 0], [W, 0], [W, H], [0, H]], [TL, TR, BR, BL]);
    toSource = (x, y) => m([x, y]) as [number, number];
  }
  // supersampling: enough samples that each covers about one source pixel (2–4 per axis)
  const n = Math.max(2, Math.min(4, Math.ceil(Math.max(natW / W, natH / H))));
  const rgb = new Uint8Array(W * H * 3), a = src.a ? new Uint8Array(W * H) : undefined, acc = [0, 0, 0, 0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    acc[0] = acc[1] = acc[2] = acc[3] = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const [sx, sy] = toSource(x + (i + 0.5) / n, y + (j + 0.5) / n);
      sample(src, sx, sy, acc);
    }
    const q = y * W + x, nn = n * n;
    rgb[q * 3] = Math.round(acc[0] / nn); rgb[q * 3 + 1] = Math.round(acc[1] / nn); rgb[q * 3 + 2] = Math.round(acc[2] / nn);
    if (a) a[q] = Math.round(acc[3] / nn);
  }
  return { img: { w: W, h: H, rgb, a }, toSource };
}

/** area-average resize to an exact size, also upward (nearest) — the image module's resize only averages down */
function resizeTo(img: Img, w: number, h: number): Img {
  const rgb = new Uint8Array(w * h * 3), a = img.a ? new Uint8Array(w * h) : undefined, acc = [0, 0, 0, 0];
  const sx = img.w / w, sy = img.h / h, n = Math.max(1, Math.min(4, Math.ceil(Math.max(sx, sy))));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    acc[0] = acc[1] = acc[2] = acc[3] = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) sample(img, (x + (i + 0.5) / n) * sx, (y + (j + 0.5) / n) * sy, acc);
    const q = y * w + x, nn = n * n;
    for (let k = 0; k < 3; k++) rgb[q * 3 + k] = Math.round(acc[k] / nn);
    if (a) a[q] = Math.round(acc[3] / nn);
  }
  return { w, h, rgb, a };
}
