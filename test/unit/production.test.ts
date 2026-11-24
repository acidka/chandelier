// 0.3 production automation, the parts that need no Illustrator: data parsing, ASE swatch files, file lists,
// tool profiles (lean list + the "tools" meta-tool).
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { parseCsv, normRows, fillPattern, patternFields, fileSafe } from '../../src/data.js';
import { parseAse, writeAse } from '../../src/ase.js';
import { expandFiles } from '../../src/tools/batch.js';
import { profile, LEAN } from '../../src/tools/tools_meta.js';
import { createServer } from '../../src/server.js';
import { Transport } from '../../src/transport/transport.js';

describe('data', () => {
  it('parses CSV: BOM, quotes, "" escapes, newlines in quotes, CRLF, blank lines', () => {
    const rows = parseCsv('﻿name,city,note\r\n"Андрій","Kyiv, UA","say ""hi""\nthen go"\r\n\r\nMaria,Lviv,\r\n');
    expect(rows).toEqual([{ name: 'Андрій', city: 'Kyiv, UA', note: 'say "hi"\nthen go' }, { name: 'Maria', city: 'Lviv', note: '' }]);
  });
  it('detects ; and tab delimiters, names empty headers, pads short rows', () => {
    expect(parseCsv('a;b\n1;2')).toEqual([{ a: '1', b: '2' }]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([{ a: '1', b: '2' }]);
    expect(parseCsv('a,,c\n1')).toEqual([{ a: '1', column2: '', c: '' }]);
  });
  it('turns inline rows into strings', () => {
    expect(normRows([{ n: 1, ok: true, x: null }])).toEqual([{ n: '1', ok: 'true', x: '' }]);
    expect(() => normRows([[1] as any])).toThrow(/row 1/);
  });
  it('fills {field} / {{field}} patterns and {n}', () => {
    expect(fillPattern('out/{name}-{{ city }}-{n}.pdf', { name: 'A/B', city: 'Kyiv' }, 7, fileSafe)).toBe('out/A_B-Kyiv-7.pdf');
    expect(fillPattern('{nope}', {}, 1)).toBe('{nope}');
    expect(patternFields('a {x} {{ y }}')).toEqual(['x', 'y']);
  });
});

describe('ase', () => {
  it('round-trips CMYK, RGB, gray and Lab swatches with groups and kinds', () => {
    const buf = writeAse([
      { name: 'Red', model: 'CMYK', values: [0, 0.95, 0.85, 0], type: 0, group: 'Brand' },
      { name: 'Teal', model: 'RGB ', values: [0, 0.5, 0.5], type: 1, group: 'Brand' },
      { name: 'Ink', model: 'Gray', values: [0.25], type: 2 },
      { name: 'Lab', model: 'LAB ', values: [0.5, -20, 30] },
    ]);
    expect(parseAse(buf)).toEqual([
      { name: 'Red', color: 'cmyk(0,95,85,0)', kind: 'global', group: 'Brand' },
      { name: 'Teal', color: '#008080', kind: 'spot', group: 'Brand' },
      { name: 'Ink', color: 'gray(75)', kind: 'process', group: undefined },
      { name: 'Lab', color: 'lab(50,-20,30)', kind: 'global', group: undefined },
    ]);
  });
  it('refuses other files', () => { expect(() => parseAse(Buffer.from('not a swatch file'))).toThrow(/Swatch Exchange/); });
});

describe('batch files', () => {
  it('expands folders (Illustrator files only) and globs; missing paths fail', () => {
    const d = mkdtempSync(join(tmpdir(), 'aia-files-'));
    for (const f of ['a.ai', 'b.AI', 'c.pdf', '.hidden.ai', 'x.txt']) writeFileSync(join(d, f), '');
    mkdirSync(join(d, 'sub.ai'));
    expect(expandFiles([d]).map((f) => f.slice(d.length + 1))).toEqual(['a.ai', 'b.AI', 'c.pdf']);
    expect(expandFiles([join(d, '*.ai'), join(d, 'a.ai')]).map((f) => f.slice(d.length + 1))).toEqual(['a.ai', 'b.AI']);
    expect(() => expandFiles([join(d, 'nope.ai')])).toThrow(/not found/);
  });
});

describe('tool profiles', () => {
  const all = ['status', 'documents', 'batch', 'run_script', 'preview', 'export', 'find_items', 'get_items', 'swatches'];
  it('full by default; lean; a list', () => {
    expect(profile(undefined, all)).toBeNull();
    expect(profile('full', all)).toBeNull();
    expect(profile('lean', all)).toEqual(LEAN);
    expect(profile('documents, swatches,nope', all)).toEqual(['documents', 'swatches']);
  });

  it('lean server: a small list, the rest through "tools"', async () => {
    const FAKE = fileURLToPath(new URL('./fake-illustrator.mjs', import.meta.url));
    const T = new Transport({ command: process.execPath, args: [FAKE] });
    const { server } = createServer({ transport: T, tools: 'lean' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const client = new Client({ name: 'test', version: '0' });
    await client.connect(b);
    try {
      const tools = (await client.listTools()).tools;
      expect(tools.map((t) => t.name).sort()).toEqual([...LEAN, 'tools'].sort());
      expect(JSON.stringify(tools).length).toBeLessThan(18_000); // 2026-11-24: 15.4 KB (full list: 53.6 KB)
      expect(client.getInstructions()).toMatch(/tools \{\}/);
      const call = async (args: object) => { const r: any = await client.callTool({ name: 'tools', arguments: args }); return { err: !!r.isError, text: r.content[0].text as string }; };
      const cat = JSON.parse((await call({})).text);
      expect(cat.map((t: any) => t.name)).toEqual(expect.arrayContaining(['data_merge', 'swatches', 'create_text']));
      expect(JSON.parse((await call({ query: 'recolor swatch library' })).text)[0].name).toBe('swatches');
      const sw = JSON.parse((await call({ name: 'swatches' })).text);
      expect(sw.input_schema.properties.action.enum).toContain('recolor');
      expect(sw.batch_step).toBe(true);
      const bad = await call({ call: 'swatches', args: { action: 'bogus' } });
      expect(bad.err).toBe(true);
      expect(bad.text).toMatch(/action/);
    } finally { await client.close(); T.stop(); }
  });
});
