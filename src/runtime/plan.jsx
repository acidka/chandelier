// Plan-then-run (docs/research/plan-then-run-plan.md): which commands need an approved plan, what a plan's steps would
// touch (plan_probe: resolves refs, changes nothing), the document fingerprint a run checks first (drift), and the undo
// marker that makes every plan run its own undo step (quirk C35).
(function (A) {
  // Same rule as src/plan/classify.ts (a unit test compares them).
  A.needsPlan = function (cmd, a) {
    a = a || {};
    var act = a.action;
    if (A.READ_ONLY[cmd] || cmd === 'preview' || cmd === 'render_file' || cmd === 'selection' || cmd === 'plan_probe') return false;
    if (cmd === 'documents') return !(act === 'list' || act === 'open' || act === 'activate');
    if (cmd === 'layers' || cmd === 'artboards') return !(act === undefined || act === null || act === 'list' || act === 'activate');
    if (cmd === 'swatches' || cmd === 'styles' || cmd === 'symbols') return !(act === undefined || act === null || act === 'list');
    if (cmd === 'history') return act === 'redo';
    if (cmd === 'batch') {
      var st = a.steps || [];
      for (var i = 0; i < st.length; i++) if (A.needsPlan(st[i].cmd, st[i].args)) return true;
      return false;
    }
    return true;
  };

  // 32-bit FNV-1a twice (the second with another seed and the position mixed in): 16 hex digits
  A.hash = function (s) {
    s = String(s);
    var h1 = 0x811c9dc5, h2 = 0xdeadbeef, i, c;
    var mul = function (h) { return (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0; };
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      h1 = mul((h1 ^ c) >>> 0);
      h2 = mul((h2 ^ c ^ (i & 255)) >>> 0);
    }
    var hex = function (n) { var t = n.toString(16); while (t.length < 8) t = '0' + t; return t; };
    return hex(h1) + hex(h2);
  };

  // Refs a step names: refs, items[].ref. "@n" (items an earlier step makes) are not resolved.
  function refList(a) {
    var out = [], k;
    if (a.refs !== undefined && a.refs !== null) out = out.concat(a.refs instanceof Array ? a.refs : [a.refs]);
    if (a.items instanceof Array) for (k = 0; k < a.items.length; k++) if (a.items[k] && a.items[k].ref !== undefined) out.push(a.items[k].ref);
    return out;
  }
  function resolve(a) {
    var list = refList(a), items = [], seen = {}, from = [], bad = [], k, j;
    for (k = 0; k < list.length; k++) {
      var r = list[k];
      if (typeof r === 'string' && r.charAt(0) === '@') { from.push(+r.slice(1)); continue; }
      var got;
      try { got = A.refs(r); } catch (e) { bad.push(String(typeof r === 'object' ? A.json(r) : r)); continue; }
      for (j = 0; j < got.length; j++) {
        var u = '';
        try { u = String(got[j].uuid); } catch (e2) { u = 'x' + items.length; }
        if (!seen[u]) { seen[u] = 1; items.push(got[j]); }
      }
    }
    return { named: list.length, items: items, from: from, bad: bad };
  }
  function layerName(it) {
    try { var L = A.layerOf(it); return L ? String(L.name) : '?'; } catch (e) { return '?'; }
  }
  function cut(s, n) { s = String(s).replace(/[\r\n]+/g, ' '); return s.length > n ? s.slice(0, n - 1) + '\u2026' : s; }

  // What one step would touch, without changing anything.
  A.probeStep = function (cmd, a, i) {
    var e = { step: i, cmd: cmd }, k;
    if (!A.needsPlan(cmd, a)) { e.read = true; return e; }
    if (cmd === 'script') e.opaque = true;
    if (cmd === 'menu_command') { e.opaque = true; try { e.selection = A.doc().selection.length || 0; } catch (x) { e.selection = 0; } }
    if (!app.documents.length) return e;
    var r = resolve(a);
    if (r.named) {
      e.count = r.items.length;
      var by = {}, order = [];
      for (k = 0; k < r.items.length; k++) { var n = layerName(r.items[k]); if (!by.hasOwnProperty(n)) { by[n] = 0; order.push(n); } by[n]++; }
      e.layers = [];
      for (k = 0; k < order.length && k < 8; k++) e.layers.push([order[k], by[order[k]]]);
      // for the panel's Show button (selects them)
      e.uuids = [];
      for (k = 0; k < r.items.length && k < 200; k++) { try { e.uuids.push(String(r.items[k].uuid)); } catch (x4) {} }
    }
    if (r.from.length) e.from_steps = r.from;
    if (r.bad.length) e.unresolved = r.bad.slice(0, 5);
    if (cmd === 'edit_text') {
      e.texts = [];
      for (k = 0; k < r.items.length && e.texts.length < 3; k++) {
        try { if (r.items[k].typename === 'TextFrame') e.texts.push([String(r.items[k].name || ''), cut(r.items[k].contents, 60)]); } catch (x2) {}
      }
    }
    if (/^create_/.test(cmd) || cmd === 'place') {
      try { e.layer = a.layer && a.layer !== '@active' ? String(a.layer) : String(A.doc().activeLayer.name); } catch (x3) {}
    }
    return e;
  };

  // The document state a plan was made on. A plan that starts with documents new depends only on which documents are open.
  A.planFingerprint = function (steps) {
    var fresh = steps && steps.length && steps[0].cmd === 'documents' && steps[0].args && steps[0].args.action === 'new';
    var names = [];
    try { names = A.docNames(); } catch (e) {}
    if (fresh || !app.documents.length) return { doc: null, open: names.join(', '), h: A.hash('none|' + names.join('|')) };
    var d = A.doc(), f = { doc: String(d.name), path: null, items: 0, layers: '', artboards: 0, swatches: 0, styles: 0, refs: 0 }, k, j;
    try { if (String(d.path) !== '') f.path = d.fullName.fsName; } catch (e1) {}
    try { f.items = d.pageItems.length; } catch (e2) {}
    try { var ln = []; for (k = 0; k < d.layers.length; k++) ln.push(d.layers[k].name); f.layers = ln.join(', '); } catch (e3) {}
    try { f.artboards = d.artboards.length; } catch (e4) {}
    try { f.swatches = d.swatches.length; } catch (e5) {}
    try { f.styles = d.paragraphStyles.length; } catch (e6) {}
    var parts = [], base = A.S;
    for (k = 0; k < (steps || []).length; k++) {
      A.S = A.merge(base, steps[k].settings);
      var r;
      try { r = resolve(steps[k].args || {}); } catch (e7) { r = { items: [] }; }
      A.S = base;
      for (j = 0; j < r.items.length; j++) {
        var it = r.items[j], s = '';
        try {
          var b = it.visibleBounds;
          s = it.uuid + ':' + it.name + ':' + Math.round(b[0] * 10) + ',' + Math.round(b[1] * 10) + ',' + Math.round(b[2] * 10) + ',' + Math.round(b[3] * 10);
          if (it.typename === 'TextFrame') s += ':' + it.contents;
          else if (it.typename === 'PathItem') s += ':' + (it.filled ? A.colorStr(it.fillColor) : 'none');
        } catch (e8) { s += '?'; }
        parts.push(s);
      }
      f.refs += r.items.length;
    }
    f.h = A.hash([f.doc, f.path, f.items, f.layers, f.artboards, f.swatches, f.styles].join('|') + '#' + parts.join('|'));
    return f;
  };

  // What differs between the plan's fingerprint and now, in words.
  A.planDrift = function (was, now) {
    var out = [], keys = ['doc', 'path', 'open', 'items', 'layers', 'artboards', 'swatches', 'styles', 'refs'], k;
    was = was || {};
    for (k = 0; k < keys.length; k++) {
      var a = was[keys[k]], b = now[keys[k]];
      if (a !== undefined && String(a) !== String(b)) out.push(keys[k] + ' ' + A.json(a) + ' \u2192 ' + A.json(b));
    }
    return out.length ? out.join('; ') : 'an item the plan touches was moved, renamed, recoloured or edited';
  };

  // A change that makes the call an undo step even when the steps change nothing before failing (quirk C35):
  // a hidden 1 x 1 path, made and removed at once; a temporary layer when the active layer takes no items (C32).
  A.planMarker = function () {
    if (!app.documents.length) return false;
    var d = A.doc();
    try { var p = d.activeLayer.pathItems.rectangle(0, 0, 1, 1); p.hidden = true; p.remove(); return true; } catch (e) {}
    try {
      var prev = d.activeLayer, L = d.layers.add();
      L.remove();
      try { d.activeLayer = prev; } catch (e3) {}
      return true;
    } catch (e2) {}
    return false;
  };

  // Documents the current call opened or made, closed without saving (a failed plan that started with documents new).
  A.closeNew = function () {
    var before = {}, i, out = [];
    for (i = 0; i < A.docsBefore.length; i++) before[A.docsBefore[i]] = 1;
    for (i = app.documents.length - 1; i >= 0; i--) {
      var d = app.documents[i];
      try { if (before[d.name]) continue; var n = d.name; d.close(SaveOptions.DONOTSAVECHANGES); out.push(n); } catch (e) {}
    }
    return out;
  };

  // {steps: [{cmd, args, settings}]} -> {fp, steps: [what each would touch]}. Changes nothing.
  A.cmd.plan_probe = function (a) {
    var steps = a.steps || [], out = [], base = A.S, fresh = false, i;
    for (i = 0; i < steps.length; i++) {
      var s = steps[i], args = s.args || {};
      A.S = A.merge(base, s.settings);
      try {
        if (fresh) out.push({ step: i, cmd: s.cmd, fresh: true });
        else out.push(A.probeStep(s.cmd, args, i));
      } catch (e) { out.push({ step: i, cmd: s.cmd, error: String(e.message || e) }); }
      A.S = base;
      if (s.cmd === 'documents' && args.action === 'new') fresh = true;
    }
    var res = { fp: A.planFingerprint(steps), steps: out };
    if (app.documents.length) {
      try {
        var d = A.doc(), ln = [];
        for (i = 0; i < d.layers.length; i++) ln.push(d.layers[i].name);
        res.layers = ln; res.active_layer = String(d.activeLayer.name);
      } catch (e2) {}
    }
    return res;
  };
})($.global.AIA);
