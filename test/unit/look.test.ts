// 0.4 look and print depth, the parts that need no Illustrator: LiveEffect XML, visual diff, ICC profiles,
// PDF/X output intents.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { loadRuntime } from './shim.mjs';
import { diffRegions, type Img } from '../../src/image.js';
import { iccInfo, findProfile, conditionId } from '../../src/icc.js';
import { setOutputIntent, pdfInfo } from '../../src/pdf.js';

describe('effects XML', () => {
  const { A } = loadRuntime();
  A.S = { units: 'pt', origin: 'artboard', artboard: null };
  it('drop shadow with a CMYK colour, opacity in %, blend by name', () => {
    expect(A.effectXml({ type: 'drop_shadow', x: 4, y: 6, blur: 3, opacity: 50, color: 'cmyk(0,100,100,0)', blend: 'normal' })).toBe(
      '<LiveEffect name="Adobe Drop Shadow"><Dict data="I blnd 0 R opac 0.5 R horz 4 R vert 6 R blur 3 B usePSLBlur 1 I csrc 0 R dark 100 B pair 1 "><Entry name="sclr" valueType="F"><Fill color="1 0 1 1 0"/></Entry></Dict></LiveEffect>');
  });
  it('lengths in session units; RGB colours; parameter-only effects', () => {
    A.S = { units: 'mm', origin: 'artboard', artboard: null };
    expect(A.effectXml({ type: 'round_corners', radius: 5 })).toBe('<LiveEffect name="Adobe Round Corners"><Dict data="R radius 14.1732 "/></LiveEffect>');
    A.S = { units: 'pt', origin: 'artboard', artboard: null };
    expect(A.effectXml({ type: 'outer_glow', color: '#ff0000' })).toContain('<Fill color="5 1 0 0"/>');
    expect(A.effectXml({ type: 'feather' })).toBe('<LiveEffect name="Adobe Fuzzy Mask"><Dict data="R Radius 10 "/></LiveEffect>');
    expect(A.effectXml({ type: 'offset', distance: 3, joins: 'round' })).toContain('R ofst 3 I jntp 0 ');
    // transform: y down in the tools, Illustrator's moveV is up
    expect(A.effectXml({ type: 'transform', y: 10, rotate: 90, copies: 2 })).toMatch(/R moveV_Pts -10 .*R rotate_Degrees 90 R rotate_Radians 1.5708 I numCopies 2 /);
    expect(A.effectXml({ xml: '<LiveEffect name="X"/>' })).toBe('<LiveEffect name="X"/>');
  });
  it('explains unknown effects and blends', () => {
    expect(() => A.effectXml({ type: 'sparkle' })).toThrow(/Unknown effect "sparkle".*drop_shadow/);
    expect(() => A.effectXml({ type: 'drop_shadow', blend: 'glow' })).toThrow(/Unknown blend/);
  });
});

describe('visual diff', () => {
  const W = 200, H = 100;
  const page = (rects: [number, number, number, number, number][]): Img => {
    const rgb = new Uint8Array(W * H * 3).fill(255);
    for (const [x, y, w, h, v] of rects) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) rgb.fill(v, (j * W + i) * 3, (j * W + i) * 3 + 3);
    return { w: W, h: H, rgb };
  };
  it('finds a moved block and measures the shift', () => {
    const r = diffRegions(page([[40, 30, 30, 20, 0]]), page([[48, 34, 30, 20, 0]]));
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe('shifted');
    expect(r[0].shift).toEqual([0.04, 0.04]); // 8 px of 200, 4 px of 100
  });
  it('tells missing, extra and changed apart', () => {
    const ref = page([[20, 20, 20, 20, 0], [120, 20, 20, 20, 0]]);
    expect(diffRegions(ref, page([[20, 20, 20, 20, 0]]))[0].kind).toBe('missing');
    expect(diffRegions(page([[20, 20, 20, 20, 0]]), ref)[0].kind).toBe('extra');
    expect(diffRegions(ref, page([[20, 20, 20, 20, 0], [120, 20, 20, 20, 120]]))[0].kind).toBe('changed');
    expect(diffRegions(ref, ref)).toEqual([]);
    // a light colour is content too (a mid green rendered at grey 152 on Windows was missed)
    expect(diffRegions(page([]), page([[20, 20, 20, 20, 190]]))[0].kind).toBe('extra');
  });
});

/** A minimal ICC profile: header + one 'desc' tag. */
function icc(name: string, space = 'CMYK'): Buffer {
  const desc = Buffer.alloc(12 + name.length + 1);
  desc.write('desc', 0, 'latin1'); desc.writeUInt32BE(name.length + 1, 8); desc.write(name, 12, 'latin1');
  const b = Buffer.alloc(144 + desc.length);
  b.writeUInt32BE(b.length, 0); b.write('prtr', 12, 'latin1'); b.write(space.padEnd(4), 16, 'latin1'); b.write('acsp', 36, 'latin1');
  b.writeUInt32BE(1, 128); b.write('desc', 132, 'latin1'); b.writeUInt32BE(144, 136); b.writeUInt32BE(desc.length, 140);
  desc.copy(b, 144);
  return b;
}

describe('ICC profiles and output intents', () => {
  const d = mkdtempSync(join(tmpdir(), 'aia-icc-'));
  writeFileSync(join(d, 'CoatedFOGRA39.icc'), icc('Coated FOGRA39 (ISO 12647-2:2004)'));
  writeFileSync(join(d, 'GRACoL.icc'), icc('Coated GRACoL 2006 (ISO 12647-2:2004)'));
  writeFileSync(join(d, 'srgb.icc'), icc('sRGB IEC61966-2.1', 'RGB'));
  it('reads names and finds CMYK profiles by part of the name', () => {
    expect(iccInfo(icc('X', 'RGB'))).toMatchObject({ name: 'X', space: 'RGB', cls: 'prtr' });
    expect(findProfile('fogra39', [d]).name).toBe('Coated FOGRA39 (ISO 12647-2:2004)');
    expect(() => findProfile('coated', [d])).toThrow(/several.*FOGRA39.*GRACoL/);
    expect(() => findProfile('srgb', [d])).toThrow(/no CMYK profiles/);
    expect(conditionId('Coated FOGRA39 (ISO 12647-2:2004)')).toBe('FOGRA39');
    expect(conditionId('Coated GRACoL 2006 (ISO 12647-2:2004)')).toBe('CGATS TR 006');
  });
  it('writes the output intent into a PDF and reads it back', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([100, 100]);
    const f = join(d, 'a.pdf');
    writeFileSync(f, await pdf.save());
    expect((await pdfInfo(f)).output_intent).toBeNull();
    await setOutputIntent(f, findProfile('fogra39', [d]));
    const info = await pdfInfo(f);
    expect(info.output_intent).toBe('Coated FOGRA39 (ISO 12647-2:2004)');
    expect(info.pages).toBe(1);
  });
});
