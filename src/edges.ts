// preview {image, profile}: edge tracks. Tone profiles down columns (or along rows) every `step` px; a tone step
// (a jump in lightness) is an edge point; points of the same kind in neighbouring columns are linked into tracks, so
// a curve's edge comes back as one list of points ready for create_path {fit}. Pure JS on src/image.ts; the tracker
// from the 2026-11-25 recreate job, made general (roadmap "Faster free-form recreation").
import type { Img } from './image.js';

export interface ProfileOpts { step?: number; min?: number; rows?: boolean; max_tracks?: number }
export interface Track {
  id: number;
  /** tone change across the edge, 0–255 lightness: + = lighter below (rows: to the right) */
  tone: number;
  /** colours on both sides (median along the track); rows: left / right */
  above: string; below: string;
  n: number;
  /** points in frame units, left → right (rows: top → bottom) */
  pts: number[][];
}

const hex = (c: number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const median = (a: number[]) => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; };

/** swap x and y (rows mode runs the column tracker on the transposed image) */
function transpose(img: Img): Img {
  const { w, h } = img, rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) rgb[(x * h + y) * 3 + k] = img.rgb[(y * w + x) * 3 + k];
  return { w: h, h: w, rgb };
}

interface Raw { pts: number[][]; tones: number[] }

/** Edge tracks of an image. Coordinates in image px of `img`; map them with ox, oy, k (see imageview Frame). */
export function edgeTracks(src: Img, o: ProfileOpts = {}, ox = 0, oy = 0, k = 1): Track[] {
  const img = o.rows ? transpose(src) : src, { w, h, rgb } = img;
  const step = Math.max(1, Math.round(o.step ? o.step * k : Math.max(2, w / 60)));
  const min = o.min ?? 8, half = Math.max(1, Math.round(step / 3)), near = 8;
  const lum = (i: number) => rgb[i] * 0.3 + rgb[i + 1] * 0.59 + rgb[i + 2] * 0.11;
  const cols: { x: number; edges: { y: number; tone: number }[] }[] = [];
  for (let x = Math.min(half, w - 1); x < w; x += step) {
    // lightness down the column, averaged over ±half px across (JPEG noise) and ±2 px along
    const c = new Float64Array(h);
    for (let y = 0; y < h; y++) {
      let s = 0, n = 0;
      for (let dx = -half; dx <= half; dx++) { const xx = x + dx; if (xx < 0 || xx >= w) continue; s += lum((y * w + xx) * 3); n++; }
      c[y] = s / n;
    }
    const sm = new Float64Array(h);
    for (let y = 0; y < h; y++) { let s = 0, n = 0; for (let d = -2; d <= 2; d++) if (y + d >= 0 && y + d < h) { s += c[y + d]; n++; } sm[y] = s / n; }
    const at = (y: number) => sm[Math.max(0, Math.min(h - 1, y))];
    const e: { y: number; g: number }[] = [];
    for (let y = 3; y < h - 3; y++) {
      const g = at(y + 3) - at(y - 3);
      if (Math.abs(g) < min) continue;
      const last = e[e.length - 1];
      if (last && y - last.y < near) { if (Math.abs(g) > Math.abs(last.g)) { last.y = y; last.g = g; } } else e.push({ y, g });
    }
    cols.push({ x, edges: e.map((q) => ({ y: q.y, tone: Math.round(at(q.y + near) - at(q.y - near)) })).filter((q) => Math.abs(q.tone) >= min) });
  }
  // link: each edge joins the open track of the same sign that predicts it best (slope from its last two points),
  // across gaps of up to 3 columns
  const tracks: Raw[] = [], maxDy = Math.max(10, 3 * step);
  for (const col of cols) {
    const cand: [number, number, number][] = [];
    col.edges.forEach((e, i) => tracks.forEach((t, j) => {
      const p = t.pts[t.pts.length - 1], q = t.pts[t.pts.length - 2];
      if (Math.sign(t.tones[0]) !== Math.sign(e.tone) || col.x - p[0] > 3 * step) return;
      const pred = q ? p[1] + (p[1] - q[1]) / (p[0] - q[0]) * (col.x - p[0]) : p[1];
      const d = Math.abs(e.y - pred);
      if (d <= maxDy) cand.push([d + (col.x - p[0]) / step, i, j]);
    }));
    cand.sort((a, b) => a[0] - b[0]);
    const usedE = new Set<number>(), usedT = new Set<number>();
    for (const [, i, j] of cand) {
      if (usedE.has(i) || usedT.has(j)) continue;
      usedE.add(i); usedT.add(j);
      tracks[j].pts.push([col.x, col.edges[i].y]); tracks[j].tones.push(col.edges[i].tone);
    }
    col.edges.forEach((e, i) => { if (!usedE.has(i)) tracks.push({ pts: [[col.x, e.y]], tones: [e.tone] }); });
  }
  // colours a few px either side of each point (3 × 3 mean), median along the track
  const side = (x: number, y: number) => {
    const s = [0, 0, 0]; let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = Math.max(0, Math.min(w - 1, x + dx)), yy = Math.max(0, Math.min(h - 1, y + dy)), i = (yy * w + xx) * 3;
      s[0] += rgb[i]; s[1] += rgb[i + 1]; s[2] += rgb[i + 2]; n++;
    }
    return s.map((v) => v / n);
  };
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const out = tracks.filter((t) => t.pts.length >= 5)
    .map((t) => ({ t, tone: Math.round(t.tones.reduce((a, b) => a + b, 0) / t.tones.length) }))
    .sort((a, b) => b.t.pts.length * Math.abs(b.tone) - a.t.pts.length * Math.abs(a.tone))
    .slice(0, o.max_tracks ?? 30);
  return out.map(({ t, tone }, id) => {
    const up = t.pts.map(([x, y]) => side(x, y - near)), dn = t.pts.map(([x, y]) => side(x, y + near));
    const med = (a: number[][]) => hex([0, 1, 2].map((c) => median(a.map((v) => v[c]))));
    const pts = t.pts.map(([x, y]) => (o.rows ? [r2(ox + y / k), r2(oy + x / k)] : [r2(ox + x / k), r2(oy + y / k)]));
    return { id, tone, above: med(up), below: med(dn), n: pts.length, pts };
  });
}
