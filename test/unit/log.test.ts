// Phase 5: CHANDELIER_LOG_FILE gets one JSON line per tool call (the server reads the setting when it loads).
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

describe('debug log', () => {
  it('writes tool, ms and ok per call', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'aia-log-')), 'calls.log');
    process.env.CHANDELIER_LOG_FILE = file;
    const { createServer } = await import('../../src/server.js');
    const { server } = createServer();
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const client = new Client({ name: 'log', version: '0' });
    await client.connect(b);
    await client.callTool({ name: 'configure', arguments: { units: 'mm' } });
    await client.callTool({ name: 'documents', arguments: { action: 'open', path: join(tmpdir(), 'no-such-file.ai') } }); // fails inside the server
    await client.close();
    delete process.env.CHANDELIER_LOG_FILE;
    const lines = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ tool: 'configure', ok: true });
    expect(typeof lines[0].ms).toBe('number');
    expect(lines[1]).toMatchObject({ tool: 'documents', ok: false });
    expect(lines[1].error).toMatch(/not found/i);
  });
});
