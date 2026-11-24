// Phase 8 panel MVP: the CEP panel core (src/cep/panel-core.js) and PanelTransport talking over a real local socket,
// with a fake evalScript standing in for Illustrator. No Illustrator needed.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { PanelTransport, EventLog, panelFile } from '../../src/transport/panel.js';
import { createServer } from '../../src/server.js';

const require = createRequire(import.meta.url);
const { createPanel, diff } = require('../../src/cep/panel-core.js');
const FAKE_BRIDGE = fileURLToPath(new URL('./fake-bridge.mjs', import.meta.url));
const SNAP = '/*snapshot*/';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (f: () => boolean, ms = 2000) => { const end = Date.now() + ms; while (!f() && Date.now() < end) await sleep(10); return f(); };

type World = { doc: string | null; docs: number; saved: boolean; count: number; items: { uuid: string; type: string; name: string }[] };
let home: string, world: World, scripts: string[], panel: any, T: PanelTransport | null;

const fakeEval = (code: string, cb: (r: string) => void) => {
  setTimeout(() => {
    if (code === SNAP) return cb(JSON.stringify(world));
    scripts.push(code);
    if (code === 'throw') return cb('EvalScript error.');
    cb('ran:' + code);
  }, 2);
};
const makeT = () => (T = new PanelTransport({ file: panelFile(home), retryMs: 0, command: process.execPath, args: [FAKE_BRIDGE] }));

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'aia-panel-'));
  world = { doc: 'A.ai', docs: 1, saved: true, count: 0, items: [] };
  scripts = [];
  panel = createPanel({ evalScript: fakeEval, snapshot: SNAP, home, pollMs: 20, version: '9.9.9' });
  await panel.start();
  T = null;
});
afterEach(() => { T?.stop(); panel.stop(); rmSync(home, { recursive: true, force: true }); });

describe('panel diff', () => {
  const base = { doc: 'A.ai', docs: 1, saved: true, count: 0, items: [] };
  it('first snapshot is the baseline: no events', () => expect(diff(null, base)).toEqual([]));
  it('document switch, saved and edited', () => {
    expect(diff(base, { ...base, doc: 'B.ai', docs: 2 })[0]).toMatchObject({ type: 'document', doc: 'B.ai', previous: 'A.ai' });
    expect(diff(base, { ...base, saved: false })).toEqual([{ type: 'edited', doc: 'A.ai' }]);
    expect(diff({ ...base, saved: false }, base)).toEqual([{ type: 'saved', doc: 'A.ai' }]);
  });
  it('a document switch reports a selection only when something is selected there', () => {
    expect(diff(base, { ...base, doc: 'B.ai', docs: 2 }).map((e: any) => e.type)).toEqual(['document']);
    const sel = { ...base, doc: 'B.ai', docs: 2, count: 1, items: [{ uuid: '9', type: 'PathItem', name: '' }] };
    expect(diff(base, sel).map((e: any) => e.type)).toEqual(['document', 'selection']);
  });
  it('selection changes by uuid, and text cursor moves', () => {
    const one = { ...base, count: 1, items: [{ uuid: '7', type: 'PathItem', name: '' }] };
    expect(diff(base, one)).toEqual([{ type: 'selection', doc: 'A.ai', count: 1, items: one.items }]);
    expect(diff(one, { ...one })).toEqual([]);
    const t1 = { ...one, text: { uuid: '7', text: 'Hel' } };
    expect(diff(t1, { ...one, text: { uuid: '7', text: 'Hello' } })[0].type).toBe('selection');
  });
  it('a failed snapshot produces no events', () => expect(diff(base, { error: 'x' })).toEqual([]));
});

