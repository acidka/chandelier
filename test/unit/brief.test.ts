// reply "brief" (default) / configure {reply: "full"} and per-call fields: MCP client → server → a stub bridge that answers like the runtime.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../src/server.js';
import { Transport } from '../../src/transport/transport.js';
import { project, LIST_MAX } from '../../src/tools/brief.js';
import { BUDGET } from '../../src/tools/respond.js';
import { defaultSettings } from '../../src/settings.js';

type Req = { cmd: string; args: any; settings: any };
const sent: Req[] = [];
const box = [10, 20, 30, 40];
const outList = (n: number) => ({ count: n, items: Array.from({ length: Math.min(n, 100) }, (_, i) => ({ uuid: String(100 + i), name: 'Dot ' + i, type: 'path', box })), ...(n > 100 ? { more: (n - 100) + ' more not listed' } : {}) });
const item = (a: any) => ({
  uuid: '7', type: 'text', name: 'Title', box, layer: 'Type', parent: 'layer:Type', geo: box, kind: 'point', contents: 'Лютий 2027', lines: 1,
  ...(a.runs !== false ? { runs: [{ text: 'Лютий 2027', font: 'ArialMT', size: 24 }] } : {}), ...(a.points ? { path: [[0, 0]], path_truncated: 3 } : {}),
});
const DOC = { name: 'b.ai', path: null, colorSpace: 'CMYK', saved: false, units: 'pt', bleed: { left: 0, top: 0, right: 0, bottom: 0, source: 'xmp' }, activeArtboard: 0,
  artboards: [{ i: 0, name: 'A', rect: [0, 0, 100, 100] }, { i: 1, name: 'B', rect: [120, 0, 100, 100] }], layers: [{ name: 'L', items: 1, all: 1 }], counts: { all: 1, text: 1 },
  globalSwatches: ['Navy = cmyk(100,85,30,25)'], spotColors: [], swatchCount: 6, paragraphStyles: ['Title'], characterStyles: [], fonts: { ArialMT: 1 }, issues: {}, selection: 0 };
function answer(cmd: string, a: any): unknown {
  if (cmd === 'get_items') return { count: 1, items: [item(a)] };
  if (cmd === 'document_info') return structuredClone(DOC);
  if (cmd === 'create_shape') return outList(a.n ?? a.items?.length ?? 1);
  if (cmd === 'script') return outList(30);
  if (cmd === 'batch') return { completed: a.steps.length, total: a.steps.length, results: a.steps.map((s: any) => ({ ok: true, data: answer(s.cmd, s.args) })) };
  return {};
}
class Stub extends Transport {
  override js(code: string): Promise<any> {
    const req: Req = JSON.parse(code.match(/AIA\.dispatch\(([\s\S]*)\);\}\)\(\)$/)![1]);
    sent.push(req);
    return Promise.resolve({ ok: true, result: '\u0001' + JSON.stringify({ ok: true, data: answer(req.cmd, req.args), doc: 'b.ai' }) });
  }
}

let client: Client;
const call = async (name: string, args: object = {}) => {
  const r: any = await client.callTool({ name, arguments: args });
  const t = r.content[0].text as string;
  let json: any; try { json = JSON.parse(t); } catch { json = t; }
  return { isError: !!r.isError, json, text: t };
};
const full = (fn: () => Promise<void>) => async () => { await call('configure', { reply: 'full' }); try { await fn(); } finally { await call('configure', { reply: 'brief' }); } };

beforeAll(async () => {
  const { server } = createServer({ transport: new Stub() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: 'test', version: '0' });
  await client.connect(b);
});
afterAll(async () => { await client.close(); });

