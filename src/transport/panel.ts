// Panel transport (phase 8, panel MVP; opt-in: CHANDELIER_TRANSPORT=panel). Scripts go to Illustrator through the
// Chandelier CEP panel (src/cep/) over a local socket when the panel is open, and through the usual OS bridge when it
// isn't. The panel also pushes what the designer does (selection, active document, saves, edits) as events, kept here
// in an EventLog for the `events` tool.
//
// Discovery: the panel writes {port, token} to ~/.chandelier/panel.json. While disconnected we retry every few
// seconds, so events start flowing as soon as the panel opens, without waiting for a tool call.
// Non-script ops (running, launch, quit, activate) always use the OS bridge: they work when Illustrator is closed.
import { connect, type Socket } from 'node:net';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Transport, type BridgeReply, type TransportOptions } from './transport.js';
import { ascii } from './ascii.js';

export const panelFile = (home = homedir()) => join(home, '.chandelier', 'panel.json');

export interface PanelEvent { seq: number; t: number; type: string; [k: string]: unknown }

/** Ring buffer of events with sequence numbers and long-poll waiting. */
export class EventLog {
  private items: PanelEvent[] = [];
  private seq = 0;
  private waiters = new Set<() => void>();
  constructor(private readonly max = 200) {}

  get last(): number { return this.seq; }

  push(e: { type: string; t?: number; [k: string]: unknown }): PanelEvent {
    const ev = { ...e, seq: ++this.seq, t: e.t ?? Date.now() } as PanelEvent;
    this.items.push(ev);
    if (this.items.length > this.max) this.items.shift();
    for (const w of [...this.waiters]) w();
    return ev;
  }

  since(seq: number, types?: string[]): PanelEvent[] {
    return this.items.filter((e) => e.seq > seq && (!types?.length || types.includes(e.type)));
  }

  /** Events after seq; when there are none yet, wait up to ms for one. */
  async wait(seq: number, ms: number, types?: string[]): Promise<PanelEvent[]> {
    const now = this.since(seq, types);
    if (now.length || ms <= 0) return now;
    return new Promise((resolve) => {
      const done = () => { clearTimeout(t); this.waiters.delete(check); resolve(this.since(seq, types)); };
      const check = () => { if (this.since(seq, types).length) done(); };
      const t = setTimeout(done, ms);
      this.waiters.add(check);
    });
  }
}

export interface PanelOptions extends TransportOptions {
  /** discovery file (default ~/.chandelier/panel.json) */
  file?: string;
  /** ms between reconnect attempts while the panel is closed; 0 = only on demand (tests) */
  retryMs?: number;
}

export class PanelTransport extends Transport {
  readonly events = new EventLog();
  /** latest snapshot the panel sent: active document, selection */
  state: unknown = null;
  panelVersion = '';
  private sock: Socket | null = null;
  private pending = new Map<number, (m: BridgeReply) => void>();
  private nextId = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private connecting: Promise<boolean> | null = null;
  private retry: NodeJS.Timeout | null = null;
  private stopped = false;
  private readonly file: string;

  constructor(opt: PanelOptions = {}) {
    super(opt);
    this.file = opt.file ?? panelFile();
    const every = opt.retryMs ?? 3000;
    if (every > 0) {
      this.retry = setInterval(() => { if (!this.sock) void this.ensure(); }, every);
      this.retry.unref();
      void this.ensure();
    }
  }

  get connected(): boolean { return this.sock !== null; }

  /** Connect to the panel if it is open. Never throws. */
  ensure(): Promise<boolean> {
    if (this.sock) return Promise.resolve(true);
    if (this.stopped) return Promise.resolve(false);
    this.connecting ??= this.open().finally(() => { this.connecting = null; });
    return this.connecting;
  }