describe('panel socket', () => {
  it('writes a private discovery file and removes it on stop', () => {
    const f = panelFile(home);
    const info = JSON.parse(readFileSync(f, 'utf8'));
    expect(info.port).toBeGreaterThan(0);
    expect(info.token).toHaveLength(48);
    if (process.platform !== 'win32') expect(statSync(f).mode & 0o777).toBe(0o600);
    panel.stop();
    expect(existsSync(f)).toBe(false);
    panel = createPanel({ evalScript: fakeEval, snapshot: SNAP, home }); // afterEach stops it
  });

  it('runs scripts through the panel, one at a time, in order', async () => {
    makeT();
    const rs = await Promise.all([T!.js('a'), T!.js('b'), T!.js('Січень')]);
    // non-ASCII leaves as \uXXXX escapes, as with the OS bridges
    expect(rs.map((r) => r.result)).toEqual(['ran:a', 'ran:b', 'ran:\\u0421\\u0456\\u0447\\u0435\\u043d\\u044c']);
    expect(T!.connected).toBe(true);
    expect(T!.panelVersion).toBe('9.9.9');
    expect(T!.spawns).toBe(0); // the OS bridge was never started
  });

  it('reports a script that threw in the panel engine', async () => {
    makeT();
    const r = await T!.js('throw');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/failed in Illustrator/);
  });

  it('drops a client with a wrong token', async () => {
    const f = panelFile(home);
    const good = JSON.parse(readFileSync(f, 'utf8'));
    writeFileSync(f, JSON.stringify({ ...good, token: 'x'.repeat(48) }));
    makeT();
    expect(await T!.ensure()).toBe(false);
    expect(panel.info().clients).toBe(0);
  });

  it('falls back to the OS bridge when the panel is not open', async () => {
    panel.stop();
    panel = createPanel({ evalScript: fakeEval, snapshot: SNAP, home: join(home, 'other') });
    makeT();
    const r = await T!.js('echo:hi');
    expect(r).toMatchObject({ ok: true, result: 'hi' });
    expect(T!.connected).toBe(false);
    expect(T!.spawns).toBe(1);
  });

  it('pushes selection, edit and document events; marks changes right after an agent call', async () => {
    makeT();
    await T!.ensure();
    await until(() => panel.info().state !== null);
    world.count = 1; world.items = [{ uuid: '42', type: 'TextFrame', name: 'Headline' }];
    expect(await until(() => T!.events.since(0, ['selection']).length > 0)).toBe(true);
    const sel = T!.events.since(0, ['selection'])[0];
    expect(sel).toMatchObject({ type: 'selection', count: 1, items: [{ uuid: '42' }] });
    expect(sel.after_agent).toBeUndefined();
    expect(T!.state).toMatchObject({ doc: 'A.ai', count: 1 });

    await T!.js('modify');
    world.saved = false;
    expect(await until(() => T!.events.since(0, ['edited']).length > 0)).toBe(true);
    expect(T!.events.since(0, ['edited'])[0].after_agent).toBe(true);

    world.doc = 'B.ai'; world.docs = 2; world.count = 0; world.items = []; // B.ai has unsaved changes too
    expect(await until(() => T!.events.since(0, ['document']).length > 0)).toBe(true);
    expect(T!.events.since(0, ['document'])[0]).toMatchObject({ doc: 'B.ai', saved: false });
    expect(T!.state).toMatchObject({ doc: 'B.ai', saved: false, count: 0, items: [] });
  });

  it('sends the current state once the first snapshot arrives, before anything changes', async () => {
    makeT();
    await T!.ensure();
    expect(await until(() => T!.state !== null)).toBe(true);
    expect(T!.state).toMatchObject({ doc: 'A.ai', count: 0 });
    expect(T!.events.since(0, ['selection', 'document'])).toEqual([]);
  });

  it('pausing stops events; the designer decides', async () => {
    makeT();
    await T!.ensure();
    await until(() => panel.info().state !== null);
    panel.setSharing(false);
    expect(await until(() => T!.events.since(0, ['paused']).length > 0)).toBe(true);
    const n = T!.events.last;
    world.count = 3;
    await sleep(100);
    expect(T!.events.since(n)).toEqual([]);
    expect(T!.state).toBeNull();
  });

  it('a closed panel fails the pending call and is reported', async () => {
    makeT();
    await T!.ensure();
    const slow = T!.js('x');
    panel.stop();
    const r = await slow;
    // the call either got its answer before the socket closed, or fails with the panel message
    if (!r.ok) expect(r.error).toMatch(/panel closed/);
    expect(await until(() => T!.events.since(0, ['panel']).some((e) => e.connected === false))).toBe(true);
    expect(T!.connected).toBe(false);
    panel = createPanel({ evalScript: fakeEval, snapshot: SNAP, home });
  });
});