describe('reply "full"', () => {
  it('sends the runtime\'s reply unchanged', full(async () => {
    expect((await call('create_shape', { x: 0, y: 0, w: 1, h: 1, items: Array.from({ length: 150 }, () => ({})) })).text).toBe(JSON.stringify(outList(150)));
    expect((await call('get_items', { refs: '7' })).text).toBe(JSON.stringify({ count: 1, items: [item({})] }));
    expect((await call('document_info', {})).text).toBe(JSON.stringify(DOC));
    const d = outList(150);
    expect(project('create_shape', structuredClone(d), {}, { ...defaultSettings('mac'), reply: 'full' })).toEqual(d);
  }));

  it('get_items fields: only those keys, runs and anchors only when named', full(async () => {
    const r = await call('get_items', { refs: '7', fields: ['uuid', 'contents'] });
    expect(Object.keys(r.json.items[0])).toEqual(['uuid', 'contents']);
    expect(sent.at(-1)!.args).toMatchObject({ runs: false, points: false });
    expect(sent.at(-1)!.args.fields).toBeUndefined();
    const p = await call('get_items', { refs: '7', fields: ['uuid', 'path'] });
    expect(p.json.items[0]).toEqual({ uuid: '7', path: [[0, 0]], path_truncated: 3 });
  }));

  it('unknown fields fail before Illustrator runs anything', async () => {
    const n = sent.length;
    expect((await call('get_items', { refs: '7', fields: ['colour'] })).text).toMatch(/get_items: unknown field "colour"/);
    expect((await call('document_info', { fields: ['inks'] })).text).toMatch(/document_info: unknown field "inks"/);
    expect((await call('batch', { steps: [{ tool: 'document_info', args: { fields: ['inks'] } }] })).text).toMatch(/unknown field "inks"/);
    expect(sent.length).toBe(n);
  });

  it('document_info fields: the head plus the named sections', full(async () => {
    const r = await call('document_info', { fields: ['styles', 'artboards'] });
    expect(Object.keys(r.json)).toEqual(['name', 'colorSpace', 'units', 'bleed', 'artboardCount', 'counts', 'issues', 'paragraphStyles', 'characterStyles', 'activeArtboard', 'artboards']);
    expect(r.json.artboardCount).toBe(2);
  }));
});

describe('reply "brief" (default)', () => {
  it('created items: the first 20 {uuid, box}, count and more kept', async () => {
    const r = await call('create_shape', { x: 0, y: 0, w: 1, h: 1, items: Array.from({ length: 150 }, () => ({})) });
    expect(r.json.count).toBe(150);
    expect(r.json.items).toHaveLength(LIST_MAX);
    expect(Object.keys(r.json.items[0])).toEqual(['uuid', 'box']);
    expect(r.json.more).toBe('130 more not listed');
  });

  it('get_items and document_info heads; runs and anchors not computed', async () => {
    expect(Object.keys((await call('get_items', { refs: '7' })).json.items[0])).toEqual(['uuid', 'type', 'name', 'box', 'geo']);
    expect(sent.at(-1)!.args).toMatchObject({ runs: false, points: false });
    expect(Object.keys((await call('get_items', { refs: '7', points: true })).json.items[0])).toEqual(['uuid', 'type', 'name', 'box', 'geo', 'path', 'path_truncated']);
    expect(Object.keys((await call('document_info', {})).json)).toEqual(['name', 'colorSpace', 'units', 'bleed', 'artboardCount', 'counts', 'issues']);
  });

  it('batch: each step projected; 4 big create steps stay under the clip', async () => {
    const steps = Array.from({ length: 4 }, () => ({ tool: 'create_shape', args: { x: 0, y: 0, w: 1, h: 1, items: Array.from({ length: 367 }, () => ({})) } }));
    const r = await call('batch', { steps });
    expect(r.isError, r.text).toBe(false);
    expect(r.text.length).toBeLessThan(BUDGET);
    expect(r.json.results.every((s: any) => s.data.items.length === LIST_MAX && s.data.count === 367)).toBe(true);
  });

  it('the agent\'s own run_script results keep their lists', async () => {
    const r = await call('batch', { steps: [{ tool: 'run_script', args: { code: 'return 1;' } }] });
    expect(r.json.results[0].data.items).toHaveLength(30);
  });

  it('CHANDELIER_REPLY=full starts the session full', () => {
    process.env.CHANDELIER_REPLY = 'full';
    try { expect(createServer({ transport: new Stub() }).ctx.settings.reply).toBe('full'); }
    finally { delete process.env.CHANDELIER_REPLY; }
    expect(createServer({ transport: new Stub() }).ctx.settings.reply).toBe('brief');
  });

  it('reply stays in Node: the runtime never sees it', async () => {
    await call('get_items', { refs: '7' });
    expect(sent.at(-1)!.settings.reply).toBeUndefined();
    expect(sent.at(-1)!.settings.units).toBe('pt');
  });
});
