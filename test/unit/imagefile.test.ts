import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { imageColorMode } from '../../src/imagefile.js';

const dir = mkdtempSync(join(tmpdir(), 'aia-img-'));
const file = (name: string, bytes: number[]) => { const p = join(dir, name); writeFileSync(p, Buffer.from(bytes)); return p; };
const png = (type: number) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, type, 0, 0, 0];
const jpg = (comps: number) => [0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, comps, 1, 0x11, 0, 0, 0];
const psd = (mode: number) => [0x38, 0x42, 0x50, 0x53, 0, 1, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 1, 0, 0, 0, 1, 0, 8, 0, mode, 0, 0];

describe('imageColorMode', () => {
  it.each([
    ['rgb.png', png(2), 'rgb'], ['rgba.png', png(6), 'rgb'], ['gray.png', png(0), 'gray'], ['pal.png', png(3), 'indexed'],
    ['rgb.jpg', jpg(3), 'rgb'], ['cmyk.jpg', jpg(4), 'cmyk'], ['gray.jpg', jpg(1), 'gray'],
    ['rgb.psd', psd(3), 'rgb'], ['cmyk.psd', psd(4), 'cmyk'], ['x.bin', [1, 2, 3], 'unknown'],
  ])('%s → %s', (name, bytes, want) => expect(imageColorMode(file(name, bytes as number[]))).toBe(want));
});
