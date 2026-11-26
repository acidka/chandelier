// Where does the scene lose quality? rmse of each pipeline stage against the working image, whole and in a crop.
import { readFileSync } from 'node:fs';
import { decodeImage, crop } from '../dist/image.js';
import { analyze } from '../dist/scene/analyze.js';
import { labToRgb } from '../dist/scene/color.js';
import { rasterize, rmse } from '../dist/scene/raster.js';
const [file, cropArg, roiArg, ...rest] = process.argv.slice(2);
const variants = { normal: {}, high: { detail: 'high' }, 'high+32c+de3': { detail: 'high', colors: 32, minDe: 3 } };
const roi = roiArg ? roiArg.split(',').map(Number) : null; // [x,y,w,h] in working px: a detail area (face)
for (const [name, v] of Object.entries(variants)) {
  const p = { image: file, colors: 16, minDe: 6, detail: 'normal', maxPx: 1000, ...(cropArg && cropArg !== '-' ? { crop: cropArg.split(',').map(Number) } : {}), ...v };
  const s = analyze(decodeImage(readFileSync(file)), p, { dir: '/tmp', path: file });
  const { w, h } = s.work, n = w * h;
  const img = (fill) => { const rgb = new Uint8Array(n * 3); for (let i = 0; i < n; i++) rgb.set(fill(i), i * 3); return { w, h, rgb }; };
  // 1 quantization alone: every pixel its ink
  const q = img((i) => { const k = s.quant.labels[i]; return k === 255 ? [255, 255, 255] : labToRgb(s.quant.centres[k * 3], s.quant.centres[k * 3 + 1], s.quant.centres[k * 3 + 2]); });
  // 2 final regions, exact pixels, each its own mean
  const R = s.seg.regions;
  const lab = img((i) => { const r = R[s.seg.map[i]]; return r ? labToRgb(r.L, r.a, r.b) : [255, 255, 255]; });
  // 3 fitted shapes, per-region mean colour
  const own = rasterize(s.shapes.map((sh) => ({ loops: sh.loops, rgb: labToRgb(R[sh.region].L, R[sh.region].a, R[sh.region].b), evenodd: sh.holes })), w, h).img;
  // 4 = s.render (fitted, shared inks)
  const m = (a) => { const all = rmse(s.work, a); if (!roi) return all.toFixed(3); const c = (x) => crop(x, ...roi); return `${all.toFixed(3)} / roi ${rmse(c(s.work), c(a)).toFixed(3)}`; };
  const regs = R.filter((r) => r.area).length, segs = s.shapes.reduce((a, sh) => a + sh.loops.reduce((x, l) => x + l.length, 0), 0);
  console.log(`${name.padEnd(14)} ${w}x${h} inks ${s.quant.k} regions ${regs} segs ${segs} | 1 quant ${m(q)} | 2 regions-exact ${m(lab)} | 3 fitted-own ${m(own)} | 4 built ${m(s.render)}`);
}
