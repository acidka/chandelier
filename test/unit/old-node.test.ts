// On a Node that is too old, the server answers MCP with one `status` tool that explains the problem (old-node.ts).
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const OLD = new URL('../../dist/old-node.js', import.meta.url).pathname;
const lines = [
  { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
  { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'documents', arguments: {} } },
].map((m) => JSON.stringify(m)).join('\n') + '\n';

describe.skipIf(!existsSync(OLD))('server on a too-old Node', () => {
  it('explains the Node version through MCP instead of failing later', () => {
    const r = spawnSync(process.execPath, [OLD], { input: lines, encoding: 'utf8' });
    const out = r.stdout.trim().split('\n').map((l) => JSON.parse(l));
    expect(out).toHaveLength(3); // the notification gets no answer
    expect(out[0].result.instructions).toMatch(/needs Node\.js 22\.15 or later/);
    expect(out[1].result.tools.map((t: any) => t.name)).toEqual(['status']);
    expect(out[2].result.isError).toBe(true);
    expect(out[2].result.content[0].text).toMatch(/nvm alias default 22/);
    expect(r.stderr).toMatch(/needs Node\.js/);
  });
});
