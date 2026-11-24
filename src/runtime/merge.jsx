// data_merge (0.3). ES3. A template (the top-level items on an artboard, or refs) is copied once per data row.
// Bindings in the template:
//   "{{field}}" inside any text -> replaced in place; each placeholder keeps the style of its first character
//   an item NAMED "{{field}}": text -> whole contents; linked image -> relinked (fit inside its old box, centred);
//     symbol instance -> that symbol; path / compound / group -> fill colour (empty value: unchanged)
//   an item NAMED "{{?field}}" -> shown only when the value is non-empty and not 0 / false / no / off
// Illustrator's own Variables / data sets were not used: they bind one item per variable and can't do placeholders
// inside running text or n-up sheets (docs/plan.md D12).
(function (A) {
  var PH = /\{\{\s*([^{}]+?)\s*\}\}/g, NAMED = /^\{\{\s*(\??)\s*([^{}]+?)\s*\}\}$/;

  function each(it, fn) {
    fn(it);
    if (it.typename === 'GroupItem') { var p = it.pageItems, n = p.length; for (var i = 0; i < n; i++) each(p[i], fn); }
  }
  function layerOf(it) { var p = it.parent; while (p && p.typename !== 'Layer') p = p.parent; return p; }
  function layerHidden(L) { while (L && L.typename === 'Layer') { if (!L.visible) return true; L = L.parent; } return false; }

  function templateItems(a, doc) {
    var out = [], i;
    if (a.template) { for (i = 0; i < a.template.length; i++) out.push(A.ref(String(a.template[i]))); return out; }
    if (a.refs !== undefined && a.refs !== null) return A.refs(a.refs);
    var r = doc.artboards[a.artboard].artboardRect, all = A.topLevel(doc);
    for (i = 0; i < all.length; i++) {
      try { if (!layerHidden(layerOf(all[i])) && A.intersects(A.vb(all[i]), r)) out.push(all[i]); } catch (e) {}
    }
    return out;
  }
  function boundKind(it) {
    var t = it.typename;
    if (t === 'TextFrame') return 'text';
    if (t === 'PlacedItem' || t === 'RasterItem') return 'image';
    if (t === 'SymbolItem') return 'symbol';
    return 'color';
  }
  function scan(items) {
    var f = {}, order = [], i, out = [];
    function add(name, kind) {
      if (!f.hasOwnProperty(name)) { f[name] = {}; order.push(name); }
      f[name][kind] = (f[name][kind] || 0) + 1;
    }
    for (i = 0; i < items.length; i++) {
      each(items[i], function (it) {
        var m = NAMED.exec(it.name || '');
        if (m) add(m[2], m[1] ? 'show' : boundKind(it));
        if (it.typename === 'TextFrame' && !(m && !m[1])) {
          var s = it.contents, mm;
          PH.lastIndex = 0;
          while ((mm = PH.exec(s))) add(mm[1], 'text');
        }
      });
    }
    for (i = 0; i < order.length; i++) {
      var kinds = [], k;
      for (k in f[order[i]]) if (f[order[i]].hasOwnProperty(k)) kinds.push(k);
      out.push({ field: order[i], as: kinds });
    }
    return out;
  }

  function truthy(v) { return !(v === undefined || v === null || /^\s*(0|false|no|off)?\s*$/i.test(String(v))); }
  function para(v) { return String(v).replace(/\r\n|\n/g, '\r'); }

  function fillText(tf, row, miss) {
    var s = tf.contents, hits = [], m, h;
    PH.lastIndex = 0;
    while ((m = PH.exec(s))) hits.push([m.index, m[0].length, m[1]]);
    // back to front, so earlier indexes stay valid
    for (h = hits.length - 1; h >= 0; h--) {
      var f = hits[h][2];
      if (!row.hasOwnProperty(f)) { miss[f] = true; continue; }
      var v = para(row[f]), ch = tf.characters, i = hits[h][0], k;
      for (k = i + hits[h][1] - 1; k > i; k--) ch[k].remove();
      if (v === '') ch[i].remove(); else ch[i].contents = v;
    }
  }
  function relink(it, v) {
    var file = new File(v);
    if (!file.exists) throw new Error('image not found: ' + v);
    var b = it.geometricBounds, w = b[2] - b[0], h = b[1] - b[3], cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    it.file = file;
    var nb = it.geometricBounds, nw = nb[2] - nb[0], nh = nb[1] - nb[3];
    if (nw > 0 && nh > 0 && w > 0 && h > 0) { var sc = Math.min(w / nw, h / nh) * 100; it.resize(sc, sc); }
    nb = it.geometricBounds;
    it.translate(cx - (nb[0] + nb[2]) / 2, cy - (nb[1] + nb[3]) / 2);
  }
  function bind(it, v, doc) {
    var t = it.typename;
    if (t === 'TextFrame') { it.contents = para(v); return; }
    if (t === 'PlacedItem') { if (v === '') it.hidden = true; else relink(it, v); return; }
    if (t === 'RasterItem') throw new Error('an embedded image can\'t be swapped: place the template image linked');
    if (t === 'SymbolItem') {
      if (v === '') { it.hidden = true; return; }
      try { it.symbol = doc.symbols.getByName(v); } catch (e) { throw new Error('no symbol named "' + v + '"'); }
      return;
    }
    if (v === '') return;
    var c = A.color(v), ps = A.paintables(it);
    for (var i = 0; i < ps.length; i++) {
      if (ps[i].typename === 'TextFrame') ps[i].textRange.characterAttributes.fillColor = c;
      else { ps[i].filled = true; ps[i].fillColor = c; }
    }
  }
  // fill one copied item tree with a row; problems are collected, not thrown (one bad image must not stop a run)
  function fillItem(root, row, miss, probs, n, doc) {
    var locked = [];
    each(root, function (it) { try { if (it.locked) { it.locked = false; locked.push(it); } } catch (e) {} });
    each(root, function (it) {
      var m = NAMED.exec(it.name || ''), f = m ? m[2] : null, whole = false;
      if (m) {
        if (!row.hasOwnProperty(f)) miss[f] = true;
        else {
          try {
            if (m[1]) it.hidden = !truthy(row[f]);
            else { bind(it, row[f], doc); whole = true; }
          } catch (e) { probs.push({ row: n, field: f, error: e.message }); }
          it.name = f;
        }
      }
      if (it.typename === 'TextFrame' && !whole) { try { fillText(it, row, miss); } catch (e) { probs.push({ row: n, error: 'text: ' + e.message }); } }
    });
    for (var i = 0; i < locked.length; i++) { try { locked[i].locked = true; } catch (e) {} }
  }
  // layers of the template that are locked: unlocked while copies are made and filled
  function unlockLayers(items) {
    var out = [], seen = {};
    for (var i = 0; i < items.length; i++) {
      var L = layerOf(items[i]);
      while (L && L.typename === 'Layer') {
        if (L.locked && !seen[L.absoluteZOrderPosition + ':' + L.name]) { seen[L.absoluteZOrderPosition + ':' + L.name] = true; L.locked = false; out.push(L); }
        L = L.parent;
      }
    }
    return out;
  }
  function relock(list) { for (var i = list.length - 1; i >= 0; i--) { try { list[i].locked = true; } catch (e) {} } }
  function keys(o) { var a = [], k; for (k in o) if (o.hasOwnProperty(k)) a.push(k); return a; }
  function uuids(items) { var o = []; for (var i = 0; i < items.length; i++) o.push(items[i].uuid); return o; }

  function clearTemp() {
    var t = A.mergeTemp, n = 0, i;
    if (!t) return 0;
    for (i = 0; i < t.copies.length; i++) { try { t.copies[i].remove(); n++; } catch (e) {} }
    for (i = 0; i < t.hidden.length; i++) { try { t.hidden[i].hidden = false; } catch (e) {} }
    relock(t.layers);
    A.mergeTemp = null;
    return n;
  }

  A.cmd.merge = function (a) {
    var doc = A.doc(), act = a.action, i, j;
    if (act === 'clear') return { removed: clearTemp() };
    if (A.mergeTemp) clearTemp(); // a files run that stopped half-way
    var tab = a.artboard || 0;
    if (tab >= doc.artboards.length) throw new Error('Artboard ' + tab + ' does not exist.');
    var items = templateItems(a, doc), tr = doc.artboards[tab].artboardRect;
    if (!items.length) throw new Error('The template is empty: no visible items on artboard ' + tab + (a.refs !== undefined ? ' / for refs' : '') + '.');
    if (act === 'scan') return { artboard: tab, items: items.length, template: uuids(items), fields: scan(items) };

    if (act === 'done') {
      // remove the template items and their artboard
      for (i = items.length - 1; i >= 0; i--) { try { items[i].locked = false; items[i].remove(); } catch (e) { A.warn('Could not remove a template item: ' + e.message); } }
      doc.artboards.remove(tab);
      return { removed_artboard: tab, artboards: doc.artboards.length };
    }

    var rows = a.rows || [], miss = {}, probs = [], layers = unlockLayers(items);
    try {
      if (act === 'fill_in_place') {
        // files mode: copies in place, originals hidden until "clear"
        var copies = [], hidden = [];
        for (i = 0; i < items.length; i++) {
          var d0 = items[i].duplicate();
          copies.push(d0);
          if (!items[i].hidden) {
            try { items[i].hidden = true; } catch (e) { var lk = items[i].locked; items[i].locked = false; items[i].hidden = true; items[i].locked = lk; }
            hidden.push(items[i]);
          }
        }
        A.mergeTemp = { copies: copies, hidden: hidden, layers: layers };
        layers = [];
        for (i = 0; i < copies.length; i++) fillItem(copies[i], rows[0], miss, probs, a.start + 1, doc);
        return { missing_fields: keys(miss), problems: probs };
      }
      if (act !== 'fill') throw new Error('Unknown merge action "' + act + '".');
      var W = tr[2] - tr[0], H = tr[1] - tr[3], sp = A.u(a.spacing === undefined ? 20 / A.unit() : a.spacing);
      var g = a.grid || { cols: 1, rows: 1, dx: 0, dy: 0 }, per = g.cols * g.rows, cols = a.columns || 1;
      var origin = a.origin;
      if (!origin) {
        var right = -1e9, top = -1e9;
        for (i = 0; i < doc.artboards.length; i++) { var r0 = doc.artboards[i].artboardRect; if (r0[2] > right) right = r0[2]; if (r0[1] > top) top = r0[1]; }
        origin = [right + sp, top];
      }
      var pages = [];
      for (j = 0; j < rows.length; j++) {
        var k = a.start + j, p = Math.floor(k / per), c = k % per;
        var pl = origin[0] + (p % cols) * (W + sp), pt = origin[1] - Math.floor(p / cols) * (H + sp);
        if (c === 0) {
          if (doc.artboards.length >= 1000) throw new Error('Illustrator allows 1000 artboards: ' + pages.length + ' made in this call. Merge fewer rows per document (offset, limit) or use mode "files".');
          var ab;
          try { ab = doc.artboards.add([pl, pt, pl + W, pt - H]); } catch (e) {
            throw new Error('Artboard for row ' + (k + 1) + ' would fall outside Illustrator\'s canvas (227 in square). Use fewer rows per document (offset, limit), fewer columns, or mode "files". (' + e.message + ')');
          }
          if (a.names && a.names[j]) ab.name = a.names[j];
          pages.push({ i: doc.artboards.length - 1, name: ab.name });
        }
        var dx = pl - tr[0] + (c % g.cols) * A.u(g.dx), dy = pt - tr[1] - Math.floor(c / g.cols) * A.u(g.dy);
        for (i = 0; i < items.length; i++) {
          var d = items[i].duplicate();
          d.translate(dx, dy);
          fillItem(d, rows[j], miss, probs, k + 1, doc);
        }
      }
      return { pages: pages, origin: origin, missing_fields: keys(miss), problems: probs };
    } finally {
      relock(layers);
    }
  };
})($.global.AIA);
