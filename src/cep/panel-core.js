// Chandelier panel core (phase 8, panel MVP): runs inside Illustrator's CEP panel (Node context, see index.html) and in
// unit tests with a fake evalScript.
//
// - A TCP server on 127.0.0.1 (random port). The port and a random token go to ~/.chandelier/panel.json (mode 0600);
//   a client must send {"op":"hello","token":…} first, else it is dropped. Same NDJSON protocol as the OS bridges:
//   → {"id":1,"op":"js","code":"…","timeout":30}   ← {"id":1,"ok":true,"result":"…"}
//   Handshake reply: {"id":0,"ok":true,"result":"ready","panel":{version,protocol},"state":<snapshot>}.
//   {"state":<snapshot>} is pushed with the first snapshot after a connect or a resume, and before every batch of events.
// - Requests run one at a time through evalScript (Illustrator's engine is single-threaded anyway).
// - While a client is connected, a snapshot script (host/snapshot.jsx) runs every pollMs; changes become events
//   pushed to every client as {"event":{type, t, …}}: document (active document changed, opened, closed), saved,
//   edited, selection (count, first 10 items with uuids, text cursor). after_agent:true marks a change seen right
//   after an agent request (probably the agent's own doing). The designer can pause sharing from the panel.
'use strict';
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PROTOCOL = 1;

function discoveryFile(home) { return path.join(home || os.homedir(), '.chandelier', 'panel.json'); }

const selSig = (s) => [s.doc, s.count, (s.items || []).map((i) => i.uuid).join(','), s.text ? s.text.text : ''].join('|');

/** Events between two snapshots (prev null = first snapshot: no events, it is the starting state). */
function diff(prev, cur) {
  if (!cur || cur.error || !prev || prev.error) return [];
  const ev = [];
  if (prev.doc !== cur.doc || prev.docs !== cur.docs) {
    ev.push({ type: 'document', doc: cur.doc, docs: cur.docs, previous: prev.doc, saved: cur.saved });
  } else if (prev.saved !== cur.saved) {
    ev.push({ type: cur.saved ? 'saved' : 'edited', doc: cur.doc });
  }
  // a document switch reports the new document's selection only when something is selected there
  if (cur.doc && (prev.doc === cur.doc ? selSig(prev) !== selSig(cur) : cur.count > 0)) {
    const e = { type: 'selection', doc: cur.doc, count: cur.count, items: cur.items };
    if (cur.text) e.text = cur.text;
    ev.push(e);
  }
  return ev;
}

/**
 * opts: evalScript(code, cb(result: string)) · snapshot (ExtendScript source) · home (for the discovery file) ·
 * pollMs (default 500) · version · onChange(info) for the panel UI.
 */
