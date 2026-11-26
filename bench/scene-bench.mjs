#!/usr/bin/env node
// Offline scene pipeline timings (no Illustrator): node bench/scene-bench.mjs <image> [more images…] [--max 1000]
// Prints per image: working size, inks, regions, edges, segments, est. rmse, analyze ms. Writes nothing.
import { readFileSync } from 'node:fs';
import { decodeImage } from '../dist/image.js';
import { analyze } from '../dist/scene/analyze.js';

const args = process.argv.slice(2), mi = args.indexOf('--max'), maxPx = mi >= 0 ? +args[mi + 1] : 1000;
const files = args.filter((a, i) => mi < 0 || (i !== mi && i !== mi + 1));
if (!files.length) { console.error('usage: node bench/scene-bench.mjs <image> [...] [--max 1000]'); process.exit(1); }
for (const f of files) {
  const t = performance.now();
  const s = analyze(decodeImage(readFileSync(f)), { image: f, colors: 16, minDe: 6, detail: 'normal', maxPx }, { dir: '/dev/null', path: f });
  const ms = Math.round(performance.now() - t), alive = s.seg.regions.filter((r) => r.area > 0).length;
  const inks = new Set(s.meta.filter((_, i) => s.seg.regions[i].area > 0).map((m) => m.colour)).size;
  console.log(`${f.split('/').slice(-2).join('/')}: ${s.work.w}×${s.work.h} inks ${inks} regions ${alive} edges ${s.pm.edges.length} segments ${s.fits.reduce((a, x) => a + x.length, 0)} est_rmse ${s.estRmse} analyze ${ms} ms`);
}
