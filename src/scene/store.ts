// scene state between calls: in memory per server, and on disk (scene.json + labels.png) so a scene survives a
// reconnect. Pixels are not saved: the source image is re-read and the deterministic steps re-run.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { encodePng, decodePng, readImage } from '../image.js';
import { regionStats } from './regions.js';
import { prepare, recompute } from './analyze.js';
import type { Scene } from './types.js';

const mem = new Map<string, Scene>();
export const put = (s: Scene) => { mem.set(s.id, s); };

export function fileOf(s: Scene): string { return join(s.dir, s.id, 'scene.json'); }

export function save(s: Scene): string {
  const dir = join(s.dir, s.id);
  mkdirSync(dir, { recursive: true });
  const { w, h } = s.work, rgb = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) { const v = s.seg.map[i] + 2; rgb[i * 3] = v >> 16; rgb[i * 3 + 1] = (v >> 8) & 255; rgb[i * 3 + 2] = v & 255; }
  writeFileSync(join(dir, 'labels.png'), encodePng({ w, h, rgb }));
  const json = {
    version: 1, id: s.id, params: s.params, source: s.source, photo: s.photo, rampGroups: s.rampGroups, colours: s.colours, meta: s.meta, zMoves: s.zMoves, tile: s.tile, tol: s.tol, edgeTol: s.edgeTol,
    edits: s.edits, textBoxes: s.textBoxes, built: s.built, regionCount: s.seg.regions.length,
    // for readers: the regions as the summary lists them
    regions: s.seg.regions.filter((r) => r.area > 0).map((r) => ({ id: r.id, area: r.area, bbox: r.bbox, z: s.z[r.id], colour: s.meta[r.id].colour, name: s.meta[r.id].name })),
  };
  writeFileSync(join(dir, 'scene.json'), JSON.stringify(json));
  return join(dir, 'scene.json');
}

export async function load(file: string, tmpPng: string): Promise<Scene> {
  const j = JSON.parse(readFileSync(file, 'utf8'));
  if (j.version !== 1) throw new Error(`${file}: not a scene file`);
  if (!existsSync(j.source.path)) throw new Error(`scene source image is gone: ${j.source.path}`);
  const bytes = readFileSync(j.source.path);
  if (j.source.sha1 && createHash('sha1').update(bytes).digest('hex') !== j.source.sha1) throw new Error(`scene source image changed since analyze: ${j.source.path} (analyze again)`);
  const src = await readImage(j.source.path, tmpPng);
  const { work, toSource, lab, quant, photo } = prepare(src, j.params);
  const lbl = decodePng(readFileSync(join(dirname(file), 'labels.png')));
  if (lbl.w !== work.w || lbl.h !== work.h) throw new Error(`${file}: labels don't match the image`);
  const map = new Int32Array(work.w * work.h);
  for (let i = 0; i < map.length; i++) map[i] = ((lbl.rgb[i * 3] << 16) | (lbl.rgb[i * 3 + 1] << 8) | lbl.rgb[i * 3 + 2]) - 2;
  const seg = { w: work.w, h: work.h, map, regions: regionStats(map, work.w, work.h, j.regionCount, lab, quant.labels) };
  const s: Scene = {
    id: j.id, dir: dirname(dirname(file)), params: j.params, source: j.source, work, toSource, lab, photo: j.photo ?? photo, rampGroups: j.rampGroups ?? [], quant, seg,
    colours: j.colours, meta: j.meta, zMoves: j.zMoves, tile: j.tile, tol: j.tol, edgeTol: j.edgeTol, edits: j.edits, textBoxes: j.textBoxes ?? [], built: j.built,
    pm: null as never, fits: [], z: [], prims: [], ramps: [], shapes: [], render: work, iou: [], estRmse: 0, ms: 0,
  };
  recompute(s);
  put(s);
  return s;
}

/** a scene by id (this server) or by scene.json path */
export async function get(idOrPath: string, tmpPng: string): Promise<Scene> {
  const s = mem.get(idOrPath);
  if (s) return s;
  if (/\.json$/i.test(idOrPath)) return load(idOrPath, tmpPng);
  throw new Error(`no scene "${idOrPath}" in this server (ids: ${[...mem.keys()].join(', ') || 'none'}); pass its scene.json path to reload it`);
}
