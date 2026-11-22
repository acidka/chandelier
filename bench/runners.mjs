// Three ways to drive Illustrator, behind one interface: run(kind, payload) → {ok, ms, result|error}
//
//   A  extendscript — what the owner's run.sh does: write a .jsx file, spawn `osascript` with
//                     `do javascript (POSIX file …) with arguments {…}` (600 s timeout), per call.
//   B  ie3-mcp      — ie3jp/illustrator-mcp-server over MCP stdio (JSON-RPC tools/call).
//   C  ours         — chandelier persistent bridge (src/bridge/bridge-mac.js).
//
//   M  chandelier MCP — the full Chandelier server (dist/index.js) over MCP stdio, the way an agent calls it.
//
// Each runner is started once (B, C and M keep a process alive, as they would in a real session).

import { spawn, execFile } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const now = () => performance.now();

// ── A: ExtendScript file per call ────────────────────────────────────────────
export class ExtendScriptRunner {
  name = 'A extendscript (osascript per call)';
  async start() { this.dir = mkdtempSync(join(tmpdir(), 'aia-bench-')); this.n = 0; }
  async stop() { rmSync(this.dir, { recursive: true, force: true }); }
  // code: ExtendScript source; arg: string passed as arguments[0]
  run(code, arg = '') {
    const file = join(this.dir, `s${++this.n}.jsx`);
    const t = now();
    writeFileSync(file, code);
    const as = `with timeout of 600 seconds\ntell application id "com.adobe.illustrator" to do javascript (POSIX file ${JSON.stringify(file)}) with arguments {${JSON.stringify(arg)}}\nend timeout`;
    return new Promise((resolve) => {
      execFile('osascript', ['-e', as], { timeout: 600_000 }, (err, stdout, stderr) => {
        const ms = now() - t;
        if (err) resolve({ ok: false, ms, error: (stderr || err.message).trim() });
        else resolve({ ok: true, ms, result: stdout.trim() });
      });
    });
  }
}

// ── B: ie3jp/illustrator-mcp-server ──────────────────────────────────────────
export class Ie3McpRunner {
  constructor(entry, node = process.execPath) { this.entry = entry; this.node = node; this.name = 'B ie3 illustrator-mcp-server'; }
  async start() {
    this.p = spawn(this.node, [this.entry], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.q = new Map(); this.id = 0; let buf = '';
    this.p.stdout.on('data', (d) => {
      buf += d; let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        try { const m = JSON.parse(line); const r = this.q.get(m.id); if (r) { this.q.delete(m.id); r(m); } } catch { /* log lines */ }
      }
    });
    this.p.stderr.on('data', () => {});
    const init = await this.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'aia-bench', version: '0' } });
    this.version = init.result?.serverInfo?.version;
    this.p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  }
  rpc(method, params) {
    return new Promise((resolve) => { const id = ++this.id; this.q.set(id, resolve); this.p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  }
  async stop() { this.p.kill(); }
  async run(tool, args) {
    const t = now();
    const m = await this.rpc('tools/call', { name: tool, arguments: args });
    const ms = now() - t;
    const text = m.result?.content?.find((c) => c.type === 'text')?.text ?? '';
    if (m.error || m.result?.isError) return { ok: false, ms, error: m.error?.message || text.slice(0, 300) };
    return { ok: true, ms, result: text, bytes: text.length };
  }
}

// ── M: the full Chandelier MCP server (same MCP stdio client as B) ──────────────
export class ChandelierMcpRunner extends Ie3McpRunner {
  constructor(entry, node = process.execPath) { super(entry, node); this.name = 'M chandelier MCP (full server)'; }
}

// ── C: our persistent bridge ─────────────────────────────────────────────────
export class OurBridgeRunner {
  constructor(bridgePath) { this.bridgePath = bridgePath; this.name = 'C chandelier bridge'; }
  async start() {
    this.p = spawn('osascript', ['-l', 'JavaScript', this.bridgePath], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.q = new Map(); this.id = 0; let buf = '';
    const ready = new Promise((r) => this.q.set(0, r));
    this.p.stdout.on('data', (d) => {
      buf += d; let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        const m = JSON.parse(line); const r = this.q.get(m.id); if (r) { this.q.delete(m.id); r(m); }
      }
    });
    this.p.on('exit', () => { for (const r of this.q.values()) r({ ok: false, error: 'bridge exited' }); this.q.clear(); });
    await ready;
  }
  async stop() { this.p.stdin.end(); }
  // Payload must be ASCII; escape everything else (the real transport does the same).
  static ascii(s) { return s.replace(/[^\x20-\x7e]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')); }
  run(code, timeout = 600) {
    const t = now();
    return new Promise((resolve) => {
      const id = ++this.id;
      this.q.set(id, (m) => resolve(m.ok ? { ok: true, ms: now() - t, result: m.result } : { ok: false, ms: now() - t, error: m.error }));
      this.p.stdin.write(JSON.stringify({ id, op: 'js', code: OurBridgeRunner.ascii(code), timeout }) + '\n');
    });
  }
}
