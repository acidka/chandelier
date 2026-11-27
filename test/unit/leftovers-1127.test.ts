// Small fixes 2026-11-27: F20 bilinear create_path map, F49 region boxes in the scene summary, font-not-found suggestions.
import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { bilinearMap } from '../../src/fitcurve.js';
import { rectify } from '../../src/scene/rectify.js';
import { create_path } from '../../src/tools/create_path.js';
import { analyze } from '../../src/scene/analyze.js';
import { summary } from '../../src/scene/summary.js';
import { loadRuntime } from './shim.mjs';
import { paint, rect, type RGB } from './scene-fixtures.js';

describe('F20 create_path {map: {bilinear}}', () => {
  const face = [[100, 50], [400, 80], [380, 300], [120, 260]];
  it('inverts the scene\'s bilinear rectify: a source point lands where the scene put it', () => {
    const src = { w: 500, h: 400, rgb: new Uint8Array(500 * 400 * 3) };
    const r = rectify(src, { map: face, bilinear: true, maxPx: 300 });
    const { w, h } = r.img, m = bilinearMap(face, [[0, 0], [w, 0], [w, h], [0, h]]);
    for (const [x, y] of [[10, 10], [150, 90], [w - 5, h - 7], [w / 2, h / 3]]) {
      const back = m(r.toSource(x, y));
      expect(back[0]).toBeCloseTo(x, 6); expect(back[1]).toBeCloseTo(y, 6);
    }
  });
  it('create_path takes bilinear in map', () => {
    const st = create_path.step!({ fit: [[100, 50], [400, 80]], map: { from: face, to: [[0, 0], [300, 0], [300, 200], [0, 200]], bilinear: true } } as any, {} as any) as any;
    expect(st.args.d).toMatch(/^M\s*0[ ,]+0/);
    expect(st.args.map).toBeUndefined();
  });
});

describe('F49 scene summary has a where column', () => {
  it('each row gives the region box in analyzed px', () => {
    const BG: RGB = [240, 230, 210];
    const s = analyze(paint(200, 100, [rect(20, 30, 40, 20, [40, 90, 170])], { bg: BG, noise: 1 }), { image: 'x', colors: 16, minDe: 6, detail: 'normal', maxPx: 1000 }, { dir: '/tmp', path: 'x' });
    const text = summary(s);
    expect(text).toMatch(/ where /);
    expect(text.split('\n').some((l) => /^r\d+ .* 2[01],3[01] (39|40|41)x(19|20|21) /.test(l))).toBe(true);
  });
});

describe('fonts: not found names close installed faces', () => {
  it('"Myriad Pro Bold" with only Myriad Variable Concept installed suggests it', () => {
    const { ctx, dispatch } = loadRuntime();
    const fonts = [{ name: 'MyriadVariableConcept-Bold', family: 'Myriad Variable Concept', style: 'Bold' }, { name: 'ArialMT', family: 'Arial', style: 'Regular' }];
    ctx.app.textFonts = vm.runInContext('(function (l) { var a = l.slice(0); a.getByName = function (n) { for (var i = 0; i < a.length; i++) if (a[i].name === n) return a[i]; throw new Error("no"); }; return a; })', ctx)(vm.runInContext(JSON.stringify(fonts), ctx));
    const env = dispatch({ cmd: 'script', args: { code: 'AIA.font("Myriad Pro Bold")' } });
    const msg = JSON.stringify(env);
    expect(msg).toMatch(/Font not found/);
    expect(msg).toMatch(/MyriadVariableConcept-Bold/);
  });
});
