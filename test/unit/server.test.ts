import { fileURLToPath } from 'node:url';
// Full stack minus Apple events: MCP client → server → Transport → fake bridge → real runtime in a vm.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../src/server.js';
import { Transport } from '../../src/transport/transport.js';

const FAKE = fileURLToPath(new URL('./fake-illustrator.mjs', import.meta.url));
let client: Client, T: Transport;
const call = async (name: string, args: object = {}) => {
  const r: any = await client.callTool({ name, arguments: args });
  const t = r.content.filter((c: any) => c.type === 'text').map((c: any) => c.text);
  let json: any; try { json = JSON.parse(t[0]); } catch { json = t[0]; }
  return { isError: !!r.isError, json, texts: t };
};

beforeAll(async () => {
  T = new Transport({ command: process.execPath, args: [FAKE] });
  const { server } = createServer({ transport: T });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: 'test', version: '0' });
  await client.connect(b);
});
afterAll(async () => { await client.close(); T.stop(); });

describe('server', () => {
  it('lists the phase 1 tools with instructions', async () => {
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['status', 'configure', 'documents', 'document_info', 'run_script', 'batch', 'preview']));
    expect(client.getInstructions()).toMatch(/Illustrator/);
  });

  it('keeps the tool list small (every agent request re-reads it)', async () => {
    const tools = (await client.listTools()).tools;
    const json = JSON.stringify(tools);
    expect(json.length).toBeLessThan(50_000); // 2026-11-22: 48.9 KB after slimming from 61.6 KB
    expect(json).not.toContain('"$schema"');
    expect(json).not.toContain('9007199254740991');
    for (const name of ['create_text', 'create_shape', 'create_path', 'modify_items']) {
      const items = (tools.find((x) => x.name === name)!.inputSchema.properties as any).items;
      expect(items.items.properties ?? null).toBeNull(); // items[] must not repeat the full props
    }
  });

  it('offers the two task prompts', async () => {
    const names = (await client.listPrompts()).prompts.map((p) => p.name);
    expect(names).toEqual(['recreate_design', 'print_export']);
    const p = await client.getPrompt({ name: 'recreate_design', arguments: { image: 'a.jpg', output: 'a.ai' } });
    expect((p.messages[0].content as any).text).toMatch(/preview \{reference: "a.jpg"/);
  });

  it('run_script retries when the script returns RETRY', async () => {
    const r = await call('run_script', { code: '$.global.__n = ($.global.__n || 0) + 1; return $.global.__n < 3 ? "RETRY" : "done";', retries: 3 });
    expect(r.json).toMatchObject({ result: 'done', attempts: 3 });
  });

  it('run_script loads the runtime on first call and returns values', async () => {
    const r = await call('run_script', { code: 'return {v: AIA.v.length, s: "Січень"};' });
    expect(r.isError).toBe(false);
    expect(r.json.result).toEqual({ v: 10, s: 'Січень' });
  });

  it('run_script errors carry the line', async () => {
    const r = await call('run_script', { code: 'var a = 1;\nthrow new Error("boom");' });
    expect(r.isError).toBe(true);
    expect(r.json.error).toBe('boom');
  });

  it('configure changes the units the runtime sees', async () => {
    await call('configure', { units: 'mm' });
    expect((await call('run_script', { code: 'return [AIA.S.units, Math.round(AIA.u(25.4))];' })).json.result).toEqual(['mm', 72]);
    await call('configure', { units: 'pt' });
  });

  it('batch runs steps in one call, resolves @n, reports per step', async () => {
    const r = await call('batch', { steps: [
      { tool: 'run_script', args: { code: 'return AIA.rect(10, 10, 50, 20, {name: "A"});' } },
      { tool: 'run_script', args: { code: 'return AIA.refs("@0")[0].name;' } },
    ] });
    expect(r.isError).toBe(false);
    expect(r.json.completed).toBe(2);
    expect(r.json.results[0].data).toMatchObject({ type: 'PathItem', name: 'A', box: [10, 10, 50, 20] });
    expect(r.json.results[1].data).toBe('A');
  });

  it('batch stops on error and rolls back created items', async () => {
    const r = await call('batch', { rollback: true, steps: [
      { tool: 'run_script', args: { code: 'AIA.rect(0, 0, 5, 5); AIA.rect(0, 0, 6, 6); return 1;' } },
      { tool: 'run_script', args: { code: 'return 1;\n' } },
      { tool: 'run_script', args: { code: 'var x = 1;\nnull.f();' } },
      { tool: 'run_script', args: { code: 'return "never";' } },
    ] });
    expect(r.isError).toBe(true);
    expect(r.json).toMatchObject({ total: 4, completed: 3, failed_step: 2, rolled_back: 2 });
    expect(r.json.results[2].ok).toBe(false);
  });

  it('batch with stop_on_error:false runs every step; results:"errors" shows only failures', async () => {
    const r = await call('batch', { stop_on_error: false, results: 'errors', steps: [
      { tool: 'run_script', args: { code: 'null.f();' } },
      { tool: 'run_script', args: { code: 'return 2;' } },
    ] });
    expect(r.json.completed).toBe(2);
    expect(r.json.results).toHaveLength(1);
    expect(r.json.results[0].step).toBe(0);
  });

  it('batch validates steps before touching Illustrator', async () => {
    expect((await call('batch', { steps: [{ tool: 'preview', args: {} }] })).texts[0]).toMatch(/cannot be a batch step/);
    expect((await call('batch', { steps: [{ tool: 'nope' }] })).texts[0]).toMatch(/unknown tool/);
    expect((await call('batch', { steps: [{ tool: 'documents', args: { action: 'fly' } }] })).texts[0]).toMatch(/step 0 \(documents\): action/);
    expect((await call('batch', { steps: [{ tool: 'run_script', args: {} }] })).texts[0]).toMatch(/give code or file/);
  });

  it('documents: export/close only with save, never as a batch step', async () => {
    expect((await call('documents', { action: 'list', close: true })).texts[0]).toMatch(/export and close go with action "save"/);
    expect((await call('batch', { steps: [{ tool: 'documents', args: { action: 'save', close: true } }] })).texts[0]).toMatch(/not as a batch step/);
  });

  it('batch reads steps from a file', async () => {
    const { writeFileSync, mkdtempSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const f = join(mkdtempSync(join(tmpdir(), 'aia-steps-')), 'steps.json');
    writeFileSync(f, JSON.stringify({ steps: [{ tool: 'run_script', args: { code: 'return 7;' } }] }));
    expect((await call('batch', { steps_file: f })).json.results[0].data).toBe(7);
    expect((await call('batch', {})).texts[0]).toMatch(/give steps or steps_file/);
  });

  it('batch of 100 steps is one round trip', async () => {
    const before = T.spawns;
    const steps = Array.from({ length: 100 }, (_, i) => ({ tool: 'run_script', args: { code: `return ${i};` } }));
    const r = await call('batch', { steps, results: 'errors' });
    expect(r.json).toMatchObject({ total: 100, completed: 100 });
    expect(T.spawns).toBe(before);
  });

  it('status restart refuses while a document is unsaved and names it (never loses work)', async () => {
    await call('documents', { action: 'new', width: 100, height: 100, title: 'restart-guard' });
    const r = await call('status', { restart: true });
    expect(r.isError).toBe(true);
    expect(r.json.error).toMatch(/Not restarting/);
    expect(r.json.documents.length).toBeGreaterThan(0); // the shim's new document: never saved, no path
    expect(r.json.documents[0]).toMatchObject({ path: null });
  });
});
