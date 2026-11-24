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
// - Chat, one per document (key: the file path, or the name while never saved; kept in ~/.chandelier/chats.json):
//   the designer's text from the panel goes to every client as {"event":{type:"message", text}};
//   a client's {"id","op":"say","text"} is shown in the panel (the agent's answer) → {"id","ok":true}.
// - Activity for the panel's "thinking" line: {"id","op":"activity","state":"thinking"|"listening"} from a client
//   (thinking = it has read the designer's message; listening = it waits for the next one); "working" while its
//   scripts run (and WORKING_HOLD_MS after, so quick calls don't flicker). info().activity: working | thinking |
//   unread (a message no agent has picked up yet) | "".
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

  // the designer's messages and the agent's answers, one conversation per document, apart from events so selections
  // don't push them out; kept in ~/.chandelier/chats.json (0600: {key: {name, t, items}}; 100 messages per document,
  // the 50 most recently used documents) so a panel reload or an Illustrator restart doesn't clear them
  const chatFile = path.join(path.dirname(file), 'chats.json');
  const chats = (() => { try { const c = JSON.parse(fs.readFileSync(chatFile, 'utf8')); return c && typeof c === 'object' && !Array.isArray(c) ? c : {}; } catch (e) { return {}; } })();
  let doc = { key: '', name: null }; // the active document, known even while no agent is connected
  let replyKey = null; // the document of the designer's latest message: the agent's answer goes there
  const chatOf = (key) => (chats[key] ? chats[key].items : []);
  let saveTimer = null;
  const saveChat = () => {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const keys = Object.keys(chats).sort((a, b) => chats[b].t - chats[a].t);
      for (const k of keys.slice(50)) delete chats[k];
      try { fs.mkdirSync(path.dirname(chatFile), { recursive: true, mode: 0o700 }); fs.writeFileSync(chatFile, JSON.stringify(chats), { mode: 0o600 }); } catch (e) { /* the chat still works in memory */ }
    }, 200);
    if (saveTimer.unref) saveTimer.unref();
  };
  const WORKING_HOLD_MS = opts.workingHoldMs ?? 1500;
  const thinking = new Set(); // clients that read a message and haven't answered or gone back to listening
  let unread = false, lastJobEnd = 0, holdTimer = null;
  const activity = () => (busy || Date.now() - lastJobEnd < WORKING_HOLD_MS) && clients.size ? 'working'
    : (thinking.size ? 'thinking' : (unread && clients.size ? 'unread' : ''));
  const info = () => ({ port, clients: clients.size, sharing, state: last, recent: recent.slice(-30), doc: doc.name, chat: chatOf(doc.key).slice(), activity: activity() });
  const remember = (e) => { recent.push(e); if (recent.length > 50) recent.shift(); };
  const talk = (key, name, e) => {
    const c = chats[key] || (chats[key] = { name, t: 0, items: [] });
    c.items.push(e); if (c.items.length > 100) c.items.shift();
    c.t = e.t; if (name) c.name = name;
    saveChat();
  };
  /** A snapshot tells which document is in front: switch the chat shown. */
  const setDoc = (cur) => {
    const key = cur.doc ? (cur.path || cur.doc) : '';
    if (key !== doc.key || cur.doc !== doc.name) { doc = { key, name: cur.doc }; return true; }
    return false;
  };
  const MAX_TEXT = 2000;
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
    if (!lastJobEnd || Date.now() - lastJobEnd >= WORKING_HOLD_MS) changed(); // the panel shows "working"
    const r = await evalScript(job.code);
    busy = false;
    lastJobEnd = Date.now();
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = setTimeout(() => { holdTimer = null; changed(); }, WORKING_HOLD_MS + 50);
    if (holdTimer.unref) holdTimer.unref();
    afterAgent = true;
    // CEP answers a script that threw with this literal string (no message, no line)
    if (r === 'EvalScript error.') send(job.sock, { id: job.id, ok: false, error: 'The script failed in Illustrator (no message from the panel engine).' });
    else send(job.sock, { id: job.id, ok: true, result: r });
    pump();
  }

  // force: look even with no agent connected (start-up, host events) — only to know the document for the chat
  async function poll(force) {
    const share = clients.size && sharing;
    if (polling || busy || !opts.snapshot || (!share && !force)) return;
    polling = true;
    try {
      let cur;
      try { cur = JSON.parse(await evalScript(opts.snapshot)); } catch (e) { cur = { error: 'snapshot: ' + e.message }; }
      if (!cur.error && setDoc(cur)) changed();
      if (!share) return;
      const events = diff(last, cur);
      // the first good snapshot (after a connect or a resume) is the baseline: send it as the current state
      const baseline = !last && !cur.error;
      if (!cur.error) last = cur;
      // the whole snapshot goes out first whenever something changed, so clients never patch state together
      if (baseline || events.length) broadcast({ state: cur });
      for (const e of events) {
        e.t = Date.now();
        if (afterAgent) e.after_agent = true;
        remember(e);
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
    const drop = () => { thinking.delete(sock); if (clients.delete(sock)) { if (!clients.size) last = null; changed(); } };
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
        else if (m.op === 'say') {
          // the agent's words for the designer: shown in the panel only
          const key = replyKey !== null ? replyKey : doc.key;
          talk(key, chats[key] ? chats[key].name : doc.name, { type: 'agent', text: String(m.text || '').slice(0, MAX_TEXT), t: Date.now() });
          thinking.delete(sock); // an answer ends "thinking"
          changed();
          send(sock, { id: m.id, ok: true, result: 'shown' });
        } else if (m.op === 'activity') {
          if (m.state === 'thinking') { thinking.add(sock); unread = false; } else thinking.delete(sock);
          changed();
          send(sock, { id: m.id, ok: true, result: 'ok' });
        }
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
          poll(true); // which document is in front: its chat
          resolve({ port });
        });
      });
    },
    stop() {
      if (timer) clearInterval(timer);
      if (holdTimer) clearTimeout(holdTimer);
      for (const c of clients) c.destroy();
      clients.clear();
      if (server) server.close();
      // remove the discovery file only if it is still ours (another panel may have replaced it)
      try { if (JSON.parse(fs.readFileSync(file, 'utf8')).token === token) fs.unlinkSync(file); } catch (e) { /* gone */ }
    },
    /** The designer wrote to the agent from the panel. false (nothing sent) when no agent is connected. */
    message(text) {
      text = String(text || '').trim().slice(0, MAX_TEXT);
      if (!text || !clients.size) return false;
      const e = { type: 'message', text, t: Date.now() };
      talk(doc.key, doc.name, e);
      replyKey = doc.key;
      unread = true;
      broadcast({ event: e });
      changed();
      return true;
    },
    /** Something happened in Illustrator (a CSXS event): look now instead of at the next tick. */
    poke() { setTimeout(() => poll(true), 30); },
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
