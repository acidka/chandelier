import { describe, it, expect } from 'vitest';
import { analyze } from '../../src/scene/analyze.js';
import { applyEdits } from '../../src/scene/edits.js';
import { summary } from '../../src/scene/summary.js';
import { buildSteps } from '../../src/scene/build.js';
import { paint, rect, ellipse, type RGB } from './scene-fixtures.js';

const P = { image: 'x', colors: 16, minDe: 6, detail: 'normal' as const, maxPx: 1000 };
const BG: RGB = [240, 230, 210], DARK: RGB = [30, 30, 30], BLUE: RGB = [40, 90, 170], WHITE: RGB = [250, 250, 250];
// "text": three dark bars in a row (letters), a logo (blue disc with a white dot), a photo box (orange)
const img = () => paint(300, 200, [rect(20, 30, 12, 30, DARK), rect(40, 30, 12, 30, DARK), rect(60, 30, 12, 30, DARK), ellipse(200, 60, 40, 40, BLUE), ellipse(200, 60, 12, 12, WHITE), rect(30, 110, 100, 70, [217, 130, 43])], { bg: BG, noise: 1 });

describe('scene S4 hooks', () => {
  it('text box: the regions in it are left out, build reports the box in session units with ink and cap height', () => {
    const s = analyze(img(), P, { dir: '/tmp', path: 'x' });
    applyEdits(s, ['text 15 25 65 40']);
    const letters = s.seg.regions.filter((r) => r.area > 0 && r.cx < 80 && r.cy < 70);
    expect(letters).toHaveLength(3);
    expect(letters.every((r) => s.meta[r.id].text)).toBe(true);
    expect(summary(s)).toMatch(/ text /);
    const b = buildSteps(s, { rect: [0, 0, 150, 100] });
    expect(b.regions.some((r) => s.meta[r].text)).toBe(false);
    expect(b.textBoxes).toHaveLength(1);
    expect(b.textBoxes[0]).toMatchObject({ rect: [7.5, 12.5, 32.5, 20], cap: 15 }); // the letters' height (30 px × 0.5), not the box's (F44, F50)
    expect(b.textBoxes[0].colour).toMatch(/^#1e1e1e|#1f1f1f|#1d1d1d/);
    expect(() => applyEdits(s, ['text 290 190 5 5'])).toThrow(/no region/);
  });
  it('logo: grouped with what lies on it, fitted finer; placeholder: an empty named box on top', () => {
    const s = analyze(img(), P, { dir: '/tmp', path: 'x' });
    const R = s.seg.regions, disc = R.findIndex((r) => r.area > 0 && r.b < -20), dot = R.findIndex((r) => r.area > 0 && r.L > 95 && r.cx > 150), box = R.findIndex((r) => r.area > 0 && r.a > 20);
    applyEdits(s, [`r${disc} logo`, `r${box} placeholder`, `name r${box} Photo`]);
    expect(s.meta[dot].tol).toBe(0.75); // half the default 1.5
    const steps = buildSteps(s, { rect: [0, 0, 300, 200] }).batches[0];
    const g = steps.find((x) => x.tool === 'arrange_items')!;
    expect(g.args).toMatchObject({ action: 'group', name: `Logo r${disc}` });
    expect((g.args.refs as string[]).sort()).toEqual([`name:Scene r${disc}`, `name:Scene r${dot}`].sort());
    const ph = steps[steps.length - 1];
    expect(ph).toMatchObject({ tool: 'create_shape', args: { shape: 'rect', fill: 'none', name: 'Photo' } });
    expect(summary(s)).toMatch(/ box /); expect(summary(s)).toMatch(/ logo /);
  });
});
