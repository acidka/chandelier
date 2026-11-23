// Phase 7 W6: the real bridge-win.ps1 in fake-COM mode (CHANDELIER_FAKE_COM=1) behind the real Transport.
// Runs where Windows PowerShell 5.1 exists (the windows-latest CI job); skipped elsewhere.
import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { Transport } from '../../src/transport/transport.js';
import { bridgeCommand } from '../../src/platform.js';

const hasPs = process.platform === 'win32' && spawnSync('powershell.exe', ['-NoProfile', '-Command', 'exit 0']).status === 0;
const hr = (hex: string) => parseInt(hex, 16) | 0;
const slow = Number(process.env.CHANDELIER_TEST_SLOW) || 1; // see vitest.config.ts
const LIMIT = 90_000 * slow;
const make = (o: object = {}) => new Transport({ ...bridgeCommand('win'), readyTimeoutMs: 60_000 * slow, ...o });
let T: Transport;
afterEach(() => T?.stop());
beforeAll(() => { process.env.CHANDELIER_FAKE_COM = '1'; });
afterAll(() => { delete process.env.CHANDELIER_FAKE_COM; delete process.env.CHANDELIER_FAKE_RUNNING; });

describe.skipIf(!hasPs)('bridge-win.ps1 (fake COM)', () => {
  it('handshakes, answers in order and reports running', async () => {
    T = make();
    const r = await Promise.all([T.js('sleep:30'), T.js('echo:b'), T.call('running'), T.call('activate'), T.call('launch')]);
    expect(r.map((m) => m.result)).toEqual(['slept', 'b', 'yes', 'ok', 'ok']);
    expect(T.spawns).toBe(1);
  }, LIMIT);

  it('carries escaped Unicode and control characters both ways', async () => {
    T = make();
    expect((await T.js('echo:Січень "q" \\ \u0001x')).result).toBe('\\u0421\\u0456\\u0447\\u0435\\u043d\\u044c "q" \\ \u0001x');
  }, LIMIT);

  it('carries a runtime-sized script in one call', async () => {
    T = make();
    const big = 'x'.repeat(200_000);
    expect((await T.js(big)).result).toBe('len:200000');
  }, LIMIT);

  it('maps HRESULTs to the shared messages', async () => {
    T = make();
    const m = await T.js('hr:800401E3');
    expect(m.ok).toBe(false);
    expect(m.errno).toBe(hr('800401E3'));
    expect(m.error).toMatch(/not running.*0x800401E3/);
    expect((await T.js('hr:8001010A')).error).toMatch(/modal dialog/);
  }, LIMIT);

  it('answers "not running" without attaching', async () => {
    process.env.CHANDELIER_FAKE_RUNNING = 'no';
    try {
      T = make();
      expect((await T.call('running')).result).toBe('no');
      const m = await T.js('echo:x');
      expect(m.ok).toBe(false);
      expect(m.error).toMatch(/^Illustrator is not running/);
    } finally { delete process.env.CHANDELIER_FAKE_RUNNING; }
  }, LIMIT);

  it('recovers after a crash and after a stuck call', async () => {
    T = make({ graceMs: 500 });
    const c = await T.js('crash');
    expect(c.ok).toBe(false);
    expect(c.error).toMatch(/stopped \(exit code 3\)/);
    const s = await T.call('js', { code: 'sleep:20000', timeout: 0.5 });
    expect(s.errno).toBe(-1712);
    expect((await T.js('echo:ok')).result).toBe('ok');
    expect(T.spawns).toBe(3);
  }, 2 * LIMIT);
});
