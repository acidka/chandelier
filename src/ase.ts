// Adobe Swatch Exchange (.ase) reader (0.3): swatches {action: "import"}. Format: "ASEF", version (2 × u16),
// block count (u32), blocks [type u16, length u32, data]: 0xC001 group start (name), 0xC002 group end,
// 0x0001 colour (name, model "CMYK"/"RGB "/"LAB "/"Gray", big-endian float32 values, type u16: 0 global, 1 spot, 2 normal).
import { readFileSync } from 'node:fs';

export interface AseSwatch { name: string; color: string; kind: 'global' | 'spot' | 'process'; group?: string }

const r = (v: number, k = 100) => Math.round(v * k * 100) / 100;
const hex = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');

export function parseAse(buf: Buffer): AseSwatch[] {
  if (buf.length < 12 || buf.toString('latin1', 0, 4) !== 'ASEF') throw new Error('not an Adobe Swatch Exchange (.ase) file');
  const n = buf.readUInt32BE(8), out: AseSwatch[] = [];
  let p = 12, group: string | undefined;
  const name = (at: number): [string, number] => {
    const len = buf.readUInt16BE(at); // UTF-16 code units, including the closing 0
    let s = '';
    for (let i = 0; i < len; i++) { const c = buf.readUInt16BE(at + 2 + i * 2); if (c) s += String.fromCharCode(c); }
    return [s, at + 2 + len * 2];
  };
  for (let b = 0; b < n && p + 6 <= buf.length; b++) {
    const type = buf.readUInt16BE(p), len = buf.readUInt32BE(p + 2), start = p + 6;
    p = start + len;
    if (type === 0xc001) { group = name(start)[0] || undefined; continue; }
    if (type === 0xc002) { group = undefined; continue; }
    if (type !== 0x0001) continue;
    let [nm, q] = name(start);
    const model = buf.toString('latin1', q, q + 4); q += 4;
    const f = (k: number) => buf.readFloatBE(q + 4 * k);
    let color: string, cnt: number;
    if (model === 'CMYK') { color = `cmyk(${r(f(0))},${r(f(1))},${r(f(2))},${r(f(3))})`; cnt = 4; }
    else if (model === 'RGB ') { color = '#' + hex(f(0)) + hex(f(1)) + hex(f(2)); cnt = 3; }
    else if (model === 'LAB ') { color = `lab(${r(f(0))},${r(f(1), 1)},${r(f(2), 1)})`; cnt = 3; }
    else if (model === 'Gray') { color = `gray(${r(1 - f(0))})`; cnt = 1; } // ASE gray is a lightness (1 = white); gray(k) is ink
    else continue;
    const t = buf.readUInt16BE(q + 4 * cnt);
    if (!nm) nm = color;
    out.push({ name: nm, color, kind: t === 1 ? 'spot' : t === 2 ? 'process' : 'global', group });
  }
  return out;
}

export const readAse = (path: string): AseSwatch[] => parseAse(readFileSync(path));

/** Writer for tests and round trips. */
export function writeAse(list: { name: string; model: 'CMYK' | 'RGB ' | 'LAB ' | 'Gray'; values: number[]; type?: number; group?: string }[]): Buffer {
  const blocks: Buffer[] = [];
  const nameBuf = (s: string) => { const b = Buffer.alloc(2 + (s.length + 1) * 2); b.writeUInt16BE(s.length + 1, 0); for (let i = 0; i < s.length; i++) b.writeUInt16BE(s.charCodeAt(i), 2 + i * 2); return b; };
  const block = (type: number, data: Buffer) => { const h = Buffer.alloc(6); h.writeUInt16BE(type, 0); h.writeUInt32BE(data.length, 2); blocks.push(h, data); };
  let group: string | undefined, count = 0;
  for (const s of list) {
    if (s.group !== group) { if (group) { block(0xc002, Buffer.alloc(0)); count++; } if (s.group) { block(0xc001, nameBuf(s.group)); count++; } group = s.group; }
    const v = Buffer.alloc(s.values.length * 4 + 2);
    s.values.forEach((x, i) => v.writeFloatBE(x, i * 4));
    v.writeUInt16BE(s.type ?? 0, s.values.length * 4);
    block(0x0001, Buffer.concat([nameBuf(s.name), Buffer.from(s.model, 'latin1'), v])); count++;
  }
  if (group) { block(0xc002, Buffer.alloc(0)); count++; }
  const h = Buffer.alloc(12); h.write('ASEF', 0, 'latin1'); h.writeUInt16BE(1, 4); h.writeUInt16BE(0, 6); h.writeUInt32BE(count, 8);
  return Buffer.concat([h, ...blocks]);
}
