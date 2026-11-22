import { z } from 'zod';
import type { ToolDef } from './types.js';
import { text, fail } from './types.js';
import { RUNTIME_VERSION } from '../runtime.js';
import { VERSION } from '../version.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const status: ToolDef = {
  name: 'status',
  description: 'Illustrator and server state: running, version, open documents (created_here), session settings, MRAP retries, last_call (finished? created uuids: check it after a timeout), latency. launch:true starts Illustrator if needed (waits up to 2 min). Not needed before other tools (they say if Illustrator is off).',
  shape: { launch: z.boolean().optional() },
  async run(a, { T, rt, settings, created }) {
    let run = await T.call('running');
    if (!run.ok) return fail(run.error ?? 'bridge error');
    if (run.result !== 'yes') {
      if (!a.launch) return text({ running: false, hint: 'Start Adobe Illustrator, or call status with launch:true.' });
      const l = await T.call('launch', { timeout: 120 });
      if (!l.ok) return fail('Could not launch Illustrator: ' + l.error);
      const until = Date.now() + 120_000;
      let ready = false;
      while (Date.now() < until) {
        const env = await rt.cmd('ping', {}, 20);
        if (env.ok) { ready = true; break; }
        await sleep(2000);
      }
      if (!ready) return fail('Illustrator was launched but did not answer within 2 minutes (a dialog may be open).');
    }
    const t = performance.now();
    const env = await rt.cmd('status');
    if (!env.ok) return fail(env.error ?? 'status failed');
    const v = env.data as { documents: { name: string }[] } & Record<string, unknown>;
    const latency = Math.round((performance.now() - t) * 10) / 10;
    for (const d of v.documents as any[]) if (created.has(d.name)) d.created_here = true;
    const { timeout, ...rest } = settings;
    return text({ running: true, ...v, settings: { ...rest, timeout }, latency_ms: latency, runtime: RUNTIME_VERSION, runtime_loads: rt.loads, bridge_spawns: T.spawns, server: VERSION });
  },
};
