// 0.1 robustness: a call that times out gets a hint from a follow-up ping, and status.last_call says whether the
// last call that could change something finished and what it created.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../src/server.js';
import { Transport } from '../../src/transport/transport.js';

const FAKE = new URL('./fake-illustrator.mjs', import.meta.url).pathname;
let client: Client, T: Transport;
const call = async (name: string, args: object = {}) => {
  const r: any = await client.callTool({ name, arguments: args });
  return { isError: !!r.isError, text: r.content.map((c: any) => c.text).join(' ') };
};

beforeAll(async () => {
  T = new Transport({ command: process.execPath, args: [FAKE], graceMs: 300 });
  const { server } = createServer({ transport: T });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: 'test', version: '0' });
  await client.connect(b);
});
afterAll(async () => { await client.close(); T.stop(); });

describe('hangs and the last call', () => {
  it('status.last_call records the last call that could change something', async () => {
    await call('run_script', { code: 'return 1;' });
    await call('find_items', {}); // read-only: does not replace last_call
    const s = JSON.parse((await call('status')).text);
    expect(s.last_call).toMatchObject({ cmd: 'script', finished: true, ok: true, created: [] });
    expect(typeof s.last_call.call).toBe('number');
  });

  it('a timed-out call says whether Illustrator answers again and what to check', async () => {
    const r = await call('run_script', { code: 'var t = new Date().getTime(); while (new Date().getTime() - t < 5000) {} return 1;', timeout: 1 });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/call #\d+ \(script\)/);
    expect(r.text).toMatch(/answers again|not answering/);
    expect(r.text).toMatch(/last_call/);
  }, 20_000);
});
