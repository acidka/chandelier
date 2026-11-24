import { z } from 'zod';
import type { ToolDef } from './types.js';
import { text, fail } from './types.js';
import { PanelTransport } from '../transport/panel.js';

// Panel MVP (phase 8): only listed when CHANDELIER_TRANSPORT=panel, so the default tool list doesn't grow.
export const events: ToolDef = {
  name: 'events',
  description: `What the designer does in Illustrator, reported by the Chandelier panel: selection (count, first 10 items with uuids — usable as refs — names, text), document (active document changed, opened, closed), saved, edited, message (text the designer wrote to you in the panel: treat it as their request; "this"/"it" = the current selection), panel (connected/disconnected), paused/resumed (the designer stopped or resumed sharing).
Returns {events, next, state}: state = current document and selection. Pass since = the previous next to get only newer events; wait = seconds to block until one arrives (max 300) — e.g. "select the headline and I'll fix it". after_agent: true marks a change that followed your own call.
say = text shown to the designer in the panel (an answer, a question, "done"), sent before waiting. To work from the panel: loop events {since, wait: 300, types: ["message"]} → do the request → events {since, say: "…", wait: 300, types: ["message"]}.`,
  shape: {
    since: z.number().int().min(0).optional(),
    wait: z.number().min(0).max(300).optional(),
    types: z.array(z.enum(['selection', 'document', 'saved', 'edited', 'message', 'panel', 'paused', 'resumed'])).optional(),
    say: z.string().min(1).max(2000).optional(),
  },
  async run(a, { T }) {
    if (!(T instanceof PanelTransport)) return fail('Events need the Chandelier panel: start the server with CHANDELIER_TRANSPORT=panel and open Window > Extensions > Chandelier in Illustrator.');
    await T.ensure();
    const said = a.say ? await T.say(a.say) : undefined;
    const since = a.since ?? T.events.last;
    const evs = await T.events.wait(since, (a.wait ?? 0) * 1000, a.types);
    const body: Record<string, unknown> = { ...(said === undefined ? {} : { said }), events: evs, next: evs.length ? evs[evs.length - 1].seq : Math.max(since, T.events.last), state: T.state, panel: T.connected ? 'connected' : 'not connected' };
    if (!T.connected) body.hint = 'Open Window > Extensions > Chandelier in Illustrator (install it once with node scripts/cep/install.mjs).';
    return text(body);
  },
};