describe('event log', () => {
  it('long-polls until an event arrives, or times out empty', async () => {
    const log = new EventLog();
    const t0 = Date.now();
    setTimeout(() => log.push({ type: 'selection', count: 1 }), 50);
    const got = await log.wait(0, 2000);
    expect(got).toHaveLength(1);
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(await log.wait(log.last, 30)).toEqual([]);
  });
  it('filters by type and keeps the newest 200', () => {
    const log = new EventLog();
    for (let i = 0; i < 250; i++) log.push({ type: i % 2 ? 'selection' : 'edited' });
    expect(log.since(0)).toHaveLength(200);
    expect(log.since(240, ['edited']).map((e) => e.seq)).toEqual([241, 243, 245, 247, 249]);
  });
});

describe('events tool', () => {
  it('is listed only with the panel transport and returns events with a cursor', async () => {
    makeT();
    const { server } = createServer({ transport: T! });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const client = new Client({ name: 'test', version: '0' });
    await client.connect(b);
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain('events');

    await T!.ensure();
    await until(() => panel.info().state !== null);
    const first: any = await client.callTool({ name: 'events', arguments: {} });
    const cursor = JSON.parse(first.content[0].text).next;
    setTimeout(() => { world.count = 1; world.items = [{ uuid: '5', type: 'PathItem', name: 'Logo' }]; }, 50);
    const r: any = await client.callTool({ name: 'events', arguments: { since: cursor, wait: 5, types: ['selection'] } });
    const body = JSON.parse(r.content[0].text);
    expect(body.events[0]).toMatchObject({ type: 'selection', items: [{ uuid: '5', name: 'Logo' }] });
    expect(body.next).toBe(body.events[0].seq);
    expect(body.panel).toBe('connected');
    await client.close();

    const plain = createServer({ transport: new (await import('../../src/transport/transport.js')).Transport() });
    expect([...plain.ctx.tools.keys()]).not.toContain('events');
  });
});

describe('snapshot.jsx (runs inside Illustrator every poll tick)', () => {
  const src = readFileSync(fileURLToPath(new URL('../../src/cep/host/snapshot.jsx', import.meta.url)), 'utf8');
  const run = (app: object) => JSON.parse(require('node:vm').runInNewContext(src, { app }));
  it('no document', () => expect(run({ documents: { length: 0 } })).toEqual({ doc: null, docs: 0, saved: true, count: 0, items: [] }));
  it('selected items: first 10, with uuids, names and text', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ uuid: String(100 + i), typename: i ? 'PathItem' : 'TextFrame', name: i ? '' : 'Заголовок "1"', contents: 'Hello\nworld' }));
    const s = run({ documents: { length: 2 }, activeDocument: { name: 'Poster.ai', saved: false, selection: items } });
    expect(s).toMatchObject({ doc: 'Poster.ai', docs: 2, saved: false, count: 12 });
    expect(s.items).toHaveLength(10);
    expect(s.items[0]).toEqual({ uuid: '100', type: 'TextFrame', name: 'Заголовок "1"', text: 'Hello\nworld' });
  });
  it('text cursor inside a frame', () => {
    const frame = { uuid: '7', name: 'Title' };
    const s = run({ documents: { length: 1 }, activeDocument: { name: 'A.ai', saved: true, selection: { typename: 'TextRange', contents: 'abc', story: { textFrames: [frame] } } } });
    expect(s).toMatchObject({ count: 1, items: [{ uuid: '7', type: 'TextFrame', name: 'Title' }], text: { uuid: '7', text: 'abc' } });
  });
  it('an error becomes {error}', () => expect(run({ get documents(): never { throw new Error('busy'); } })).toEqual({ error: 'busy' }));
});