  private open(): Promise<boolean> {
    let info: { port: number; token: string };
    try { info = JSON.parse(readFileSync(this.file, 'utf8')); } catch { return Promise.resolve(false); }
    if (!info?.port || !info.token) return Promise.resolve(false);
    return new Promise((resolve) => {
      const s = connect({ host: '127.0.0.1', port: info.port });
      let buf = '', ready = false;
      const t = setTimeout(() => { s.destroy(); resolve(false); }, 1500);
      s.setEncoding('utf8');
      s.setNoDelay(true);
      s.on('error', () => {});
      s.on('close', () => {
        clearTimeout(t);
        if (!ready) { resolve(false); return; }
        if (this.sock === s) {
          this.sock = null;
          for (const r of this.pending.values()) r({ ok: false, error: 'The Chandelier panel closed during the call (Illustrator quit, or the panel was closed). The call may or may not have finished.' });
          this.pending.clear();
          this.events.push({ type: 'panel', connected: false });
        }
      });
      s.on('data', (d: string) => {
        buf += d; let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1);
          let m: any; try { m = JSON.parse(line); } catch { continue; }
          if (!ready) {
            clearTimeout(t);
            if (m.id !== 0 || !m.ok) { s.destroy(); resolve(false); return; }
            ready = true;
            this.sock = s;
            this.panelVersion = m.panel?.version ?? '';
            if (m.state) this.state = m.state;
            this.events.push({ type: 'panel', connected: true });
            resolve(true);
            continue;
          }
          if (m.state && m.id === undefined && !m.event) { this.state = m.state; continue; }
          if (m.event) {
            const { type, ...rest } = m.event;
            if (type === 'paused') this.state = null;
            this.events.push({ type, ...rest });
            continue;
          }
          const r = this.pending.get(m.id); if (r) { this.pending.delete(m.id); r(m); }
        }
      });
      s.on('connect', () => s.write(JSON.stringify({ op: 'hello', token: info.token, client: 'chandelier-mcp' }) + '\n'));
    });
  }

  /** Scripts through the panel when it is open, else through the OS bridge. */
  override async js(code: string, timeout = 300): Promise<BridgeReply> {
    if (!(await this.ensure())) return super.js(code, timeout);
    const run = () => new Promise<BridgeReply>((resolve) => {
      const s = this.sock;
      if (!s) { resolve({ ok: false, error: 'The Chandelier panel disconnected.' }); return; }
      const id = ++this.nextId;
      // the panel can't cancel a running script: past the deadline the call is reported as timed out (-1712), and
      // the runtime then pings to tell the agent whether Illustrator answers again
      const t = setTimeout(() => {
        if (!this.pending.delete(id)) return;
        resolve({ ok: false, errno: -1712, error: `no answer from the Chandelier panel after ${timeout} s` });
      }, timeout * 1000 + 1000);
      this.pending.set(id, (m) => { clearTimeout(t); resolve(m); });
      s.write(JSON.stringify({ id, op: 'js', code: ascii(code), timeout }) + '\n');
    });
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  /** Show the agent's words in the panel (the chat). false when the panel isn't open. */
  say(text: string): Promise<boolean> {
    return this.panelOp({ op: 'say', text }); // plain UTF-8: shown, not run as a script (no ascii escaping)
  }

  /** Tell the panel what the agent is doing, for its "thinking" line: it read a message, or it waits for the next. */
  activity(state: 'thinking' | 'listening'): Promise<boolean> {
    return this.panelOp({ op: 'activity', state });
  }

  /** A small request the panel answers at once (not queued behind scripts). */
  private async panelOp(req: Record<string, unknown>): Promise<boolean> {
    if (!(await this.ensure()) || !this.sock) return false;
    const s = this.sock;
    const id = ++this.nextId;
    return new Promise<boolean>((resolve) => {
      const t = setTimeout(() => { this.pending.delete(id); resolve(false); }, 3000);
      this.pending.set(id, (m) => { clearTimeout(t); resolve(!!m.ok); });
      s.write(JSON.stringify({ id, ...req }) + '\n');
    });
  }

  override stop(): void {
    this.stopped = true;
    if (this.retry) clearInterval(this.retry);
    this.sock?.end();
    this.sock = null;
    super.stop();
  }
}
