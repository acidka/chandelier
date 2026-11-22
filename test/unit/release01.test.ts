// 0.1 release: tool fixes from the logo job (SVG clipped to the artboard, contrast maths).
import { describe, it, expect } from 'vitest';
import { clipSvgToViewBox } from '../../src/tools/export.js';
import { loadRuntime } from './shim.mjs';

describe('SVG export clipped to the artboard', () => {
  const svg = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 640"><circle cx="0" cy="0" r="900"/></svg>';
  it('wraps the art in a clip path the size of the viewBox', () => {
    const out = clipSvgToViewBox(svg);
    expect(out).toContain('<clipPath id="chandelier-artboard"><rect x="0" y="0" width="1280" height="640"/></clipPath>');
    expect(out).toMatch(/<g clip-path="url\(#chandelier-artboard\)"><circle[^>]*\/><\/g><\/svg>$/);
  });
  it('is idempotent and leaves SVGs without a viewBox alone', () => {
    const once = clipSvgToViewBox(svg);
    expect(clipSvgToViewBox(once)).toBe(once);
    const noVb = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect/></svg>';
    expect(clipSvgToViewBox(noVb)).toBe(noVb);
  });
});

describe('contrast ratio (WCAG)', () => {
  const { A } = loadRuntime();
  it('matches known values', () => {
    expect(A.contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1);
    expect(A.contrastRatio([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 5);
    expect(A.contrastRatio([0x94, 0x60, 0x0f], [0xf6, 0xf3, 0xec])).toBeCloseTo(4.81, 1); // brand "Amber text" on Paper
  });
});
