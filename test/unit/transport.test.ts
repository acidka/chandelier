import { describe, it, expect, afterEach } from 'vitest';
import { Transport } from '../../src/transport/transport.js';

const FAKE = new URL('./fake-bridge.mjs', import.meta.url).pathname;
const make = (o: object = {}) => new Transport({ command: process.execPath, args: [FAKE], ...o });
let T: Transport;
afterEach(() => T?.stop());

describe('Transport', () => {
  it('handshakes and answers in order', async () => {
    T = make();
    const r = await Promise.all([T.js('sleep:30'), T.js('echo:b'), T.js('echo:c')]);
    expect(r.map((m) => m.result)).toEqual(['slept', 'b', 'c']);
    expect(T.spawns).toBe(1);
  });

  it('escapes non-ASCII before sending', async () => {
    T = make();
    expect((await T.js('echo:Січень')).result).toBe('\\u0421\\u0456\\u0447\\u0435\\u043d\\u044c');
  });

  it('maps error numbers to clear messages', async () => {
    T = make();
    const m = await T.js('err:-1743');
    expect(m.ok).toBe(false);
    expect(m.error).toMatch(/Privacy & Security/);
    expect(m.error).toMatch(/-1743/);
    expect((await T.js('err:-1712')).error).toMatch(/may still be working/);
  });

  it('fails pending calls when the bridge dies, then respawns', async () => {
    T = make();
    const first = await T.js('echo:x');
    const crashed = await T.js('crash');
    expect(crashed.ok).toBe(false);
    expect(crashed.error).toMatch(/stopped \(exit code 3\): boom/);
    const after = await T.js('');
    expect(after.ok).toBe(true);
    expect(T.spawns).toBe(2);
    expect(first.ok).toBe(true);
  });

  it('kills a stuck bridge after timeout + grace and recovers', async () => {
    T = make({ graceMs: 50 });
    const m = await T.call('js', { code: 'sleep:5000', timeout: 0.1 });
    expect(m.ok).toBe(false);
    expect(m.errno).toBe(-1712);
    expect(m.error).toMatch(/may still be working/);
    expect((await T.js('echo:ok')).result).toBe('ok');
    expect(T.spawns).toBe(2);
  });

  it('reports a bridge that never becomes ready', async () => {
    T = new Transport({ command: process.execPath, args: [FAKE], readyTimeoutMs: 200 });
    process.env.FAKE_NO_READY = '1';
    try {
      const m = await T.js('echo:x');
      expect(m.ok).toBe(false);
      expect(m.error).toMatch(/did not start within 200 ms/);
    } finally { delete process.env.FAKE_NO_READY; }
  });

  it('reports a missing bridge command', async () => {
    T = new Transport({ command: '/nonexistent/osascript', args: [] });
    const m = await T.js('x');
    expect(m.ok).toBe(false);
    expect(m.error).toMatch(/ENOENT|stopped|start/);
  });
});
