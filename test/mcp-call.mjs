#!/usr/bin/env node
// Dev tool: call MCP tools of the built server in one session and print the results.
//   node test/mcp-call.mjs '[["status"], ["find_items", {"type": "text"}]]'  [--full]
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const full = process.argv.includes('--full');
const c = new Client({ name: 'mcp-call', version: '0' });
await c.connect(new StdioClientTransport({ command: process.execPath, args: [join(ROOT, 'dist/index.js')], stderr: 'inherit' }));
for (const [name, args] of JSON.parse(process.argv[2])) {
  const t = performance.now();
  const r = await c.callTool({ name, arguments: args ?? {} });
  const out = r.content.map((x) => (x.type === 'text' ? x.text : `[${x.type} ${x.data.length} b64]`)).join(' ');
  console.log(`${r.isError ? 'ERR' : 'ok '} ${name} ${(performance.now() - t).toFixed(1)}ms`, full ? out : out.slice(0, 600));
}
await c.close();
