// Chandelier panel UI glue: starts panel-core.js with Illustrator's evalScript, forwards CSXS host events as "look
// now" pokes, and shows connection state and recent events. Browser + Node (mixed context, see CSXS/manifest.xml).
/* global window, document */
(function () {
  'use strict';
  var cep = window.__adobe_cep__;
  var req = (typeof require === 'function') ? require : (window.cep_node && window.cep_node.require);
  var $ = function (id) { return document.getElementById(id); };
  var clients = 0; // connected agents (the chat's Send button needs one)

  function fail(msg) {
    $('dot').className = 'dot err';
    $('status').textContent = msg;
    show('status');
  }

  // tabs: Chat (text box, Send, messages) and Status (connection, sharing switch, recent events)
  function show(name) {
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].className = 'tab' + (tabs[i].getAttribute('data-page') === name ? ' active' : '');
    var pages = document.querySelectorAll('.page');
    for (var j = 0; j < pages.length; j++) pages[j].className = 'page' + (pages[j].id === 'page-' + name ? ' active' : '');
  }
  (function () {
    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].addEventListener('click', function () { show(this.getAttribute('data-page')); });
  })();
  if (!cep) return fail('Not running inside Illustrator.');
  if (!req) return fail('Node.js is not enabled for this panel (CSXS/manifest.xml: --enable-nodejs).');

  var path = req('path'), fs = req('fs');
  // getSystemPath gives a file: URL; strip the scheme as Adobe's CSInterface does
  var ext = decodeURI(cep.getSystemPath('extension')).replace(/^file:\/{2,3}/, '');
  if (/^[A-Za-z]:/.test(ext) === false && ext.charAt(0) !== '/') ext = '/' + ext;
  var core = req(path.join(ext, 'panel-core.js'));
  var snapshot = fs.readFileSync(path.join(ext, 'host', 'snapshot.jsx'), 'utf8');
  var version = (function () { try { return JSON.parse(fs.readFileSync(path.join(ext, 'version.json'), 'utf8')).version; } catch (e) { return ''; } })();

  function describe(e) {
    var t = new Date(e.t).toLocaleTimeString();
    var what;
    if (e.type === 'selection') {
      what = e.count === 0 ? 'Selection cleared' : ('Selected ' + e.count + (e.items && e.items[0] ? ': ' + (e.items[0].name || e.items[0].text || e.items[0].type) : ''));
    } else if (e.type === 'document') what = e.doc ? 'Document: ' + e.doc : 'No document open';
    else if (e.type === 'saved') what = 'Saved ' + e.doc;
    else if (e.type === 'edited') what = 'Edited ' + e.doc;
    else what = e.type;
    return '<b>' + escapeHtml(what) + '</b> <span class="muted">' + t + (e.after_agent ? ' · agent' : '') + '</span>';
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var chatShown = 0;
  function render(info) {
    $('dot').className = 'dot' + (info.clients ? ' on' : '');
    $('dot').title = info.clients ? 'Agent connected' : 'No agent connected';
    $('status').innerHTML = 'Listening on <code>127.0.0.1:' + info.port + '</code>';
    $('agents').textContent = info.clients ? (info.clients + (info.clients === 1 ? ' agent connected' : ' agents connected')) : 'No agent connected';
    var list = info.recent.slice().reverse();
    $('events').innerHTML = list.length ? list.map(function (e) { return '<li>' + describe(e) + '</li>'; }).join('') : '<li class="muted">Nothing yet</li>';
    // chat: oldest first, scrolled to the newest when a message arrives
    if (info.chat.length !== chatShown) {
      chatShown = info.chat.length;
      $('log').innerHTML = info.chat.map(function (e) {
        var me = e.type === 'message';
        return '<li class="' + (me ? 'me' : 'agent') + '"><b>' + (me ? 'You' : 'Agent') + '</b> <span class="muted">' +
          new Date(e.t).toLocaleTimeString() + '</span>\n' + escapeHtml(e.text) + '</li>';
      }).join('');
      $('log').scrollTop = $('log').scrollHeight;
    }
    clients = info.clients;
    updateSend();
    // the "thinking" line under the chat
    var act = { working: 'Agent is working in Illustrator…', thinking: 'Agent is thinking…', unread: 'Sent · waiting for the agent to pick it up' }[info.activity] || '';
    $('activity').className = act ? 'on' + (info.activity === 'unread' ? '' : ' busy') : '';
    $('activity-text').textContent = act;
  }

  var panel = core.createPanel({
    evalScript: function (code, cb) { cep.evalScript(code, cb); },
    snapshot: snapshot,
    version: version,
    onChange: render,
  });
  panel.start().then(function () { render(panel.info()); }, function (e) { fail('Could not open the local socket: ' + e.message); });

  // Illustrator's CEP host events: look at the state right away instead of at the next poll tick
  ['documentAfterActivate', 'documentAfterDeactivate', 'documentAfterSave', 'applicationActivate'].forEach(function (type) {
    try { cep.addEventListener(type, function () { panel.poke(); }); } catch (e) { /* event not supported by this host */ }
  });

  $('share').addEventListener('change', function () { panel.setSharing(this.checked); });

  // chat: the designer writes to the agent; the agent reads it with the events tool and answers with events {say}
  function updateSend() {
    $('send').disabled = !clients || !$('msg').value.trim();
    $('msg').placeholder = clients ? 'Write to the agent… (⌘/Ctrl+Enter)' : 'No agent connected (see Status)';
    $('hint').textContent = clients ? 'The agent reads chat messages while it waits for events.' : 'No agent connected: start one with CHANDELIER_TRANSPORT=panel.';
  }
  function sendMessage() {
    if (panel.message($('msg').value)) { $('msg').value = ''; }
    updateSend();
  }
  $('msg').addEventListener('input', updateSend);
  $('msg').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); sendMessage(); }
  });
  $('send').addEventListener('click', sendMessage);
  window.addEventListener('beforeunload', function () { panel.stop(); });
})();
