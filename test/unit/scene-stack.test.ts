import { describe, it, expect } from 'vitest';
import { rgbToLab, labToRgb } from '../../src/scene/color.js';
import { bilateral } from '../../src/scene/smooth.js';
import { quantize } from '../../src/scene/quantize.js';
import { segment } from '../../src/scene/regions.js';
import { planarMap } from '../../src/scene/planar.js';
import { fitEdges } from '../../src/scene/fitedges.js';
import { zOrder, stacked } from '../../src/scene/stack.js';
import { rasterize, rmse } from '../../src/scene/raster.js';
import { paint, rect, ellipse, below, type RGB } from './scene-fixtures.js';
import type { Img } from '../../src/image.js';

const BG: RGB = [240, 230, 210], BLUE: RGB = [40, 90, 170], ORANGE: RGB = [217, 130, 43], DARK: RGB = [40, 40, 40];
function build(img: Img, tile = false) {
  const lab = bilateral(rgbToLab(img)), seg = segment(lab, quantize(lab).labels);
  const pm = planarMap(seg.map, seg.w, seg.h), fits = fitEdges(pm), z = zOrder(pm, seg.regions);
  const shapes = stacked(pm, seg.regions, z, fits, { tile });
  const rs = shapes.map((s) => ({ loops: s.loops, rgb: labToRgb(seg.regions[s.region].L, seg.regions[s.region].a, seg.regions[s.region].b), evenodd: s.holes, id: s.region }));
  return { seg, pm, z, shapes, render: rasterize(rs, img.w, img.h, { ids: true }) };
}
const POSTER = () => paint(240, 180, [rect(20, 20, 120, 80, ORANGE), ellipse(100, 60, 30, 25, DARK), below((x) => 120 + 15 * Math.sin(x / 30), BLUE), ellipse(180, 140, 20, 15, ORANGE)], { bg: BG, noise: 2 });

describe('stack and raster', () => {
  it('z: encloser below the enclosed; the bottom shape is the whole image', () => {
    const { seg, z, shapes } = build(POSTER());
    const dark = seg.regions.find((r) => r.L < 25)!, orange = seg.regions.find((r) => r.a > 20 && r.area > 5000)!;
    expect(z[orange.id]).toBeLessThan(z[dark.id]);
    const bottom = shapes[0];
    expect(bottom.loops).toHaveLength(1); // one rectangle, nothing cut out
    expect(bottom.holes).toBe(false);
  });
  it('the stacked scene renders back to the labels (≥ 98.5 %) and close to the image', () => {
    const img = POSTER(), { seg, render } = build(img);
    let same = 0;
    for (let i = 0; i < seg.map.length; i++) if (render.ids![i] === seg.map[i]) same++;
    expect(same / seg.map.length).toBeGreaterThan(0.985);
    expect(rmse(img, render.img)).toBeLessThan(0.03);
  });
  it('seams: stacked has none over white, tiling shows them', () => {
    // two dark regions meeting along a curve, on a white page: any seam lets white through
    const img = paint(200, 120, [rect(0, 0, 200, 120, DARK), below((x) => 60 + 20 * Math.sin(x / 25), [30, 60, 120])], { ss: 4 });
    const seamMax = (r: Img) => {
      let m = 0;
      for (let x = 5; x < 195; x++) for (let y = 30; y < 90; y++) { const i = (y * 200 + x) * 3; m = Math.max(m, r.rgb[i] - Math.max(img.rgb[i], 60)); }
      return m;
    };
    expect(seamMax(build(img).render.img)).toBeLessThan(8);
    expect(seamMax(build(img, true).render.img)).toBeGreaterThan(20);
  });
  it('rasterize: exact coverage of a half-pixel square; evenodd holes', () => {
    const sq = (x: number, y: number, s: number) => [[[x, y], [x + s, y], [x + s, y], [x + s, y]], [[x + s, y], [x + s, y + s], [x + s, y + s], [x + s, y + s]], [[x + s, y + s], [x, y + s], [x, y + s], [x, y + s]], [[x, y + s], [x, y], [x, y], [x, y]]] as any;
    const r = rasterize([{ loops: [sq(1.5, 1, 2)], rgb: [0, 0, 0] }], 5, 4).img;
    expect(r.rgb[(1 * 5 + 1) * 3]).toBe(128); expect(r.rgb[(1 * 5 + 2) * 3]).toBe(0); expect(r.rgb[(1 * 5 + 3) * 3]).toBe(128);
    const ring = rasterize([{ loops: [sq(0, 0, 10), sq(3, 3, 4)], rgb: [0, 0, 0], evenodd: true }], 10, 10).img;
    expect(ring.rgb[(5 * 10 + 5) * 3]).toBe(255); expect(ring.rgb[(1 * 10 + 1) * 3]).toBe(0);
  });
});
