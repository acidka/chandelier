// The ExtendScript runtime (src/runtime/*.jsx) lives in Illustrator's persistent engine as $.global.AIA.
// Every call is one Apple event (one COM DoJavaScript call on Windows): a version check plus AIA.dispatch({cmd, args, settings}). When Illustrator
// restarted (no AIA) or the runtime file changed (other hash), the runtime is sent again and the call retried.
//
// The runtime is sent inline (one ~30 KB Apple event per Illustrator session) rather than with $.evalFile:
// no dependency on Illustrator being allowed to read the package's folder, and no file to keep in sync.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { RUNTIME_DIR } from './paths.js';
import { scriptPaths } from './platform.js';
import { isTimeout } from './transport/errors.js';
import type { Transport } from './transport/transport.js';
import { defaultSettings, type Settings } from './settings.js';

/** core.jsx first (it creates $.global.AIA), then the modules in name order; sent as ONE source. */
export function runtimeSource(dir = RUNTIME_DIR): string {
  const files = readdirSync(dir).filter((f) => f.endsWith('.jsx') && f !== 'core.jsx').sort();
  return ['core.jsx', ...files].map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
}
const RUNTIME_SRC = runtimeSource();
export const RUNTIME_VERSION = createHash('sha1').update(RUNTIME_SRC).digest('hex').slice(0, 10);
const RUNTIME = RUNTIME_SRC.replace('__AIA_VERSION__', RUNTIME_VERSION);

export interface Envelope<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
  line?: number;
  where?: string;
  /** active document after the call */
  doc?: string | null;
  /** its identity (file path once saved, else "name:…"): the server remembers it as the working document */
  docKey?: string | null;
  warnings?: string[];
  /** true when the failure happened before reaching the runtime (bridge / Apple event level) */
  bridge?: boolean;
}

export interface CmdOptions {
  timeout?: number;
  /** settings overriding the session ones for this call only */
  settings?: Partial<Settings>;
}

export class RuntimeError extends Error {
  constructor(readonly env: Envelope) {
    super(env.line ? `${env.error} (line ${env.line})` : (env.where ? `${env.error} (${env.where})` : env.error ?? 'unknown error'));
  }
}

export class Runtime {
  /** times the runtime was (re)loaded into Illustrator */
  loads = 0;
  /** calls sent so far (each carries its number, so status.last_call can be matched to a timed-out call) */
  calls = 0;
  /** the document this session works in (key of the active document after the last call); sent with every call so
   * the runtime brings it back to the front if the user switched windows in between */
  doc: string | null = null;

  /** After a timeout: is Illustrator answering again? Tells the agent what to check before repeating. */
  private async afterTimeout(call: number, cmd: string): Promise<string> {
    const p = await this.T.js(Runtime.wrap({ cmd: 'ping', args: {} }), 5);
    if (p.ok) return `Illustrator answers again: call #${call} (${cmd}) probably finished. Before repeating it, call status and check last_call (finished, created uuids).`;
    return `Illustrator is not answering: a modal dialog may be open (e.g. one asking to update missing or modified links) or it is still busy with call #${call} (${cmd}). Look at the Illustrator window; do not repeat the call until status answers and last_call shows whether it finished.`;
  }
  constructor(readonly T: Transport, readonly settings: Settings = defaultSettings()) {}

  async load(): Promise<void> {
    const m = await this.T.js(RUNTIME, 60);
    if (!m.ok) throw new RuntimeError({ ok: false, error: 'Could not load the runtime: ' + m.error, bridge: true });
    this.loads++;
  }

  /** The source sent for one command (exported for tests). */
  static wrap(req: object): string {
    return `(function(){if(!$.global.AIA||$.global.AIA.v!==${JSON.stringify(RUNTIME_VERSION)})return "\\u0001RELOAD";` +
      `return AIA.dispatch(${JSON.stringify(req)});})()`;
  }

  /** Run a runtime command. Never throws for Illustrator-side errors: check env.ok. */
  async cmd<T = any>(cmd: string, args: object = {}, opt: number | CmdOptions = {}): Promise<Envelope<T>> {
    const o = typeof opt === 'number' ? { timeout: opt } : opt;
    const { timeout: defTimeout, reply: _reply, ...settings } = { ...this.settings, ...o.settings };
    const timeout = o.timeout;
    const call = ++this.calls;
    const src = Runtime.wrap({ cmd, args: scriptPaths(args), settings, call, ...(this.doc && cmd !== 'ping' ? { doc: this.doc } : {}) });
    for (let attempt = 0; attempt < 2; attempt++) {
      const m = await this.T.js(src, timeout ?? defTimeout);
      if (!m.ok) {
        const env: Envelope<T> = { ok: false, error: m.error ?? 'unknown bridge error', bridge: true };
        if (isTimeout(m.errno) && cmd !== 'ping') env.error += ' ' + await this.afterTimeout(call, cmd);
        return env;
      }
      const r = m.result ?? '';
      if (r === '\u0001RELOAD') {
        try { await this.load(); } catch (e) { return (e as RuntimeError).env; }
        continue;
      }
      if (r.charCodeAt(0) === 1) {
        const env = JSON.parse(r.slice(1)) as Envelope<T>;
        if (env.docKey !== undefined && cmd !== 'ping') this.doc = env.docKey;
        delete env.docKey;
        return env;
      }
      return { ok: false, error: 'Unexpected reply from Illustrator: ' + r.slice(0, 200) };
    }
    return { ok: false, error: 'The runtime did not load.' };
  }

  /** cmd() that throws a RuntimeError on failure and returns data. */
  async call<T = any>(cmd: string, args: object = {}, opt: number | CmdOptions = {}): Promise<T> {
    const env = await this.cmd<T>(cmd, args, opt);
    if (!env.ok) throw new RuntimeError(env);
    return env.data as T;
  }

  /** Run an ExtendScript function body (AIA available, `arguments` = args). */
  script<T = any>(code: string, args: unknown[] = [], timeout?: number): Promise<Envelope<T>> {
    return this.cmd<T>('script', { code, args }, { timeout });
  }

  /** script() that throws on failure and returns the value. */
  async run<T = any>(code: string, args: unknown[] = [], timeout?: number): Promise<T> {
    const env = await this.script<T>(code, args, timeout);
    if (!env.ok) throw new RuntimeError(env);
    return env.data as T;
  }
}
