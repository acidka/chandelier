#!/usr/bin/env node
// Size of the tool list an agent re-reads on every request: node scripts/schema-size.mjs [--json]
// (tools/list of the built server + the server instructions). Tokens ≈ chars / 3.5.
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function measure() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const p = spawn(process.execPath, [join(root, 'dist/index.js')], { stdio: ['pipe', 'pipe', 'ignore'] });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'size', version: '0' } } }) + '\n');
  p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
  await new Promise((r) => { const t = setInterval(() => { if (out.split('\n').filter(Boolean).length >= 2) { clearInterval(t); r(); } }, 20); });
  p.kill();
  const [init, list] = out.trim().split('\n').map((l) => JSON.parse(l));
  const tools = list.result.tools.map((t) => ({ name: t.name, chars: JSON.stringify(t).length }));
  const total = tools.reduce((a, t) => a + t.chars, 0), instructions = init.result.instructions.length;
  return { tools: tools.sort((a, b) => b.chars - a.chars), total, instructions, tokens: Math.round((total + instructions) / 3.5) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const m = await measure();
  if (process.argv.includes('--json')) console.log(JSON.stringify(m));
  else {
    console.log(`${m.tools.length} tools · schemas ${m.total} chars · instructions ${m.instructions} chars · ≈${m.tokens} tokens per request`);
    for (const t of m.tools) console.log(`  ${t.name.padEnd(16)} ${t.chars}`);
  }
}
