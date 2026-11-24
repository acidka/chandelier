// chandelier runtime (ExtendScript, ES3). Loaded once into $.global.AIA by the MCP server;
// reloaded automatically when Illustrator restarts or the runtime version changes.
//
// Rules: ES3 only (npm run lint:jsx). This file stays ASCII (escape others as \uXXXX), and so do its regexes (quirk B6).
// Never read ParagraphStyle.characterAttributes (crashes Illustrator, quirk B1).
//
// Every tool call is   AIA.dispatch({cmd, args, settings}[, fn])  ->  "\u0001" + JSON envelope
//   {ok:true, data, doc, warnings?}  |  {ok:false, error, line?, where?, doc}
//
// Coordinates (session settings): units "pt"|"mm"|"in"|"px"; origin "artboard" = top-left of the reference
// artboard (settings.artboard, default the active one), y grows DOWN; origin "document" = Illustrator's own
// document coordinates (y up). Font size, leading, tracking and stroke width are always points.

$.global.AIA = (function () {
  var A = { v: '__AIA_VERSION__' };
  var DEFAULTS = { units: 'pt', origin: 'artboard', artboard: null };
  var UNIT = { pt: 1, px: 1, mm: 72 / 25.4, 'in': 72 };
  A.S = DEFAULTS;

  // -- JSON ------------------------------------------------------------------
  function q(s) {
    return '"' + String(s).replace(/[\\"\x00-\x1f\x7f-\uffff]/g, function (c) {
      if (c === '\\') return '\\\\';
      if (c === '"') return '\\"';
      var h = c.charCodeAt(0).toString(16);
      return '\\u' + ('0000' + h).slice(-4);
    }) + '"';
  }
  function ser(v, d) {
    if (v === null || v === undefined) return 'null';
    var t = typeof v;
    if (t === 'number') return isFinite(v) ? String(Math.round(v * 1000) / 1000) : 'null';
    if (t === 'boolean') return String(v);
    if (t === 'string') return q(v);
    if (t === 'function') return 'null';
    if (d > 12) return '"..."';
    var tn;
    try { tn = v.typename; } catch (e) { return '"(deleted)"'; }
    if (tn !== undefined && !(v instanceof Array)) { try { return ser(A.summary(v), d + 1); } catch (e) { return '"(deleted)"'; } }
    var a = [], k;
    if (v instanceof Array) {
      for (k = 0; k < v.length; k++) a.push(ser(v[k], d + 1));
      return '[' + a.join(',') + ']';
    }
    for (k in v) if (v.hasOwnProperty(k) && v[k] !== undefined) a.push(q(k) + ':' + ser(v[k], d + 1));
    return '{' + a.join(',') + '}';
  }
  // ASCII-only output: survives the AppleScript string return unchanged.
  A.json = function (v) { return ser(v, 0); };
  // Strict-enough JSON parse (json2-style validation, then eval).
  A.parse = function (s) {
    var t = String(s)
      .replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@')
      .replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']')
      .replace(/(?:^|:|,)(?:\s*\[)+/g, '');
    if (!/^[\],:{}\s]*$/.test(t)) throw new Error('AIA.parse: not valid JSON');
    return eval('(' + s + ')');
  };

  // -- small utils -------------------------------------------------------------
  function has(arr, v) { for (var i = 0; i < arr.length; i++) if (arr[i] === v) return true; return false; }
  A.has = has;
  function r2(n) { return Math.round(n * 100) / 100; }
  function rnd(n) { return Math.round(n * 10) / 10; }
  // Glob match without regex (non-ASCII safe, quirk B6): "*" = any run, "?" = one char. Case-sensitive.
  A.glob = function (pat, s) {
    pat = String(pat); s = String(s);
    if (pat.indexOf('*') < 0 && pat.indexOf('?') < 0) return pat === s;
    var p = 0, i = 0, star = -1, mark = 0;
    while (i < s.length) {
      if (p < pat.length && (pat.charAt(p) === '?' || pat.charAt(p) === s.charAt(i))) { p++; i++; }
      else if (p < pat.length && pat.charAt(p) === '*') { star = p++; mark = i; }
      else if (star >= 0) { p = star + 1; i = ++mark; }
      else return false;
    }
    while (p < pat.length && pat.charAt(p) === '*') p++;
    return p === pat.length;
  };

  // -- documents -----------------------------------------------------------------
  A.doc = function () {
    if (!app.documents.length) throw new Error('No document is open. Create one with documents {action:"new"}.');
    return app.activeDocument;
  };
  A.mm = function (v) { return v * 72 / 25.4; };
  // Windows: a menu command acts on the selection Illustrator last drew, not the one a script just set, until a redraw
  // (W6, Illustrator 31: Live Pathfinder on a fresh selection failed 10/10 without it, worked 10/10 with it).
  // Call after changing the selection and before app.executeMenuCommand. macOS doesn't need it: no-op there.
  A.WIN = String($.os || '').indexOf('Windows') >= 0;
  A.syncSelection = function () { if (A.WIN) { try { app.redraw(); } catch (e) {} } };

  // -- units and coordinates (session settings) ---------------------------------
  A.unit = function () { return UNIT[A.S.units] || 1; };
  A.u = function (v) { return v * A.unit(); };          // session units -> pt
  A.toU = function (pt) { return r2(pt / A.unit()); };  // pt -> session units
  A.abIndex = function (doc) {
    doc = doc || A.doc();
    var i = A.S.artboard;
    if (i === null || i === undefined) return doc.artboards.getActiveArtboardIndex();
    if (i < 0 || i >= doc.artboards.length) throw new Error('Artboard ' + i + ' does not exist (document has ' + doc.artboards.length + ').');
    return i;
  };
  A.abRect = function (doc) {
    doc = doc || A.doc();
    return doc.artboards[A.abIndex(doc)].artboardRect; // [left, top, right, bottom], y up
  };
  // session point -> document [X, Y up]
  A.P = function (x, y) {
    if (A.S.origin === 'document') return [A.u(x), A.u(y)];
    var r = A.abRect();
    return [r[0] + A.u(x), r[1] - A.u(y)];
  };
  // document [X, Y] -> session [x, y]
  A.fromDoc = function (X, Y) {
    if (A.S.origin === 'document') return [A.toU(X), A.toU(Y)];
    var r = A.abRect();
    return [A.toU(X - r[0]), A.toU(r[1] - Y)];
  };
  // document bounds [l, t, r, b] -> session [x, y, w, h] (y = top edge)
  A.rectOut = function (b) {
    var p = A.fromDoc(b[0], b[1]);
    return [p[0], p[1], A.toU(b[2] - b[0]), A.toU(b[1] - b[3])];
  };
  // session [x, y, w, h] -> document bounds [l, t, r, b]
  A.rectIn = function (r) {
    var p = A.P(r[0], r[1]);
    return [p[0], p[1], p[0] + A.u(r[2]), p[1] - A.u(r[3])];
  };
  // item -> [x, y, w, h] (visible bounds, i.e. including stroke)
  // Bounds as the user sees them: a clipping group's bounds are its mask's (Illustrator reports the
  // unclipped content, quirk C14). vb = visible (incl. stroke), gb = geometric.
  A.clipPath = function (g) {
    if (g.typename !== 'GroupItem' || !g.clipped) return null;
    for (var i = 0; i < g.pageItems.length; i++) {
      var k = g.pageItems[i];
      if (k.typename === 'PathItem' && k.clipping) return k;
      if (k.typename === 'CompoundPathItem' && k.pathItems.length && k.pathItems[0].clipping) return k;
    }
    return null;
  };
  A.vb = function (it) { var m = A.clipPath(it); return m ? m.geometricBounds : it.visibleBounds; };
  A.gb = function (it) { var m = A.clipPath(it); return m ? m.geometricBounds : it.geometricBounds; };
  A.box = function (item) { return A.rectOut(A.vb(item)); };

  // -- item summary (what an Illustrator object turns into in JSON) ------------
  A.summary = function (o) {
    var t = o.typename, s = { type: t };
    try { if (o.uuid !== undefined) s.uuid = o.uuid; } catch (e) {}
    try { if (o.name) s.name = o.name; } catch (e) {}
    if (t === 'Document') { try { s.path = o.fullName.fsName; } catch (e) { s.path = null; } return s; }
    if (t === 'Layer') { s.items = o.pageItems.length; return s; }
    if (t === 'Swatch' || t === 'Spot' || t === 'ParagraphStyle' || t === 'CharacterStyle' || t === 'TextFont' || t === 'Artboard') return s;
    if (t === 'CMYKColor' || t === 'RGBColor' || t === 'GrayColor' || t === 'SpotColor' || t === 'NoColor') return A.colorStr(o);
    try { if (o.visibleBounds) s.box = A.box(o); } catch (e) {}
    if (t === 'TextFrame') { try { s.text = o.contents.length > 40 ? o.contents.slice(0, 40) + '...' : o.contents; } catch (e) {} }
    if (t === 'GroupItem') { try { s.items = o.pageItems.length; } catch (e) {} }
    return s;
  };

  // -- colours: "cmyk(c,m,y,k)" "gray(k)" "#rrggbb" "rgb(r,g,b)" "swatch:Name" "swatch:Name@50" "none" --
  A.color = function (spec) {
    if (spec === undefined || spec === null) return null;
    if (typeof spec !== 'string') return spec; // already a Color
    var s = spec.replace(/\s+/g, ''), m, c;
    if (s === 'none') return new NoColor();
    var cmykDoc = app.documents.length && app.activeDocument.documentColorSpace === DocumentColorSpace.CMYK;
    if ((m = s.match(/^cmyk\(([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)$/i))) {
      c = new CMYKColor(); c.cyan = +m[1]; c.magenta = +m[2]; c.yellow = +m[3]; c.black = +m[4]; return c;
    }
    if ((m = s.match(/^gray\(([\d.]+)\)$/i))) {
      if (cmykDoc) { c = new CMYKColor(); c.cyan = 0; c.magenta = 0; c.yellow = 0; c.black = +m[1]; return c; }
      c = new GrayColor(); c.gray = +m[1]; return c;
    }
    if ((m = s.match(/^#([0-9a-f]{6})$/i))) {
      c = new RGBColor(); c.red = parseInt(m[1].slice(0, 2), 16); c.green = parseInt(m[1].slice(2, 4), 16); c.blue = parseInt(m[1].slice(4, 6), 16); return c;
    }
    if ((m = s.match(/^rgb\(([\d.]+),([\d.]+),([\d.]+)\)$/i))) {
      c = new RGBColor(); c.red = +m[1]; c.green = +m[2]; c.blue = +m[3]; return c;
    }
    if ((m = s.match(/^lab\(([\d.]+),(-?[\d.]+),(-?[\d.]+)\)$/i))) {
      c = new LabColor(); c.l = +m[1]; c.a = +m[2]; c.b = +m[3]; return c;
    }
    if (spec.indexOf('swatch:') === 0) {
      var rest = spec.slice(7), at = rest.lastIndexOf('@'), tint = null;
      if (at > 0) { tint = +rest.slice(at + 1); rest = rest.slice(0, at); }
      var sw;
      try { sw = A.doc().swatches.getByName(rest); } catch (e) { throw new Error('No swatch named "' + rest + '".'); }
      c = sw.color;
      // A NEW SpotColor: setting .tint on sw.color changed the swatch itself, so every later "swatch:Name" came out at
      // that tint (found by the 0.2.1 contrast test). A plain "swatch:Name" is always 100 %.
      if (c.typename === 'SpotColor') { var sc = new SpotColor(); sc.spot = c.spot; sc.tint = tint !== null ? tint : 100; return sc; }
      return c;
    }
    if (spec.indexOf('gradient:') === 0) {
      var gn = spec.slice(9), ga = gn.lastIndexOf('@'), ang = null, gr;
      if (ga > 0) { ang = +gn.slice(ga + 1); gn = gn.slice(0, ga); }
      try { gr = A.doc().gradients.getByName(gn); } catch (e) { throw new Error('No gradient named "' + gn + '".'); }
      c = new GradientColor(); c.gradient = gr;
      if (ang !== null) c.angle = ang;
      return c;
    }
    throw new Error('Unknown colour "' + spec + '". Use cmyk(c,m,y,k), gray(k), #rrggbb, swatch:Name, swatch:Name@tint, gradient:Name@angle or none.');
  };
  // Color -> the same short string syntax.
  A.colorStr = function (c) {
    if (!c) return null;
    var t = c.typename;
    if (t === 'NoColor') return 'none';
    if (t === 'CMYKColor') return 'cmyk(' + rnd(c.cyan) + ',' + rnd(c.magenta) + ',' + rnd(c.yellow) + ',' + rnd(c.black) + ')';
    if (t === 'GrayColor') return 'gray(' + rnd(c.gray) + ')';
    if (t === 'RGBColor') {
      var h = function (n) { var x = Math.round(n).toString(16); return x.length < 2 ? '0' + x : x; };
      return '#' + h(c.red) + h(c.green) + h(c.blue);
    }
    if (t === 'SpotColor') { var n = 'swatch:' + c.spot.name; return Math.round(c.tint) === 100 ? n : n + '@' + Math.round(c.tint); }
    if (t === 'GradientColor') { try { return 'gradient:' + c.gradient.name + (Math.round(c.angle) ? '@' + Math.round(c.angle) : ''); } catch (e) { return 'gradient'; } }
    if (t === 'PatternColor') { try { return 'pattern:' + c.pattern.name; } catch (e) { return 'pattern'; } }
    if (t === 'LabColor') return 'lab(' + rnd(c.l) + ',' + rnd(c.a) + ',' + rnd(c.b) + ')';
    return t;
  };

  // Global process swatch (create or update). Use it as "swatch:Name".
  A.swatch = function (name, spec) {
    var doc = A.doc(), base = A.color(spec), spot;
    A.retry(function () {
      spot = A.namedSpot(doc, name);
      spot.colorType = ColorModel.PROCESS;
      spot.color = base;
    });
    var c = new SpotColor(); c.spot = spot; c.tint = 100;
    return c;
  };
  // Spot by name, created if missing. A new spot whose naming fails (MRAP, B3) is removed, so a retry leaves no
  // unnamed extra swatch behind.
  A.namedSpot = function (doc, name) {
    var sp;
    try { return doc.spots.getByName(name); } catch (e) {}
    sp = doc.spots.add();
    try { sp.name = name; } catch (e2) { try { sp.remove(); } catch (e3) {} throw e2; }
    return sp;
  };
  // Retry fn on Illustrator's transient MRAP error (B3), up to n tries (default 4: after 40 ms, 80 ms, then 1 s - a
  // busy spell of seconds was seen while the designer worked in Illustrator, panel trial 2026-11-24). Only for steps
  // that are safe to repeat (set a property, apply a style, add-or-update by name). Counted for status (mrap).
  A.MRAP = 1346458189;
  A.mrapRetries = 0; A.mrapFailed = 0;
  A.isMrap = function (e) { return !!e && (e.number === A.MRAP || /MRAP/.test(String(e.message))); };
  A.retry = function (fn, n) {
    n = n || 4;
    for (var i = 0; ; i++) {
      try { return fn(); } catch (e) {
        if (!A.isMrap(e) || i >= n - 1) throw e;
        A.mrapRetries++;
        $.sleep(i < 2 ? 40 * (i + 1) : 1000);
      }
    }
  };

  // -- renders show what prints -------------------------------------------------------
  // imageCapture draws non-printing layers, exportFile(PNG24) and the PDF presets don't (quirk C22). Hide
  // visible non-printing layers (any depth) for a render; A.restoreLayers(list) shows them again.
  A.hideNonPrinting = function (doc) {
    var hidden = [];
    function scan(layers) {
      for (var i = 0; i < layers.length; i++) {
        var L = layers[i];
        if (!L.visible) continue;
        if (!L.printable) { try { L.visible = false; hidden.push(L); } catch (e) {} continue; }
        scan(L.layers);
      }
    }
    scan(doc.layers);
    return hidden;
  };
  A.restoreLayers = function (list) {
    for (var i = 0; i < list.length; i++) { try { list[i].visible = true; } catch (e) {} }
  };

  // -- walking items ------------------------------------------------------------------
  // Recursive walk layers -> sublayers -> items -> group children. ~190x faster than indexing doc.pageItems
  // (5 000 items: 9 ms vs 1.7 s, 2026-11-22): doc.pageItems[i] costs ~0.35 ms per access on big documents.
  // fn(item) returning false stops the walk. root: a Document (default), Layer or GroupItem.
  A.walk = function (fn, root) {
    var stop = false;
    function items(c) {
      var p = c.pageItems, n = p.length;
      for (var i = 0; i < n && !stop; i++) {
        var it = p[i];
        if (fn(it) === false) { stop = true; return; }
        if (it.typename === 'GroupItem') items(it);
      }
    }
    function layer(L) {
      items(L);
      var ls = L.layers, n = ls.length;
      for (var i = 0; i < n && !stop; i++) layer(ls[i]);
    }
    root = root || A.doc();
    if (root.typename === 'Document') { var dl = root.layers, n = dl.length; for (var i = 0; i < n && !stop; i++) layer(dl[i]); }
    else if (root.typename === 'Layer') layer(root);
    else items(root);
  };
  // Items directly in layers (and sublayers): what the user sees as "top level".
  A.topLevel = function (root) {
    var out = [];
    function layer(L) {
      var p = L.pageItems, n = p.length, i;
      for (i = 0; i < n; i++) out.push(p[i]);
      var ls = L.layers;
      for (i = 0; i < ls.length; i++) layer(ls[i]);
    }
    root = root || A.doc();
    if (root.typename === 'Document') { for (var k = 0; k < root.layers.length; k++) layer(root.layers[k]); } else layer(root);
    return out;
  };

  // -- references: uuid, "selection", "name:X" (glob), "layer:X", "artboard:N", "@n" (batch step), items ----
  A.refs = function (ref) {
    var out = [], i;
    if (ref === undefined || ref === null) throw new Error('No reference given. Use a uuid, "selection", "name:X", "layer:X", "artboard:N" or "@n".');
    if (ref instanceof Array) { for (i = 0; i < ref.length; i++) out = out.concat(A.refs(ref[i])); return out; }
    if (typeof ref === 'object') return [ref];
    var s = String(ref), doc = A.doc();
    if (/^\d+$/.test(s)) {
      var it;
      try { it = doc.getPageItemFromUuid(s); } catch (e) { it = null; }
      if (!it) throw new Error('No item with uuid ' + s + ' in ' + doc.name + '. It may have been deleted, or belong to another document.');
      return [it];
    }
    if (s === 'selection') {
      var sel = doc.selection;
      if (!(sel instanceof Array)) return [];
      for (i = 0; i < sel.length; i++) out.push(sel[i]);
      return out;
    }
    if (s.charAt(0) === '@') {
      var n = +s.slice(1), res = A.steps;
      if (!res || !(n >= 0) || n >= res.length) throw new Error('Unknown step reference ' + s + ' (only earlier steps of the same batch, counted from 0).');
      return A.itemsOf(res[n]);
    }
    if (s.indexOf('name:') === 0) {
      var nm = s.slice(5);
      A.walk(function (it) { if (A.glob(nm, it.name)) out.push(it); });
      if (!out.length) throw new Error('No item named "' + nm + '".');
      return out;
    }
    if (s.indexOf('layer:') === 0) {
      var L = A.layerByName(s.slice(6));
      var lp = L.pageItems, ln = lp.length; // a layer's pageItems are its direct children
      for (i = 0; i < ln; i++) out.push(lp[i]);
      return out;
    }
    if (s.indexOf('artboard:') === 0) {
      var k = +s.slice(9);
      if (!(k >= 0) || k >= doc.artboards.length) throw new Error('Artboard ' + s.slice(9) + ' does not exist.');
      var ab = doc.artboards[k].artboardRect, items = A.topLevel(doc);
      for (i = 0; i < items.length; i++) if (A.intersects(A.vb(items[i]), ab)) out.push(items[i]);
      return out;
    }
    throw new Error('Unknown reference "' + s + '". Use a uuid, "selection", "name:X", "layer:X", "artboard:N" or "@n".');
  };
  A.ref = function (ref) {
    var r = A.refs(ref);
    if (r.length !== 1) throw new Error('Expected one item for ' + A.json(ref) + ', found ' + r.length + '.');
    return r[0];
  };
  // Items in a step result: an item, {uuid}, {items:[...]}, or an array of those.
  A.itemsOf = function (v) {
    var out = [], i, doc = A.doc();
    if (v === null || v === undefined) return out;
    if (v.typename !== undefined && !(v instanceof Array)) return [v];
    if (v instanceof Array) { for (i = 0; i < v.length; i++) out = out.concat(A.itemsOf(v[i])); return out; }
    if (typeof v === 'object') {
      if (v.uuid !== undefined) { try { var it = doc.getPageItemFromUuid(String(v.uuid)); if (it) out.push(it); } catch (e) {} return out; }
      if (v.items) return A.itemsOf(v.items);
      if (v.result !== undefined) return A.itemsOf(v.result);
    }
    return out;
  };
  // [l,t,r,b] y-up rectangles
  A.intersects = function (a, b) { return a[0] <= b[2] && a[2] >= b[0] && a[3] <= b[1] && a[1] >= b[3]; };
  // "Name" (top level first, then any depth) or a path "Parent/Child".
  // Default layer names per UI language (quirk B5: names are localised), for "Layer 1" lookups.
  var DEFAULT_LAYER = /^(Layer|\u0421\u043b\u043e\u0439|Calque|Ebene|Capa|Livello|Laag) (\d+)$/;
  A.findLayer = function (name, doc) {
    doc = doc || A.doc();
    if (name === '@active') return doc.activeLayer;
    if (name === '@first') return doc.layers[0];
    var found = findLayerByName(name, doc), m;
    // "Layer 1" in an English script also finds the localised default layer ("\u0421\u043b\u043e\u0439 1"), and vice versa
    if (!found && (m = String(name).match(DEFAULT_LAYER))) {
      for (var k = 0; k < doc.layers.length; k++) { var mm = doc.layers[k].name.match(DEFAULT_LAYER); if (mm && mm[2] === m[2]) return doc.layers[k]; }
    }
    return found;
  };
  function findLayerByName(name, doc) {
    var parts = String(name).split('/'), L = null, i, c = doc;
    if (parts.length > 1) {
      for (i = 0; i < parts.length; i++) { try { L = c.layers.getByName(parts[i]); } catch (e) { return null; } c = L; }
      return L;
    }
    try { return doc.layers.getByName(name); } catch (e) {}
    function deep(ls) {
      for (var k = 0; k < ls.length; k++) {
        if (ls[k].name === name) return ls[k];
        var f = deep(ls[k].layers); if (f) return f;
      }
      return null;
    }
    return deep(doc.layers);
  }
  A.layerByName = function (name, doc) {
    var L = A.findLayer(name, doc);
    if (!L) throw new Error('No layer named "' + name + '".');
    return L;
  };

  // -- containers --------------------------------------------------------------
  // Get or create a layer and make it the active one (new items go there unless a parent is given).
  // Get or create a layer WITHOUT changing the active layer (what tools use).
  A.layerGet = function (name) {
    var doc = A.doc(), keep = doc.activeLayer, l = A.findLayer(name, doc);
    if (l) return l;
    l = A.layer(name);
    try { if (keep && keep !== l) doc.activeLayer = keep; } catch (e) {}
    return l;
  };
  A.layer = function (name) {
    var doc = A.doc(), l;
    l = A.findLayer(name, doc);
    if (!l) {
      // Reuse the new document's empty default layer ("Layer 1", localised) instead of leaving it behind.
      var d0 = doc.layers[0], n0 = d0.name;
      var isDefault = doc.layers.length === 1 && d0.pageItems.length === 0 &&
        (/^Layer \d+$/.test(n0) || n0.indexOf('\u0421\u043b\u043e\u0439 ') === 0 || /^(Calque|Ebene|Capa|Livello|Laag) \d+$/.test(n0));
      l = isDefault ? d0 : doc.layers.add();
      l.name = name;
    }
    doc.activeLayer = l;
    return l;
  };
  // Get or create a layer, empty it (items and sublayers) and make it active: builders start with this so that
  // running them again replaces their content instead of adding a second copy.
  A.fresh = function (name) {
    var L = A.layer(name);
    if (L.locked) L.locked = false;
    if (!L.visible) L.visible = true;
    while (L.layers.length) { L.layers[0].locked = false; L.layers[0].remove(); }
    while (L.pageItems.length) { var it = L.pageItems[0]; try { it.locked = false; } catch (e) {} it.remove(); }
    return L;
  };
  A.group = function (name, parent) {
    var g = (parent || A.doc().activeLayer).groupItems.add();
    if (name) g.name = name;
    return A.track(g);
  };
  A.find = function (name, type) {
    var found = null;
    A.walk(function (it) { if (it.name === name && (!type || it.typename === type)) { found = it; return false; } });
    return found;
  };

  // Items created during the current call (batch rollback removes them on failure).
  A.created = [];
  A.track = function (item) { A.created.push(item); return item; };

  // -- fonts (fuzzy: "Arial Bold" -> Arial-BoldMT) -------------------------------
  var fontCache = {};
  A.font = function (name) {
    if (fontCache[name]) return fontCache[name];
    var f = null;
    try { f = app.textFonts.getByName(name); } catch (e) {}
    if (!f) {
      // exact "Family Style" or PostScript name -> family name alone = its regular style -> PostScript prefix
      var norm = function (s) { return String(s).toLowerCase().replace(/[\s\-_]+/g, ''); };
      var want = norm(name), famRegular = null, famRank = -1, prefix = null;
      for (var i = 0; i < app.textFonts.length; i++) {
        var tf = app.textFonts[i], st = String(tf.style), fam = norm(tf.family);
        if (norm(tf.family + st) === want || norm(tf.name) === want) { f = tf; break; }
        if (fam === want) {
          var rank = /^(regular|roman|book|normal)$/i.test(st) ? 2 : (/^medium$/i.test(st) ? 1 : 0);
          if (famRegular === null || rank > famRank) { famRegular = tf; famRank = rank; }
        }
        if (prefix === null && norm(tf.name).indexOf(want) === 0) prefix = tf;
      }
      if (!f) f = famRegular !== null ? famRegular : prefix;
    }
    if (!f) throw new Error('Font not found: "' + name + '". Try the PostScript name, e.g. "Arial-BoldMT".');
    fontCache[name] = f;
    return f;
  };

  var JUST = { left: 'LEFT', center: 'CENTER', right: 'RIGHT', justify: 'FULLJUSTIFYLASTLINELEFT' };
  function applyChar(ca, o) {
    if (o.font) ca.textFont = A.font(o.font);
    if (o.size) ca.size = o.size;
    if (o.color) ca.fillColor = A.color(o.color);
    if (o.leading) { ca.autoLeading = false; ca.leading = o.leading; }
    if (o.tracking !== undefined) ca.tracking = o.tracking;
    if (o.hscale !== undefined) ca.horizontalScale = o.hscale;
  }

  // Paragraph style (create or update). Never reads style attributes (reading them can crash Illustrator).
  A.pstyle = function (name, o) {
    var doc = A.doc(), st;
    try { st = doc.paragraphStyles.getByName(name); } catch (e) { st = A.retry(function () { return doc.paragraphStyles.add(name); }); }
    A.retry(function () {
      applyChar(st.characterAttributes, o || {});
      if (o && o.align) st.paragraphAttributes.justification = Justification[JUST[o.align]];
    });
    return st;
  };

  // Point text at (x, y = BASELINE). "\r" or "\n" starts a new line. Atomic: removed again if styling fails.
  A.text = function (str, o) {
    o = o || {};
    var parent = o.parent || A.doc().activeLayer;
    var tf = parent.textFrames.pointText(A.P(o.x || 0, o.y || 0));
    try {
      tf.contents = String(str).replace(/\n/g, '\r');
      A.retry(function () {
        if (o.style) {
          var st = typeof o.style === 'string' ? A.doc().paragraphStyles.getByName(o.style) : o.style;
          st.applyTo(tf.textRange, true);
        }
        applyChar(tf.textRange.characterAttributes, o);
        if (o.align) tf.textRange.paragraphAttributes.justification = Justification[JUST[o.align]];
        if (o.name) tf.name = o.name;
      });
    } catch (e) { try { tf.remove(); } catch (e2) {} throw e; }
    return A.track(tf);
  };

  function paint(item, o) {
    if (o.fill !== undefined) { if (o.fill === 'none') item.filled = false; else { item.filled = true; item.fillColor = A.color(o.fill); } }
    else item.filled = false;
    if (o.stroke !== undefined && o.stroke !== 'none') {
      item.stroked = true; item.strokeColor = A.color(o.stroke); item.strokeWidth = o.sw || 1;
      if (o.cap) item.strokeCap = StrokeCap[{ butt: 'BUTTENDCAP', round: 'ROUNDENDCAP', square: 'PROJECTINGENDCAP' }[o.cap]];
      if (o.dash) item.strokeDashes = o.dash;
    } else item.stroked = false;
    if (o.name) item.name = o.name;
    return item;
  }
  A.paint = paint;

  A.rect = function (x, y, w, h, o) {
    o = o || {};
    var p = A.P(x, y);
    var r = A.track((o.parent || A.doc().activeLayer).pathItems.rectangle(p[1], p[0], A.u(w), A.u(h)));
    try { return paint(r, o); } catch (e) { try { r.remove(); } catch (e2) {} throw e; }
  };
  A.ellipse = function (x, y, w, h, o) {
    o = o || {};
    var p = A.P(x, y);
    var e = A.track((o.parent || A.doc().activeLayer).pathItems.ellipse(p[1], p[0], A.u(w), A.u(h)));
    try { return paint(e, o); } catch (err) { try { e.remove(); } catch (e2) {} throw err; }
  };
  A.line = function (x1, y1, x2, y2, o) {
    o = o || {};
    var l = A.track((o.parent || A.doc().activeLayer).pathItems.add());
    l.setEntirePath([A.P(x1, y1), A.P(x2, y2)]);
    if (o.stroke === undefined) o.stroke = 'gray(100)';
    if (o.fill === undefined) o.fill = 'none';
    try { return paint(l, o); } catch (e) { try { l.remove(); } catch (e2) {} throw e; }
  };
  A.path = function (pts, o) {
    o = o || {};
    var p = A.track((o.parent || A.doc().activeLayer).pathItems.add()), d = [];
    for (var i = 0; i < pts.length; i++) d.push(A.P(pts[i][0], pts[i][1]));
    p.setEntirePath(d);
    p.closed = !!o.closed;
    try { return paint(p, o); } catch (e) { try { p.remove(); } catch (e2) {} throw e; }
  };

  // -- commands (tools that run inside Illustrator) ------------------------------
  A.cmd = {};
  A.cmd.ping = function () { return { v: A.v, version: app.version, documents: app.documents.length }; };
  A.docList = function () {
    var o = [], act = null;
    try { act = app.documents.length ? app.activeDocument : null; } catch (e) {}
    for (var i = 0; i < app.documents.length; i++) {
      var d = app.documents[i], p = null;
      try { if (String(d.path) !== '') p = d.fullName.fsName; } catch (e) {}
      o.push({ name: d.name, saved: d.saved, active: d === act, path: p });
    }
    return o;
  };
  A.cmd.status = function () {
    return { version: app.version, locale: app.locale, documents: A.docList(), mrap: { retried: A.mrapRetries, failed: A.mrapFailed }, last_call: A.last || null };
  };

  A.warnings = [];
  A.warn = function (msg) { A.warnings.push(String(msg)); };

  function docName() { try { return app.documents.length ? app.activeDocument.name : null; } catch (e) { return null; } }
  function setSettings(s) {
    var o = {}, k;
    for (k in DEFAULTS) if (DEFAULTS.hasOwnProperty(k)) o[k] = DEFAULTS[k];
    if (s) for (k in s) if (s.hasOwnProperty(k)) o[k] = s[k];
    A.S = o;
  }
  // Error thrown inside this runtime (vs. in the agent's own script)?
  function inRuntime(e) {
    try { return !!(e && e.source && e.source.indexOf('$.global.AIA = (function') >= 0); } catch (x) { return false; }
  }
  A.errorInfo = function (e, userScript) {
    var o = { error: String((e && e.message) || e) };
    if (userScript && e && e.line) {
      if (inRuntime(e)) o.where = 'inside an AIA helper called by your code';
      else o.line = e.line - 1; // the script body starts on line 2 of the wrapper
    }
    if (A.isMrap(e)) { A.mrapFailed++; o.error += ' (MRAP: transient Illustrator error, retry once)'; }
    return o;
  };

  // The agent's script: a function body, compiled here so syntax errors are caught with a line number too.
  // Line 1 of the body is line 2 of the compiled source (errorInfo subtracts 1).
  A.compile = function (code) { return eval('(function(){\n' + code + '\n})'); };
  A.cmd.script = function (a) { return A.compile(a.code).apply(null, a.args || []); };

  // A failed call leaves no empty new document behind (M2 run A3 left an empty "Untitled"): documents the call
  // created that have no items and no file are closed without saving, with a warning. In a batch only with
  // rollback (earlier steps may have added swatches or styles the agent wants to keep).
  A.docsBefore = [];
  A.closeEmptyNew = function () {
    var before = {}, i, d;
    for (i = 0; i < A.docsBefore.length; i++) before[A.docsBefore[i]] = 1;
    for (i = app.documents.length - 1; i >= 0; i--) {
      d = app.documents[i];
      try {
        if (before[d.name] || d.pageItems.length || String(d.path) !== '') continue;
        var n = d.name;
        d.close(SaveOptions.DONOTSAVECHANGES);
        A.warn('Closed "' + n + '": the failed call created it and it was still empty.');
      } catch (e) {}
    }
  };
  var READ_ONLY = { ping: 1, status: 1, document_info: 1, find_items: 1, get_items: 1, get_tree: 1, preflight: 1, fonts: 1, export_prep: 1, items_at: 1 };
  // req = {cmd, args, settings}
  A.dispatch = function (req) {
    var env, lvl = null;
    A.warnings = []; A.created = []; A.steps = null;
    try { A.docsBefore = A.docNames(); } catch (e) { A.docsBefore = []; }
    // the last call that may have changed something: after a timeout, status shows whether it finished and what it made
    var rec = !READ_ONLY[req.cmd];
    if (rec) A.last = { call: req.call, cmd: req.cmd, finished: false, started: new Date().getTime() };
    try { lvl = app.userInteractionLevel; app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS; } catch (e) {}
    try {
      setSettings(req.settings);
      var data;
      var c = A.cmd[req.cmd];
      if (!c) throw new Error('Unknown runtime command "' + req.cmd + '".');
      // read-only commands are safe to repeat whole on MRAP (B3)
      data = READ_ONLY[req.cmd] ? A.retry(function () { return c(req.args || {}); }) : c(req.args || {});
      env = { ok: true, data: data === undefined ? null : data };
    } catch (e) {
      env = A.errorInfo(e, req.cmd === 'script');
      env.ok = false;
      try { A.closeEmptyNew(); } catch (e2) {}
    }
    try { if (lvl !== null) app.userInteractionLevel = lvl; } catch (e) {}
    if (rec && A.last) {
      var made = [];
      for (var ci = 0; ci < A.created.length && made.length < 50; ci++) { try { made.push(A.created[ci].uuid); } catch (e) {} }
      A.last.finished = true; A.last.ok = !!env.ok; A.last.ms = new Date().getTime() - A.last.started;
      A.last.created = made; if (A.created.length > made.length) A.last.created_total = A.created.length;
      if (!env.ok) A.last.error = env.error;
      A.last.doc = docName();
    }
    env.doc = docName();
    if (A.warnings.length) env.warnings = A.warnings;
    var out;
    try { out = A.json(env); } catch (e) { out = A.json({ ok: false, error: 'Could not serialise the result: ' + e.message, doc: env.doc }); }
    return '\u0001' + out;
  };

  // -- batch: many steps in one call ----------------------------------------------
  function merged(base, over) {
    var o = {}, k;
    for (k in base) if (base.hasOwnProperty(k)) o[k] = base[k];
    if (over) for (k in over) if (over.hasOwnProperty(k)) o[k] = over[k];
    return o;
  }
  A.merge = merged;
  A.rollback = function () {
    var n = 0;
    for (var i = A.created.length - 1; i >= 0; i--) { try { A.created[i].remove(); n++; } catch (e) {} }
    A.created = [];
    return n;
  };
  A.cmd.batch = function (a) {
    var steps = a.steps || [], out = [], failed = -1, base = A.S, i;
    A.steps = [];
    for (i = 0; i < steps.length; i++) {
      var s = steps[i];
      try {
        if (s.cmd === 'batch') throw new Error('A batch cannot contain another batch.');
        var c = A.cmd[s.cmd];
        if (!c) throw new Error('Unknown runtime command "' + s.cmd + '".');
        A.S = merged(base, s.settings);
        A.lastList = null;
        var d = c(s.args || {});
        if (d === undefined) d = null;
        // "@n" sees every item of a long result (A.outList lists only the first 100 in d)
        var full = A.lastList;
        A.steps.push(full && d && d.count === full.length && d.more ? { items: full } : d);
        out.push({ ok: true, data: d });
      } catch (e) {
        var info = A.errorInfo(e, s.cmd === 'script');
        info.ok = false;
        out.push(info);
        A.steps.push(null);
        if (failed < 0) failed = i;
      }
      A.S = base;
      if (failed >= 0 && a.stop_on_error !== false) break;
    }
    var res = { total: steps.length, completed: out.length, results: out };
    if (failed >= 0) {
      res.failed_step = failed;
      if (a.rollback) { res.rolled_back = A.rollback(); A.closeEmptyNew(); }
    }
    return res;
  };

  // -- reading items ------------------------------------------------------------------
  var TYPES = { path: 'PathItem', text: 'TextFrame', group: 'GroupItem', compound: 'CompoundPathItem', raster: 'RasterItem',
    placed: 'PlacedItem', symbol: 'SymbolItem', plugin: 'PluginItem', mesh: 'MeshItem', graph: 'GraphItem', legacy: 'LegacyTextItem' };
  A.typeName = function (t) {
    if (TYPES.hasOwnProperty(t)) return TYPES[t];
    for (var k in TYPES) if (TYPES.hasOwnProperty(k) && TYPES[k] === t) return t;
    throw new Error('Unknown item type "' + t + '". Use path, text, group, compound, raster, placed, symbol, plugin, mesh or graph.');
  };
  A.kindOf = function (typename) { return typename === 'TextFrame' ? 'text' : (typename === 'CompoundPathItem' ? 'compound' : typename.replace('Item', '').toLowerCase()); };
  A.layerOf = function (it) {
    var p = it;
    for (var n = 0; n < 50 && p; n++) { if (p.typename === 'Layer') return p; p = p.parent; }
    return null;
  };
  // the path whose paint represents an item (compound paths are painted through their sub-paths)
  function paintSource(it) {
    if (it.typename === 'PathItem') return it;
    if (it.typename === 'CompoundPathItem' && it.pathItems.length) return it.pathItems[0];
    return null;
  }
  function firstRun(it) {
    try { return it.textRanges.length ? it.textRanges[0].characterAttributes : it.textRange.characterAttributes; } catch (e) { return null; }
  }
  A.fillOf = function (it) {
    var p = paintSource(it);
    if (p) return p.filled ? A.colorStr(p.fillColor) : 'none';
    if (it.typename === 'TextFrame') { var ca = firstRun(it); return ca ? A.colorStr(ca.fillColor) : null; }
    return null;
  };
  A.strokeOf = function (it) {
    var p = paintSource(it);
    if (p) return p.stroked ? A.colorStr(p.strokeColor) : 'none';
    if (it.typename === 'TextFrame') { var ca = firstRun(it); try { return ca ? A.colorStr(ca.strokeColor) : null; } catch (e) { return null; } }
    return null;
  };
  A.abOf = function (it, doc) {
    doc = doc || A.doc();
    var b = A.vb(it);
    for (var i = 0; i < doc.artboards.length; i++) if (A.intersects(b, doc.artboards[i].artboardRect)) return i;
    return null;
  };
  var FIELDS = ['uuid', 'type', 'name', 'box', 'layer', 'parent', 'text', 'font', 'size', 'fill', 'stroke', 'sw', 'opacity', 'hidden', 'locked', 'selected', 'artboard'];
  A.describe = function (it, fields) {
    var o = {}, f, i, t = it.typename;
    for (i = 0; i < fields.length; i++) {
      f = fields[i];
      try {
        if (f === 'uuid') o.uuid = it.uuid;
        else if (f === 'type') o.type = A.kindOf(t);
        else if (f === 'name') { if (it.name) o.name = it.name; }
        else if (f === 'box') o.box = A.box(it);
        else if (f === 'layer') { var L = A.layerOf(it); o.layer = L ? L.name : null; }
        else if (f === 'parent') { var p = it.parent; o.parent = p.typename === 'Layer' ? 'layer:' + p.name : (p.name ? p.name + ' ' : '') + '[' + A.kindOf(p.typename) + ' ' + p.uuid + ']'; }
        else if (f === 'text') { if (t === 'TextFrame') o.text = it.contents.length > 80 ? it.contents.slice(0, 80) + '...' : it.contents; }
        else if (f === 'font') { if (t === 'TextFrame') { var ca = firstRun(it); if (ca) o.font = ca.textFont.name; } }
        else if (f === 'size') { if (t === 'TextFrame') { var cs = firstRun(it); if (cs) o.size = cs.size; } }
        else if (f === 'fill') { var fl = A.fillOf(it); if (fl !== null) o.fill = fl; }
        else if (f === 'stroke') { var st = A.strokeOf(it); if (st !== null) o.stroke = st; }
        else if (f === 'sw') { var ps = paintSource(it); if (ps && ps.stroked) o.sw = ps.strokeWidth; }
        else if (f === 'opacity') { if (it.opacity !== 100) o.opacity = it.opacity; }
        else if (f === 'hidden') { if (it.hidden) o.hidden = true; }
        else if (f === 'locked') { if (it.locked) o.locked = true; }
        else if (f === 'selected') { if (it.selected) o.selected = true; }
        else if (f === 'artboard') o.artboard = A.abOf(it);
        else throw new Error('Unknown field "' + f + '". Fields: ' + FIELDS.join(', ') + '.');
      } catch (e) { if (/^Unknown field/.test(e.message)) throw e; }
    }
    return o;
  };
  function lower(s) { return String(s).toLowerCase(); }
  function asList(v) { return v instanceof Array ? v : [v]; }

  // find_items: one walk over the document (or the "in" container / layer) with filters
  A.cmd.find_items = function (a) {
    var doc = A.doc(), i, k;
    var types = null, fields = a.fields || ['uuid', 'type', 'name', 'box'];
    if (a.type) { types = []; var tl = asList(a.type); for (i = 0; i < tl.length; i++) types.push(A.typeName(tl[i])); }
    var fill = a.fill ? A.colorStr(A.color(a.fill)) : null, stroke = a.stroke ? A.colorStr(A.color(a.stroke)) : null;
    var within = a.within ? A.rectIn(a.within) : null;
    var abRect = (a.artboard !== undefined && a.artboard !== null) ? doc.artboards[a.artboard].artboardRect : null;
    var sizeMin = null, sizeMax = null;
    if (a.size !== undefined) { if (a.size instanceof Array) { sizeMin = a.size[0]; sizeMax = a.size[1]; } else { sizeMin = a.size - 0.01; sizeMax = a.size + 0.01; } }
    var text = a.text !== undefined ? lower(a.text) : null, font = a.font !== undefined ? lower(a.font) : null;
    var root = doc;
    if (a['in']) {
      root = String(a['in']).indexOf('layer:') === 0 ? A.layerByName(String(a['in']).slice(6)) : A.ref(a['in']);
      if (root.typename !== 'Layer' && root.typename !== 'GroupItem') throw new Error('"in" must be a layer or a group.');
    }
    if (a.layer) root = A.layerByName(a.layer); // includes its sublayers
    var limit = a.limit === undefined ? 50 : a.limit, offset = a.offset || 0;
    var total = 0, items = [], byType = {};
    A.walk(function (it) {
      var t = it.typename;
      if (!match(it, t)) return;
      total++;
      byType[A.kindOf(t)] = (byType[A.kindOf(t)] || 0) + 1;
      if (!a.count_only && total > offset && items.length < limit) items.push(A.describe(it, fields));
    }, root);
    function match(it, t) {
      if (types && !has(types, t)) return false;
      if (a.top_level && it.parent.typename !== 'Layer') return false;
      if (a.name !== undefined && !A.glob(a.name, it.name)) return false;
      if (a.hidden !== undefined && !!it.hidden !== a.hidden) return false;
      if (a.locked !== undefined && !!it.locked !== a.locked) return false;
      if (a.selected !== undefined && !!it.selected !== a.selected) return false;
      if (a.guides !== undefined) { var gd = false; try { gd = t === 'PathItem' && it.guides; } catch (e) {} if (gd !== a.guides) return false; }
      if (text !== null && (t !== 'TextFrame' || lower(it.contents).indexOf(text) < 0)) return false;
      if (font !== null || sizeMin !== null) {
        if (t !== 'TextFrame') return false;
        var ca = firstRun(it);
        if (!ca) return false;
        if (font !== null && lower(ca.textFont.name).indexOf(font) < 0 && lower(ca.textFont.family + ' ' + ca.textFont.style).indexOf(font) < 0) return false;
        if (sizeMin !== null && (ca.size < sizeMin || ca.size > sizeMax)) return false;
      }
      if (fill !== null && A.fillOf(it) !== fill) return false;
      if (stroke !== null && A.strokeOf(it) !== stroke) return false;
      if (within || abRect) {
        var b = A.vb(it);
        if (within && !A.intersects(b, within)) return false;
        if (abRect && !A.intersects(b, abRect)) return false;
      }
      return true;
    }
    var out = { total: total, by_type: byType };
    if (!a.count_only) {
      out.items = items;
      if (offset + items.length < total) out.more = 'showing ' + (offset + 1) + '-' + (offset + items.length) + ' of ' + total + ': use offset/limit';
    }
    return out;
  };

  // get_items: full detail by refs
  var JUST_OUT = {};
  function justName(j) {
    if (!JUST_OUT.ok) { JUST_OUT.ok = true; var names = ['LEFT', 'CENTER', 'RIGHT', 'FULLJUSTIFYLASTLINELEFT', 'FULLJUSTIFYLASTLINECENTER', 'FULLJUSTIFYLASTLINERIGHT', 'FULLJUSTIFY'];
      for (var i = 0; i < names.length; i++) { try { JUST_OUT[String(Justification[names[i]])] = names[i].toLowerCase(); } catch (e) {} } }
    return JUST_OUT[String(j)] || String(j);
  }
  function pt2(p) { var q = A.fromDoc(p[0], p[1]); return q; }
  function same(a, b) { return Math.abs(a[0] - b[0]) < 0.001 && Math.abs(a[1] - b[1]) < 0.001; }
  function pathDetail(o, p, withPoints) {
    o.closed = p.closed;
    o.points = p.pathPoints.length;
    try { o.area = r2(Math.abs(p.area) / (A.unit() * A.unit())); } catch (e) {}
    if (p.clipping) o.clipping = true;
    o.fill = p.filled ? A.colorStr(p.fillColor) : 'none';
    o.stroke = p.stroked ? A.colorStr(p.strokeColor) : 'none';
    if (p.stroked) {
      o.sw = p.strokeWidth;
      try { if (p.strokeDashes && p.strokeDashes.length) o.dash = p.strokeDashes; } catch (e) {}
      try { o.cap = { BUTTENDCAP: 'butt', ROUNDENDCAP: 'round', PROJECTINGENDCAP: 'square' }[String(p.strokeCap).replace('StrokeCap.', '')]; } catch (e) {}
      try { o.join = String(p.strokeJoin).replace('StrokeJoin.', '').replace('ENDJOIN', '').toLowerCase(); } catch (e) {}
    }
    if (withPoints) {
      var pts = [], n = Math.min(p.pathPoints.length, 500);
      for (var i = 0; i < n; i++) {
        var pp = p.pathPoints[i], an = pt2(pp.anchor);
        if (same(pp.anchor, pp.leftDirection) && same(pp.anchor, pp.rightDirection)) pts.push(an);
        else pts.push({ a: an, 'in': pt2(pp.leftDirection), out: pt2(pp.rightDirection) });
      }
      o.path = pts;
      if (p.pathPoints.length > n) o.path_truncated = p.pathPoints.length - n;
    }
  }
  function textDetail(o, tf, a) {
    o.kind = String(tf.kind).replace('TextType.', '').replace('TEXT', '').toLowerCase();
    var c = tf.contents;
    o.contents = c.length > 2000 ? c.slice(0, 2000) + '...' : c;
    if (c.length > 2000) o.length = c.length;
    if (tf.kind === TextType.POINTTEXT) { try { o.anchor = pt2(tf.anchor); } catch (e) {} }
    try { o.lines = tf.lines.length; } catch (e) {}
    try {
      var para = tf.paragraphs.length ? tf.paragraphs[0] : tf.textRange;
      o.align = justName(para.paragraphAttributes.justification);
      try { var pst = para.paragraphStyles; if (pst.length) o.paragraph_style = pst[0].name; } catch (e) {}
    } catch (e) {}
    if (a.runs !== false) {
      // textRanges holds one range per character: merge neighbours with equal attributes into runs
      var runs = [], tr = tf.textRanges, n = Math.min(tr.length, 500);
      for (var i = 0; i < n; i++) {
        var r = tr[i], ca = r.characterAttributes, run = { text: r.contents };
        try { run.font = ca.textFont.name; } catch (e) {}
        try { run.size = ca.size; } catch (e) {}
        try { run.fill = A.colorStr(ca.fillColor); } catch (e) {}
        try { if (!ca.autoLeading) run.leading = ca.leading; } catch (e) {}
        try { if (ca.tracking) run.tracking = ca.tracking; } catch (e) {}
        var prev = runs.length ? runs[runs.length - 1] : null;
        if (prev && prev.font === run.font && prev.size === run.size && prev.fill === run.fill && prev.leading === run.leading && prev.tracking === run.tracking) prev.text += run.text;
        else runs.push(run);
      }
      for (i = 0; i < runs.length; i++) if (runs[i].text.length > 60) runs[i].text = runs[i].text.slice(0, 60) + '...';
      o.runs = runs;
      if (tr.length > n) o.runs_truncated = tr.length - n;
    }
  }
  A.detail = function (it, a) {
    a = a || {};
    var t = it.typename, o = A.describe(it, ['uuid', 'type', 'name', 'box', 'layer', 'parent', 'opacity', 'hidden', 'locked', 'selected']);
    try { o.geo = A.rectOut(A.gb(it)); } catch (e) {}
    try { var bm = String(it.blendingMode).replace('BlendModes.', '').toLowerCase(); if (bm !== 'normal') o.blend = bm; } catch (e) {}
    try { if (it.note) o.note = it.note; } catch (e) {}
    if (t === 'PathItem') pathDetail(o, it, a.points);
    else if (t === 'CompoundPathItem') {
      o.paths = it.pathItems.length;
      if (it.pathItems.length) { var sub = {}; pathDetail(sub, it.pathItems[0], false); o.fill = sub.fill; o.stroke = sub.stroke; if (sub.sw) o.sw = sub.sw; }
    } else if (t === 'TextFrame') textDetail(o, it, a);
    else if (t === 'GroupItem') { o.items = it.pageItems.length; if (it.clipped) o.clipped = true; }
    else if (t === 'PlacedItem') { try { o.file = it.file.fsName; } catch (e) { o.file = null; o.missing_link = true; } }
    else if (t === 'RasterItem') { try { o.embedded = it.embedded; } catch (e) {} try { o.file = it.file.fsName; } catch (e) {} }
    else if (t === 'SymbolItem') { try { o.symbol = it.symbol.name; } catch (e) {} }
    return o;
  };
  A.cmd.get_items = function (a) {
    var items = A.refs(a.refs), lim = a.limit || 100, out = [];
    for (var i = 0; i < items.length && i < lim; i++) out.push(A.detail(items[i], a));
    var res = { count: items.length, items: out };
    if (items.length > lim) res.more = (items.length - lim) + ' more: narrow the refs or raise limit';
    return res;
  };

  // get_tree: layers -> sublayers / groups -> items
  function treeNode(it, depth, a) {
    var t = it.typename, n = { type: A.kindOf(t), uuid: it.uuid };
    if (it.name) n.name = it.name;
    if (t === 'TextFrame') n.text = it.contents.length > 30 ? it.contents.slice(0, 30) + '...' : it.contents;
    if (a.boxes) n.box = A.box(it);
    if (it.hidden) n.hidden = true;
    if (t === 'GroupItem') {
      if (it.clipped) n.clipped = true;
      var kids = [];
      var gp = it.pageItems, gn = gp.length; // a group's pageItems are its direct children
      for (var i = 0; i < gn; i++) kids.push(gp[i]);
      n.count = kids.length;
      if (depth > 0) n.children = treeList(kids, depth - 1, a);
    }
    if (t === 'CompoundPathItem') n.count = it.pathItems.length;
    return n;
  }
  // a.budget = nodes left in the whole answer (max_nodes): keeps big documents from flooding the agent
  function treeList(kids, depth, a) {
    var out = [], lim = a.limit || 50, i;
    for (i = 0; i < kids.length && i < lim && a.budget > 0; i++) { a.budget--; out.push(treeNode(kids[i], depth, a)); }
    if (i < kids.length) { out.push({ more: kids.length - i }); a.cut = true; }
    return out;
  }
  function layerNode(L, depth, a) {
    var n = { layer: L.name }, kids = [], i;
    if (!L.visible) n.hidden = true;
    if (!L.printable) n.printable = false;
    if (L.locked) n.locked = true;
    var lp = L.pageItems, ln = lp.length;
    for (i = 0; i < ln; i++) kids.push(lp[i]);
    n.count = kids.length;
    if (L.layers.length) {
      n.sublayers = [];
      for (i = 0; i < L.layers.length; i++) n.sublayers.push(depth > 0 ? layerNode(L.layers[i], depth - 1, a) : { layer: L.layers[i].name });
    }
    if (depth > 0) n.children = treeList(kids, depth - 1, a);
    return n;
  }
  A.cmd.get_tree = function (a) {
    var doc = A.doc(), depth = a.depth === undefined ? 2 : a.depth, out = [], i;
    a.budget = a.max_nodes || 300; a.cut = false;
    if (a.root) {
      if (String(a.root).indexOf('layer:') === 0) out.push(layerNode(A.layerByName(String(a.root).slice(6)), depth, a));
      else out.push(treeNode(A.ref(a.root), depth, a));
    } else for (i = 0; i < doc.layers.length; i++) out.push(layerNode(doc.layers[i], depth, a));
    var res = { tree: out };
    if (a.cut) res.note = 'Partial outline (limit ' + (a.limit || 50) + ' per container, max_nodes ' + (a.max_nodes || 300) + '): use root, depth or find_items to look deeper.';
    return res;
  };

  // selection
  A.cmd.selection = function (a) {
    var doc = A.doc(), act = a.action || 'get', i, items, skipped = 0;
    function selectAll(list) {
      for (var j = 0; j < list.length; j++) {
        try { if (list[j].locked || list[j].hidden) { skipped++; continue; } list[j].selected = true; } catch (e) { skipped++; }
      }
    }
    if (act === 'clear' || act === 'set') doc.selection = null;
    if (act === 'set' || act === 'add') selectAll(A.refs(a.refs));
    else if (act === 'remove') { items = A.refs(a.refs); for (i = 0; i < items.length; i++) { try { items[i].selected = false; } catch (e) {} } }
    else if (act === 'all') {
      doc.selection = null;
      if (a.layer) items = A.refs('layer:' + a.layer);
      else if (a.artboard !== undefined && a.artboard !== null) items = A.refs('artboard:' + a.artboard);
      else items = A.topLevel(doc);
      selectAll(items);
    } else if (act !== 'get' && act !== 'clear') throw new Error('Unknown selection action "' + act + '". Use get, set, add, remove, clear or all.');
    if (skipped) A.warn(skipped + ' locked or hidden item(s) were not selected.');
    var sel = doc.selection;
    if (sel && !(sel instanceof Array)) return { count: 0, text_selection: true, note: 'Text is selected inside a text frame.' };
    var lim = a.limit || 50, fields = a.fields || ['uuid', 'type', 'name', 'box'], out = [];
    sel = sel || [];
    for (i = 0; i < sel.length && i < lim; i++) out.push(A.describe(sel[i], fields));
    var res = { count: sel.length, items: out };
    if (sel.length > lim) res.more = (sel.length - lim) + ' more';
    return res;
  };

  // -- documents ------------------------------------------------------------------
  A.docByName = function (name) {
    if (name === undefined || name === null) return A.doc();
    for (var i = 0; i < app.documents.length; i++) if (app.documents[i].name === name) return app.documents[i];
    throw new Error('No open document named "' + name + '". Open documents: ' + A.json(A.docNames()) + '.');
  };
  A.docNames = function () { var o = []; for (var i = 0; i < app.documents.length; i++) o.push(app.documents[i].name); return o; };
  // Run fn with some settings changed (restored afterwards).
  A.withSettings = function (over, fn) {
    var keep = A.S;
    A.S = A.merge(keep, over);
    try { return fn(); } finally { A.S = keep; }
  };
  // Run fn with coordinates from the top-left of artboard k (multi-artboard builders).
  A.at = function (k, fn) { return A.withSettings({ artboard: k, origin: 'artboard' }, fn); };
  // Artboard rects always use artboard 0 as the frame (the active artboard moves around), unless the session
  // pins another reference artboard or uses document coordinates.
  A.boardFrame = function (fn) {
    if (A.S.origin === 'document' || (A.S.artboard !== null && A.S.artboard !== undefined)) return fn();
    return A.withSettings({ artboard: 0 }, fn);
  };
  A.artboardsOut = function (doc) {
    return A.boardFrame(function () {
      var o = [];
      for (var i = 0; i < doc.artboards.length; i++) o.push({ i: i, name: doc.artboards[i].name, rect: A.rectOut(doc.artboards[i].artboardRect) });
      return o;
    });
  };
  function startupPreset() {
    var l = app.startupPresetsList, i;
    // localised names: "Print" (en), "\u041f\u0435\u0447\u0430\u0442\u044c" (ru), ...
    for (i = 0; i < l.length; i++) if (/^(Print|Impression|Drucken|Imprimir|Stampa|Afdrukken)$/.test(l[i]) || l[i] === '\u041f\u0435\u0447\u0430\u0442\u044c') return l[i];
    return l[0];
  }
  var DOC = {};
  DOC.list = function () { return A.docList(); };
  // New document via DocumentPreset (never touches rulerOrigin, quirk B11). Sizes in session units.
  DOC['new'] = function (a) {
    if (!(a.width > 0) || !(a.height > 0)) throw new Error('documents new needs width and height (> 0).');
    var p = new DocumentPreset(), n = a.artboards || 1;
    p.width = A.u(a.width); p.height = A.u(a.height);
    p.colorMode = a.color === 'rgb' ? DocumentColorSpace.RGB : DocumentColorSpace.CMYK;
    p.numArtboards = n;
    p.units = { mm: RulerUnits.Millimeters, 'in': RulerUnits.Inches, px: RulerUnits.Pixels }[A.S.units] || RulerUnits.Points;
    if (a.title) p.title = a.title;
    // The property is documentBleedOffset = [left, top, right, bottom] (pt). A misspelt property such as
    // "documentBleedOffsetRect" is silently accepted and ignored (quirk C18).
    var bl = null;
    if (a.bleed) {
      bl = a.bleed instanceof Array ? [A.u(a.bleed[0]), A.u(a.bleed[1]), A.u(a.bleed[2]), A.u(a.bleed[3])] : [A.u(a.bleed), A.u(a.bleed), A.u(a.bleed), A.u(a.bleed)];
      p.documentBleedLink = bl[0] === bl[1] && bl[1] === bl[2] && bl[2] === bl[3];
      p.documentBleedOffset = bl;
    }
    if (n > 1) {
      p.artboardLayout = DocumentArtboardLayout.GridByRow;
      p.artboardRowsOrCols = a.columns || Math.min(n, 4);
      // spacing = gap between the trim edges; Illustrator adds both bleeds to artboardSpacing (quirk C23)
      var gap = A.u(a.spacing === undefined ? 20 / A.unit() : a.spacing);
      p.artboardSpacing = bl ? Math.max(0, gap - Math.max(bl[0] + bl[2], bl[1] + bl[3])) : gap;
    }
    if (a.color !== 'rgb') p.rasterResolution = DocumentRasterResolution.HighResolution;
    var d = app.documents.addDocument(startupPreset(), p);
    var names = a.artboard_names || [];
    for (var i = 0; i < d.artboards.length && i < names.length; i++) if (names[i]) d.artboards[i].name = names[i];
    d.artboards.setActiveArtboardIndex(0);
    // the API can't read the bleed back (A6/B4): keep it in the document's XMP as well
    if (!bl) bl = [0, 0, 0, 0];
    if (A.metaSet) { try { A.metaSet('bleed', { left: bl[0], top: bl[1], right: bl[2], bottom: bl[3] }, d); } catch (e) { A.warn('Could not store the bleed in XMP: ' + e.message); } }
    return { name: d.name, colorSpace: d.documentColorSpace === DocumentColorSpace.CMYK ? 'CMYK' : 'RGB', artboards: A.artboardsOut(d), bleed: a.bleed || 0 };
  };
  DOC.open = function (a) {
    var f = new File(a.path);
    if (!f.exists) throw new Error('File not found: ' + a.path);
    for (var i = 0; i < app.documents.length; i++) {
      var d0 = app.documents[i];
      try { if (String(d0.path) !== '' && d0.fullName.fsName === f.fsName) { d0.activate(); return { name: d0.name, already_open: true }; } } catch (e) {}
    }
    var d = app.open(f);
    return { name: d.name, artboards: A.artboardsOut(d) };
  };
  DOC.activate = function (a) { var d = A.docByName(a.name); d.activate(); return { active: d.name }; };
  DOC.save = function (a) {
    var d = A.docByName(a.name), before = d.name;
    if (!a.path) {
      if (String(d.path) === '') throw new Error('Document ' + d.name + ' was never saved: give a path (.ai, .pdf or .eps).');
      d.save();
      return { name: d.name, path: d.fullName.fsName };
    }
    var f = new File(a.path), fmt = a.format, o;
    if (fmt === 'svg') {
      o = new ExportOptionsSVG(); o.embedRasterImages = true; o.fontType = SVGFontType.OUTLINEFONT;
      d.exportFile(f, ExportType.SVG, o);
      // Illustrator 29 rebinds the document to the exported SVG (quirk C6): a later plain save would write SVG.
      return { name: d.name, renamed_from: before !== d.name ? before : undefined, path: f.fsName,
        note: 'Illustrator now treats the SVG as this document\'s file: save as .ai to keep an editable original.' };
    }
    if (fmt === 'pdf') {
      o = new PDFSaveOptions();
      if (a.pdf_preset) o.pDFPreset = a.pdf_preset;
      o.preserveEditability = a.editable !== false;
      d.saveAs(f, o);
    } else if (fmt === 'eps') {
      d.saveAs(f, new EPSSaveOptions());
    } else {
      o = new IllustratorSaveOptions(); o.pdfCompatible = true;
      d.saveAs(f, o);
    }
    return { name: d.name, renamed_from: before !== d.name ? before : undefined, path: d.fullName.fsName };
  };
  DOC.close = function (a) {
    var d = A.docByName(a.name);
    if (!d.saved && !a.save && !a.discard) throw new Error('Document ' + d.name + ' has unsaved changes: pass save:true or discard:true.');
    if (a.save && String(d.path) === '') throw new Error('Document ' + d.name + ' was never saved: save it with a path first, or pass discard:true.');
    var n = d.name;
    d.close(a.save ? SaveOptions.SAVECHANGES : SaveOptions.DONOTSAVECHANGES);
    return { closed: n, open: A.docNames() };
  };
  A.cmd.documents = function (a) {
    var f = DOC[a.action];
    if (!f) throw new Error('Unknown documents action "' + a.action + '".');
    return f(a);
  };

  // -- document_info: compact summary + preflight-lite --------------------------
  A.cmd.document_info = function (a) {
    var doc = A.docByName(a.doc), prev = null;
    if (doc !== app.activeDocument) { prev = app.activeDocument; doc.activate(); }
    try { return docInfo(doc, a); } finally { if (prev) prev.activate(); }
  };
  function docInfo(doc, a) {
    var i, j, out = {};
    out.name = doc.name;
    try { out.path = String(doc.path) !== '' ? doc.fullName.fsName : null; } catch (e) { out.path = null; }
    out.colorSpace = doc.documentColorSpace === DocumentColorSpace.CMYK ? 'CMYK' : 'RGB';
    out.saved = doc.saved;
    out.units = A.S.units;
    // bleed (pt): recorded by documents new (XMP); otherwise the server reads it from the saved .ai file
    var mb = A.metaGet ? A.metaGet('bleed', doc) : null;
    out.bleed = mb ? { left: A.toU(mb.left), top: A.toU(mb.top), right: A.toU(mb.right), bottom: A.toU(mb.bottom), source: 'xmp' } : null;
    out.activeArtboard = doc.artboards.getActiveArtboardIndex();
    out.artboards = A.artboardsOut(doc);
    out.layers = [];
    for (i = 0; i < doc.layers.length; i++) {
      var L = doc.layers[i], all = 0;
      A.walk(function () { all++; }, L);
      var lo = { name: L.name, items: L.pageItems.length, all: all };
      if (!L.visible) lo.visible = false;
      if (!L.printable) lo.printable = false;
      if (L.locked) lo.locked = true;
      if (L.layers.length) lo.sublayers = L.layers.length;
      out.layers.push(lo);
    }
    // one walk for counts, fonts and checks (indexing doc.pageItems/textFrames is slow on big documents)
    var c = { all: 0 }, fonts = {}, rgb = 0, emptyText = 0, unnamed = 0, overset = 0, emptyGroups = 0, unstyled = 0, checks = a.checks !== false;
    // paragraph style 0 is the document's default ([Normal Paragraph Style], localised): text left on it is "unstyled"
    var defStyle = doc.paragraphStyles.length ? doc.paragraphStyles[0].name : null, hasStyles = doc.paragraphStyles.length > 1;
    function rgbPaint(p) {
      try {
        if (p.filled && p.fillColor.typename === 'RGBColor') rgb++;
        if (p.stroked && p.strokeColor.typename === 'RGBColor') rgb++;
      } catch (e) {}
    }
    A.walk(function (it) {
      var t = it.typename, k = A.kindOf(t);
      c.all++;
      c[k] = (c[k] || 0) + 1;
      if (t === 'TextFrame') {
        if (!it.contents.length) emptyText++;
        // only text with no name and no named group around it is hard to find again
        if (!it.name) { try { if (!(it.parent.typename === 'GroupItem' && it.parent.name)) unnamed++; } catch (e) { unnamed++; } }
        if (A.overset && A.overset(it)) overset++;
        try {
          // textRanges holds one range per character (C12): count each font once per frame
          var runs = it.textRanges, rn = Math.min(runs.length, 50), seen = {};
          for (var j = 0; j < rn; j++) {
            var ca = runs[j].characterAttributes, fn = ca.textFont.name;
            if (!seen[fn]) { seen[fn] = true; fonts[fn] = (fonts[fn] || 0) + 1; }
            if (checks && ca.fillColor.typename === 'RGBColor') rgb++;
          }
        } catch (e) {}
        if (hasStyles && it.contents.length) { try { var pst = it.paragraphs[0].paragraphStyles; if (!pst.length || pst[0].name === defStyle) unstyled++; } catch (e) {} }
      } else if (checks) {
        if (t === 'PathItem') rgbPaint(it);
        else if (t === 'CompoundPathItem') { var cp = it.pathItems, cn = cp.length; for (var q = 0; q < cn; q++) rgbPaint(cp[q]); }
        else if (t === 'GroupItem' && !it.pageItems.length) emptyGroups++;
      }
    });
    out.counts = c;
    var sw = [], spots = [];
    for (i = 0; i < doc.spots.length; i++) {
      try {
        var sp = doc.spots[i];
        if (sp.colorType === ColorModel.REGISTRATION) continue; // matched by type, never by (localised) name (B5)
        if (sp.colorType === ColorModel.SPOT) spots.push(sp.name); else sw.push(sp.name + ' = ' + A.colorStr(sp.color));
      } catch (e) {}
    }
    out.globalSwatches = sw;
    out.spotColors = spots;
    out.swatchCount = doc.swatches.length;
    var ps = [], cs = [];
    for (i = 0; i < doc.paragraphStyles.length; i++) ps.push(doc.paragraphStyles[i].name);
    for (i = 0; i < doc.characterStyles.length; i++) cs.push(doc.characterStyles[i].name);
    out.paragraphStyles = ps;
    out.characterStyles = cs;
    out.fonts = fonts;
    if (checks) {
      var issues = {};
      if (out.colorSpace === 'CMYK' && rgb) issues.rgbInCmyk = rgb;
      if (emptyText) issues.emptyText = emptyText;
      if (emptyGroups) issues.emptyGroups = emptyGroups;
      if (unnamed) issues.unnamedText = unnamed;
      if (overset) issues.oversetText = overset;
      if (unstyled) issues.unstyledText = unstyled;
      out.issues = issues;
    }
    try { var sel = doc.selection; out.selection = sel instanceof Array ? sel.length : (sel ? 1 : 0); } catch (e) {}
    return out;
  }

  // -- preview: PNG of an artboard, items or a region ----------------------------------
  // doc.imageCapture renders any rectangle (also off the artboard) without switching the active artboard.
  // Fallback for artboards: exportFile(PNG24) with artboard clipping. The document's saved flag is restored.
  // items_at (0.4 visual diff): for each document rect [l, t, r, b], the leaf items that lie mostly inside it (by the
  // share of the item's visible area inside the rect, so a page background doesn't win every region)
  A.cmd.items_at = function (a) {
    var leaves = [], out = [], i, j;
    A.walk(function (it) {
      if (it.typename === 'GroupItem') return;
      try { if (it.hidden) return; leaves.push({ it: it, b: A.vb(it) }); } catch (e) {}
    });
    for (i = 0; i < a.rects.length; i++) {
      var r = a.rects[i], hits = [];
      for (j = 0; j < leaves.length; j++) {
        var b = leaves[j].b, ow = Math.min(b[2], r[2]) - Math.max(b[0], r[0]), oh = Math.min(b[1], r[1]) - Math.max(b[3], r[3]);
        if (ow <= 0 || oh <= 0) continue;
        var area = Math.max(1e-6, (b[2] - b[0]) * (b[1] - b[3]));
        hits.push({ it: leaves[j].it, share: ow * oh / area });
      }
      hits.sort(function (p, q) { return q.share - p.share; });
      var list = [];
      for (j = 0; j < hits.length && list.length < 3; j++) {
        if (j > 0 && hits[j].share < 0.25) break;
        var it = hits[j].it, o = { uuid: it.uuid, type: A.kindOf(it.typename) };
        if (it.name) o.name = it.name;
        if (it.typename === 'TextFrame') { var c = it.contents; o.text = c.length > 40 ? c.slice(0, 40) + '...' : c; }
        list.push(o);
      }
      out.push(list);
    }
    return out;
  };
  A.cmd.preview = function (a) {
    var doc = A.doc(), wasSaved = doc.saved, bounds, what, i;
    // a region is measured from the given artboard (else the session's reference artboard, usually the active one)
    var inFrame = function (fn) { return (a.region && a.artboard !== undefined && a.artboard !== null) ? A.at(a.artboard, fn) : fn(); };
    if (a.region) { bounds = inFrame(function () { return A.rectIn(a.region); }); what = 'region'; }
    else if (a.refs) {
      var items = A.refs(a.refs);
      if (!items.length) throw new Error('No items to preview for ' + A.json(a.refs) + '.');
      bounds = A.vb(items[0]).slice(0);
      for (i = 1; i < items.length; i++) {
        var vb = A.vb(items[i]);
        bounds = [Math.min(bounds[0], vb[0]), Math.max(bounds[1], vb[1]), Math.max(bounds[2], vb[2]), Math.min(bounds[3], vb[3])];
      }
      var pad = a.pad === undefined ? Math.max(4, 0.05 * Math.max(bounds[2] - bounds[0], bounds[1] - bounds[3])) : A.u(a.pad);
      bounds = [bounds[0] - pad, bounds[1] + pad, bounds[2] + pad, bounds[3] - pad];
      what = items.length + ' item(s)';
    } else {
      i = (a.artboard === undefined || a.artboard === null) ? doc.artboards.getActiveArtboardIndex() : a.artboard;
      if (i < 0 || i >= doc.artboards.length) throw new Error('Artboard ' + i + ' does not exist (document has ' + doc.artboards.length + ').');
      bounds = doc.artboards[i].artboardRect;
      what = 'artboard ' + i;
    }
    var w = bounds[2] - bounds[0], h = bounds[1] - bounds[3];
    if (!(w > 0) || !(h > 0)) throw new Error('Nothing to render: the area is empty.');
    var want = a.dpi ? a.dpi : (a.width ? 72 * a.width / w : 72 * (a.max_px || 1024) / Math.max(w, h)), res, method;
    var isAb = what.indexOf('artboard') === 0;
    function viaExport() {
      method = 'exportFile';
      res = Math.min(2400, Math.max(1, want));
      var prev = doc.artboards.getActiveArtboardIndex();
      doc.artboards.setActiveArtboardIndex(i);
      var x = new ExportOptionsPNG24();
      x.artBoardClipping = true; x.antiAliasing = true; x.transparency = a.background === 'transparent';
      x.horizontalScale = x.verticalScale = Math.min(776, Math.max(1, res / 72 * 100));
      try { doc.exportFile(new File(a.path), ExportType.PNG24, x); } finally { doc.artboards.setActiveArtboardIndex(prev); }
    }
    // imageCapture's minimum is 72 ppi: below that an artboard is exported at its scale; items/regions are
    // rendered at 72 ppi and downscaled by the server (resize_to).
    var hid = A.hideNonPrinting(doc);
    try {
      if (isAb && want < 72) viaExport();
      else {
        method = 'imageCapture';
        res = Math.min(2400, Math.max(72, want));
        try {
          var o = new ImageCaptureOptions();
          o.resolution = res; o.antiAliasing = true; o.transparency = a.background === 'transparent';
          doc.imageCapture(new File(a.path), bounds, o);
        } catch (e) { if (!isAb) throw e; viaExport(); }
      }
    } finally { A.restoreLayers(hid); }
    if (wasSaved) { try { doc.saved = true; } catch (e) {} }
    var out = { of: what, doc_bounds: bounds, rect: inFrame(function () { return A.rectOut(bounds); }), px: [Math.round(w * res / 72), Math.round(h * res / 72)], scale: r2(res / 72), method: method };
    if (res > want * 1.01) out.resize_to = Math.round(Math.max(w, h) * want / 72);
    return out;
  };
  // render_file (preview {image} for .pdf/.ai/.eps/.svg): one page (PDF) or artboard (others) of a file to PNG.
  // A file that is already open is rendered as it is and stays open; otherwise it is opened (alerts off), rendered
  // and closed without saving, and the document that was active before is active again.
  A.cmd.render_file = function (a) {
    var f = new File(a.path), page = a.page || 1, doc = null, opened = false, prev = null, i, lvl = null;
    if (!f.exists) throw new Error('File not found: ' + a.path);
    var isPdf = /\.pdf$/i.test(a.path);
    try { prev = app.activeDocument; } catch (e) {}
    for (i = 0; i < app.documents.length; i++) {
      try { if (String(app.documents[i].path) !== '' && app.documents[i].fullName.fsName === f.fsName) { doc = app.documents[i]; break; } } catch (e) {}
    }
    if (!doc) {
      try { lvl = app.userInteractionLevel; app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS; } catch (e) {}
      try {
        if (isPdf) { try { app.preferences.PDFFileOptions.pageToOpen = page; } catch (e) {} }
        doc = app.open(f);
        opened = true;
      } finally { try { if (lvl !== null) app.userInteractionLevel = lvl; } catch (e) {} }
    }
    try {
      var k = (opened && isPdf) ? 0 : page - 1;
      if (k < 0 || k >= doc.artboards.length) throw new Error('Page ' + page + ' does not exist (' + doc.artboards.length + ' artboard(s)).');
      var ab = doc.artboards[k].artboardRect, b = ab;
      if (a.region) {
        var r = a.region;
        b = [ab[0] + A.u(r[0]), ab[1] - A.u(r[1]), ab[0] + A.u(r[0] + r[2]), ab[1] - A.u(r[1] + r[3])];
      }
      var w = b[2] - b[0], h = b[1] - b[3];
      if (!(w > 0) || !(h > 0)) throw new Error('Nothing to render: the region is empty.');
      // enough pixels for max_px (also when zooming into a small region), within imageCapture's 72-2400 ppi
      var res = Math.min(2400, Math.max(72, 72 * (a.max_px || 1024) / Math.max(w, h)));
      var o = new ImageCaptureOptions();
      o.resolution = res; o.antiAliasing = true; o.transparency = false;
      doc.imageCapture(new File(a.out), b, o);
      return { page_size: [A.toU(ab[2] - ab[0]), A.toU(ab[1] - ab[3])], artboards: opened && isPdf ? undefined : doc.artboards.length,
        rect: [A.toU(b[0] - ab[0]), A.toU(ab[1] - b[1]), A.toU(w), A.toU(h)], k: res / 72 * A.unit(), already_open: opened ? undefined : true };
    } finally {
      if (opened) { try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (e) {} }
      if (prev) { try { if (app.activeDocument !== prev) prev.activate(); } catch (e) {} }
    }
  };

  return A;
})();
'ok';
