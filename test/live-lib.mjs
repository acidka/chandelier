// Shared helpers for the live suites: one MCP session to the built server, checked calls, a summary.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const txt = (r) => r.content.filter((c) => c.type === 'text').map((c) => c.text).join(' ');
export const assert = (c, m) => { if (!c) throw new Error(m); };

/**
 * Safety guard for the live suites: once a suite has created a document, every tool call first checks (one ~5 ms
 * status call) that the active document is one the suite created or opened, and aborts the run otherwise, so a
 * document the user activates mid-run is never touched. Tracks names from documents new/open/save results.
 */
export function guard(client) {
  const mine = new Set();
  const raw = client.callTool.bind(client);
  client.callToolUnguarded = raw; // for timing loops: the guard's status call would double what they measure
  const first = (r) => { try { return JSON.parse(r.content.find((c) => c.type === 'text')?.text ?? ''); } catch { return null; } };
  client.callTool = async (req, ...rest) => {
    const { name, arguments: args = {} } = req;
    // configure changes only server settings; batch {files} works only on the files it opens (already open ones are skipped)
    const free = name === 'status' || name === 'configure' || (name === 'batch' && args.files) || (name === 'documents' && (['new', 'list', 'open'].includes(args.action) || (args.action === 'activate' && mine.has(args.name))));
    if (mine.size && !free) {
      const st = first(await raw({ name: 'status', arguments: {} }));
      const active = st?.documents?.find((d) => d.active)?.name;
      if (active && !mine.has(active)) {
        console.error(`ABORT: the active document "${active}" was not created by this test; refusing to call ${name}.`);
        process.exit(2);
      }
    }
    const r = await raw(req, ...rest);
    if (name === 'documents' && !r.isError) {
      const v = first(r);
      for (const n of [v?.name, v?.saved?.name]) if (n && (args.action === 'new' || args.action === 'open' || mine.has(v?.renamed_from ?? v?.saved?.renamed_from))) mine.add(n);
    }
    return r;
  };
  return mine;
}

export async function connect(name) {
  const client = new Client({ name, version: '0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(ROOT, 'dist/index.js')], stderr: 'inherit' }));
  guard(client);
  let failures = 0;
  /** call a tool; check(value, raw) may throw or return false. Errors are expected only with expectError.
   *  timeout: ms the client waits (the MCP SDK's default is 60 s; an Illustrator restart can take longer). */
  async function call(tool, args = {}, { expectError = false, check, timeout } = {}) {
    const t = performance.now();
    const r = await client.callTool({ name: tool, arguments: args }, undefined, timeout ? { timeout } : undefined);
    const ms = (performance.now() - t).toFixed(1);
    const img = r.content.find((c) => c.type === 'image');
    let ok = !!r.isError === expectError, note = '';
    if (!ok) note = r.isError ? ' ✗ unexpected error' : ' ✗ expected an error';
    if (ok && check) {
      try { const first = r.content.find((c) => c.type === 'text')?.text ?? ''; let v; try { v = JSON.parse(first); } catch { v = first; } if (check(v, r) === false) { ok = false; note = ' ✗ check'; } }
      catch (e) { ok = false; note = ' ✗ ' + e.message; }
    }
    if (!ok) failures++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${tool.padEnd(14)} ${ms.padStart(7)} ms  ${txt(r).slice(0, 200)}${img ? `  [image ${Math.round(img.data.length * 0.75 / 1024)} KB]` : ''}${note}`);
    return r;
  }
  async function done(extra = '') {
    await client.close();
    console.log(failures ? `${failures} FAILED` : `all ${name} checks passed`, extra);
    return failures;
  }
  return { client, call, done };
}