function createPanel(opts) {
  const pollMs = opts.pollMs || 500;
  const token = crypto.randomBytes(24).toString('hex');
  const file = discoveryFile(opts.home);
  const clients = new Set();
  const queue = [];
  let server = null, port = 0, timer = null;
  let busy = false, polling = false, afterAgent = false, sharing = true;
  let last = null;
  const recent = [];

  const info = () => ({ port, clients: clients.size, sharing, state: last, recent: recent.slice(-10) });
  const changed = () => { if (opts.onChange) try { opts.onChange(info()); } catch (e) { /* UI errors never stop the server */ } };
  const send = (sock, obj) => { try { sock.write(JSON.stringify(obj) + '\n'); } catch (e) { /* closed */ } };
  const broadcast = (obj) => { for (const c of clients) send(c, obj); };

  function evalScript(code) {
    return new Promise((resolve) => opts.evalScript(code, (r) => resolve(r === undefined || r === null ? '' : String(r))));
  }

  async function pump() {
    if (busy) return;
    const job = queue.shift();
    if (!job) return;
    busy = true;
    const r = await evalScript(job.code);
    busy = false;
    afterAgent = true;
    // CEP answers a script that threw with this literal string (no message, no line)
    if (r === 'EvalScript error.') send(job.sock, { id: job.id, ok: false, error: 'The script failed in Illustrator (no message from the panel engine).' });
    else send(job.sock, { id: job.id, ok: true, result: r });
    pump();
  }

  async function poll() {
    if (polling || busy || !clients.size || !sharing || !opts.snapshot) return;
    polling = true;
    try {
      let cur;
      try { cur = JSON.parse(await evalScript(opts.snapshot)); } catch (e) { cur = { error: 'snapshot: ' + e.message }; }
      const events = diff(last, cur);
      // the first good snapshot (after a connect or a resume) is the baseline: send it as the current state
      const baseline = !last && !cur.error;
      if (!cur.error) last = cur;
      // the whole snapshot goes out first whenever something changed, so clients never patch state together
      if (baseline || events.length) broadcast({ state: cur });
      for (const e of events) {
        e.t = Date.now();
        if (afterAgent) e.after_agent = true;
        recent.push(e); if (recent.length > 50) recent.shift();
        broadcast({ event: e });
      }
      afterAgent = false;
      if (events.length) changed();
    } finally { polling = false; }
  }

  function onSocket(sock) {
    let buf = '', authed = false;
    sock.setEncoding('utf8');
    sock.setNoDelay(true);
    // nobody listening: forget the state, so the next agent starts from a fresh baseline instead of a stale diff
    const drop = () => { if (clients.delete(sock)) { if (!clients.size) last = null; changed(); } };
    sock.on('close', drop);
    sock.on('error', drop);
    sock.on('data', (d) => {
      buf += d;
      if (!authed && buf.length > 4096) { sock.destroy(); return; }
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        let m;
        try { m = JSON.parse(line); } catch (e) { if (!authed) { sock.destroy(); return; } continue; }
        if (!authed) {
          const ok = m && m.op === 'hello' && typeof m.token === 'string' && m.token.length === token.length &&
            crypto.timingSafeEqual(Buffer.from(m.token), Buffer.from(token));
          if (!ok) { send(sock, { id: 0, ok: false, error: 'bad token' }); sock.destroy(); return; }
          authed = true;
          clients.add(sock);
          send(sock, { id: 0, ok: true, result: 'ready', panel: { version: opts.version || '', protocol: PROTOCOL }, state: sharing ? last : null });
          changed();
          poll();
          continue;
        }
        if (m.op === 'js') { queue.push({ sock, id: m.id, code: String(m.code || '') }); pump(); }
        else if (m.op === 'ping') send(sock, { id: m.id, ok: true, result: 'pong' });
        else send(sock, { id: m.id, ok: false, error: 'The panel does not handle "' + m.op + '"' });
      }
    });
  }

  function writeDiscovery() {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, JSON.stringify({ port, token, pid: process.pid, version: opts.version || '', protocol: PROTOCOL }), { mode: 0o600 });
  }

  return {
    token, file,
    start() {
      return new Promise((resolve, reject) => {
        server = net.createServer(onSocket);
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
          port = server.address().port;
          writeDiscovery();
          timer = setInterval(poll, pollMs);
          if (timer.unref) timer.unref();
          changed();
          resolve({ port });
        });
      });
    },
    stop() {
      if (timer) clearInterval(timer);
      for (const c of clients) c.destroy();
      clients.clear();
      if (server) server.close();
      // remove the discovery file only if it is still ours (another panel may have replaced it)
      try { if (JSON.parse(fs.readFileSync(file, 'utf8')).token === token) fs.unlinkSync(file); } catch (e) { /* gone */ }
    },
    /** Something happened in Illustrator (a CSXS event): look now instead of at the next tick. */
    poke() { setTimeout(poll, 30); },
    setSharing(on) {
      sharing = !!on;
      if (!sharing) last = null; // resume starts from a fresh state, no stale diff
      broadcast({ event: { type: sharing ? 'resumed' : 'paused', t: Date.now() } });
      changed();
    },
    info,
  };
}

module.exports = { createPanel, diff, discoveryFile, PROTOCOL };
