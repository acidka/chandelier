// Transport to Illustrator over the persistent bridge: src/bridge/bridge-mac.js (macOS) or bridge-win.ps1 (Windows),
// picked by src/platform.ts. Both speak the same NDJSON protocol.
//
// - One long-lived child process; NDJSON in both directions; readiness handshake ({id:0,result:"ready"}).
// - Serialised: one request in flight (Illustrator is single-threaded anyway).
// - Every request has a deadline (its own timeout + grace). If the bridge doesn't answer by then it is
//   considered stuck: killed, the call fails with a "may still be running" error, and the next call respawns it.
// - If the bridge process dies, pending calls fail at once with the exit reason; the next call respawns it.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { bridgeCommand, osOf } from '../platform.js';
import { ascii } from './ascii.js';
import { explain } from './errors.js';

export interface BridgeReply { id?: number; ok: boolean; result?: string; error?: string; errno?: number | null }

export interface TransportOptions {
  command?: string;
  args?: string[];
  /** ms to wait for the bridge's ready line */
  readyTimeoutMs?: number;
  /** ms added to a request's own timeout before the bridge is declared stuck. macOS: 10 s (the bridge's Apple event
   *  times out first). Windows: 1 s — a COM call can't be cancelled, so this deadline IS the call's timeout (W6). */
  graceMs?: number;
}

export class Transport {
  private p: ChildProcessWithoutNullStreams | null = null;
  private q = new Map<number, (m: BridgeReply) => void>();
  private id = 0;
  private chain: Promise<unknown> = Promise.resolve();
  private stderrTail = '';
  private readonly opt: Required<TransportOptions>;
  /** Number of bridge processes started (1 = never respawned). */
  spawns = 0;

  constructor(opt: TransportOptions = {}) {
    this.opt = {
      command: opt.command ?? bridgeCommand().command,
      args: opt.args ?? (opt.command ? [] : bridgeCommand().args),
      readyTimeoutMs: opt.readyTimeoutMs ?? (Number(process.env.CHANDELIER_BRIDGE_START_MS) || 15_000), // env: slow machines (emulated VMs)
      graceMs: opt.graceMs ?? (osOf() === 'win' ? 1_000 : 10_000),
    };
  }

  get alive(): boolean { return this.p !== null; }

  private failAll(reason: string): void {
    const pending = [...this.q.values()];
    this.q.clear();
    for (const r of pending) r({ ok: false, error: reason });
  }

  private async start(): Promise<void> {
    this.spawns++;
    this.stderrTail = '';
    const p = spawn(this.opt.command, this.opt.args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.p = p;
    let buf = '';
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (d: string) => {
      buf += d; let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        let m: BridgeReply; try { m = JSON.parse(line); } catch { continue; }
        const r = this.q.get(m.id ?? -1); if (r) { this.q.delete(m.id!); r(m); }
      }
    });
    p.stderr.setEncoding('utf8');
    p.stderr.on('data', (d: string) => { this.stderrTail = (this.stderrTail + d).slice(-500); });
    p.stdin.on('error', () => {}); // EPIPE when the bridge died; handled by 'exit'
    const onGone = (why: string) => {
      if (this.p !== p) return;
      this.p = null;
      const tail = this.stderrTail.trim();
      this.failAll(`The bridge to Illustrator stopped (${why})${tail ? ': ' + tail : ''}. The next call starts a new one.`);
    };
    p.on('error', (e) => onGone(e.message));
    p.on('exit', (code, sig) => onGone(sig ? `signal ${sig}` : `exit code ${code}`));

    const ready = await new Promise<BridgeReply>((resolve) => {
      const t = setTimeout(() => { this.q.delete(0); resolve({ ok: false, error: `bridge did not start within ${this.opt.readyTimeoutMs} ms` }); }, this.opt.readyTimeoutMs);
      this.q.set(0, (m) => { clearTimeout(t); resolve(m); });
    });
    if (!ready.ok) { this.kill(); throw new Error(ready.error); }
  }

  private kill(): void {
    const p = this.p;
    if (!p) return;
    this.p = null;
    p.kill('SIGKILL');
  }

  private raw(op: string, extra: { timeout?: number; [k: string]: unknown }, deadlineMs: number): Promise<BridgeReply> {
    return new Promise((resolve) => {
      const id = ++this.id;
      const t = setTimeout(() => {
        if (!this.q.has(id)) return;
        this.q.delete(id);
        this.kill();
        resolve({ ok: false, errno: -1712, error: `no answer from the bridge after ${Math.round(deadlineMs / 1000)} s` });
      }, deadlineMs);
      this.q.set(id, (m) => { clearTimeout(t); resolve(m); });
      this.p!.stdin.write(JSON.stringify({ id, op, ...extra }) + '\n');
    });
  }

  /** Serialised: one request in flight. Never throws; failures come back as {ok:false, error}. */
  call(op: string, extra: { timeout?: number; [k: string]: unknown } = {}): Promise<BridgeReply> {
    const run = async (): Promise<BridgeReply> => {
      try {
        if (!this.p) await this.start();
      } catch (e) {
        return { ok: false, error: 'Could not start the bridge to Illustrator: ' + (e as Error).message };
      }
      const deadline = ((extra.timeout ?? 30) * 1000) + this.opt.graceMs;
      const m = await this.raw(op, extra, deadline);
      if (!m.ok) m.error = explain(m.errno, m.error);
      return m;
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => {});
    return p;
  }

  js(code: string, timeout = 300): Promise<BridgeReply> { return this.call('js', { code: ascii(code), timeout }); }

  stop(): void { if (this.p) { this.p.stdin.end(); this.p = null; } }
}
