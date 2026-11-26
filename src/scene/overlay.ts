// scene: the overlay image — left the working image with region boundaries and ids, right the flat render of the
// scene with the same ids. Ids sit at each region's pole (its deepest point).
import { resize, type Img } from '../image.js';
import { put, label } from '../imageview.js';
import { alive } from './summary.js';
import type { Scene } from './types.js';

export function overlay(s: Scene, maxPx = 1024): Img {
  const { w, h } = s.work, gap = 8;
  // small crops are enlarged (up to 4×) so ids and boundaries stay readable
  const k = Math.min(4, maxPx / Math.max(2 * w + gap, h));
  const pw = Math.max(1, Math.round(w * k)), ph = Math.max(1, Math.round(h * k)), W = pw * 2 + gap;
  const left = resize(s.work, pw, ph), right = resize(s.render, pw, ph);
  const rgb = new Uint8Array(W * ph * 3).fill(255), out: Img = { w: W, h: ph, rgb };
  for (let y = 0; y < ph; y++) {
    rgb.set(left.rgb.subarray(y * pw * 3, (y + 1) * pw * 3), y * W * 3);
    rgb.set(right.rgb.subarray(y * pw * 3, (y + 1) * pw * 3), (y * W + pw + gap) * 3);
  }
  // boundaries on the left panel: what is drawn after the edits (merges, drops, fills), else the analyzed labels
  const ids = s.drawn ?? s.seg.map;
  const lbl = (x: number, y: number) => ids[Math.min(h - 1, Math.floor(y / k)) * w + Math.min(w - 1, Math.floor(x / k))];
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
    const v = lbl(x, y);
    if ((x + 1 < pw && lbl(x + 1, y) !== v) || (y + 1 < ph && lbl(x, y + 1) !== v)) {
      const i = (y * W + x) * 3, light = rgb[i] + rgb[i + 1] + rgb[i + 2] > 380;
      put(out, x, y, light ? [170, 0, 170] : [255, 120, 255]);
    }
  }
  // ids at poles: regions ≥ 0.3 % or the 40 largest; dots for the rest
  // dropped, text and placeholder regions are not drawn: no id for them
  const regs = alive(s).filter((r) => !s.meta[r.id].drop && !s.meta[r.id].text && !s.meta[r.id].placeholder).sort((a, b) => b.area - a.area), sc = pw >= 400 ? 2 : 1;
  regs.forEach((r, n) => {
    const x = r.pole[0] * k, y = r.pole[1] * k;
    if (n < 40 || r.area >= w * h * 0.003) {
      const t = String(r.id), tw = t.length * 4 * sc + sc, th = 7 * sc;
      for (const ox of [0, pw + gap]) label(out, t, Math.round(x - tw / 2) + ox, Math.round(y - th / 2), sc);
    } else for (const ox of [0, pw + gap]) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) put(out, x + a + ox, y + b, [200, 0, 0]);
  });
  return out;
}
