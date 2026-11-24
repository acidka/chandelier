// place, menu_command, history (phase 2). ES3.
(function (A) {
  var VECTOR = /\.(svg|svgz|ai|pdf|eps)$/i;
  function fit(it, s) {
    if (s.w !== undefined || s.h !== undefined) {
      var r = A.rectOf(it, 'geometric'), sx, sy;
      if (s.keep_ratio === false) { sx = s.w !== undefined ? s.w / r[2] : 1; sy = s.h !== undefined ? s.h / r[3] : 1; }
      else {
        var k = Math.min(s.w !== undefined ? s.w / r[2] : Infinity, s.h !== undefined ? s.h / r[3] : Infinity);
        sx = sy = k;
      }
      it.resize(sx * 100, sy * 100, true, true, true, true, 100, Transformation.TOPLEFT);
    }
    var b = A.rectOf(it, 'geometric');
    if (s.x !== undefined || s.y !== undefined) A.setGeometry(it, { x: s.x === undefined ? b[0] : s.x, y: s.y === undefined ? b[1] : s.y });
    else {
      // centre on the reference artboard
      var ab = A.rectOut(A.abRect());
      A.setGeometry(it, { x: ab[0] + (ab[2] - b[2]) / 2, y: ab[1] + (ab[3] - b[3]) / 2 });
    }
  }
  A.fitPlaced = fit;

  // symbols (0.2.1): list / create (items -> symbol, replaced by one instance unless keep) / place / replace / expand / remove
  function symbolByName(doc, name) {
    try { return doc.symbols.getByName(name); } catch (e) { throw new Error('No symbol named "' + name + '".'); }
  }
  function instancesOf(doc, sym) {
    var o = [];
    for (var i = 0; i < doc.symbolItems.length; i++) { try { if (doc.symbolItems[i].symbol === sym || doc.symbolItems[i].symbol.name === sym.name) o.push(doc.symbolItems[i]); } catch (e) {} }
    return o;
  }
  A.cmd.symbols = function (a) {
    var doc = A.doc(), act = a.action || 'list', i, sym, items, out = [];
    if (act === 'list') {
      var counts = {};
      for (i = 0; i < doc.symbolItems.length; i++) { try { var nm = doc.symbolItems[i].symbol.name; counts[nm] = (counts[nm] || 0) + 1; } catch (e) {} }
      for (i = 0; i < doc.symbols.length; i++) out.push({ name: doc.symbols[i].name, instances: counts[doc.symbols[i].name] || 0 });
      return { symbols: out };
    }
    if (act === 'create') {
      if (!a.name) throw new Error('create needs name.');
      items = A.refs(a.refs);
      if (!items.length) throw new Error('create needs refs (the art for the symbol).');
      try { doc.symbols.getByName(a.name); throw new Error('A symbol named "' + a.name + '" exists: pick another name or remove it first.'); } catch (e) { if (/exists/.test(e.message)) throw e; }
      var src = items.length === 1 ? items[0] : A.groupOf(items);
      var b = A.rectOf(src, 'geometric'), parent = src.parent;
      sym = doc.symbols.add(src);
      sym.name = a.name;
      if (a.keep) return { symbol: sym.name, kept: true };
      var inst = parent.symbolItems.add(sym);
      inst.move(src, ElementPlacement.PLACEBEFORE);
      A.setGeometry(inst, { x: b[0], y: b[1] });
      src.remove();
      A.track(inst);
      return { symbol: sym.name, instance: A.out(inst) };
    }
    if (act === 'place') {
      sym = symbolByName(doc, a.name);
      var c = A.container(a), it = c.symbolItems.add(sym);
      A.track(it);
      fit(it, a);
      return A.out(it);
    }
    if (act === 'replace') {
      sym = symbolByName(doc, a.name);
      items = A.refs(a.refs);
      for (i = 0; i < items.length; i++) {
        if (items[i].typename !== 'SymbolItem') throw new Error('Item ' + (items[i].name || items[i].uuid) + ' is not a symbol instance.');
        items[i].symbol = sym;
        out.push(A.out(items[i]));
      }
      return { count: out.length, items: out };
    }
    if (act === 'expand') {
      items = A.refs(a.refs);
      for (i = 0; i < items.length; i++) {
        if (items[i].typename !== 'SymbolItem') continue;
        var p = items[i].parent, n = p.pageItems.length;
        items[i].breakLink();
        out.push(n);
      }
      return { expanded: out.length };
    }
    if (act === 'remove') {
      sym = symbolByName(doc, a.name);
      var ins = instancesOf(doc, sym);
      if (ins.length && !a.force) throw new Error('Symbol "' + a.name + '" has ' + ins.length + ' instance(s): pass force:true to delete them too, or expand them first.');
      for (i = ins.length - 1; i >= 0; i--) ins[i].remove();
      sym.remove();
      return { removed: a.name, instances_removed: ins.length };
    }
    throw new Error('Unknown symbols action "' + act + '".');
  };

  A.cmd.place = function (a) {
    var f = new File(a.path);
    if (!f.exists) throw new Error('File not found: ' + a.path);
    var c = A.container(a), it, how;
    var vector = VECTOR.test(a.path), editable = a.editable !== undefined ? a.editable : /\.svgz?$/i.test(a.path);
    if (a.page) { try { app.preferences.PDFFileOptions.pageToOpen = a.page; } catch (e) {} }
    if (editable) {
      if (!vector) throw new Error('editable works for .svg, .ai, .pdf and .eps files, not ' + a.path + '.');
      it = c.groupItems.createFromFile(f);
      how = 'editable';
    } else {
      it = c.placedItems.add();
      try { it.file = f; } catch (e) { try { it.remove(); } catch (e2) {} throw new Error('Illustrator cannot place ' + a.path + (/\.svgz?$/i.test(a.path) ? ' as a link: use editable:true' : '') + ' (' + e.message + ').'); }
      how = 'linked';
    }
    A.track(it);
    try {
      fit(it, a);
      if (a.embed && it.typename === 'PlacedItem') {
        var before = c.rasterItems.length;
        it.embed();
        how = 'embedded';
        // embedding replaces the placed item: find the new one (raster images become RasterItems)
        it = null;
        if (c.rasterItems.length > before) it = c.rasterItems[0];
      }
      if (it && a.name) it.name = a.name;
    } catch (e) { try { if (it) it.remove(); } catch (e2) {} throw e; }
    var res = it ? A.out(it) : { note: 'embedded' };
    res.how = how;
    return res;
  };

  A.cmd.menu_command = function (a) {
    if (a.refs !== undefined) {
      var items = A.refs(a.refs), doc = A.doc();
      doc.selection = null;
      for (var i = 0; i < items.length; i++) items[i].selected = true;
    }
    A.syncSelection(); // the command acts on the current selection, also one an earlier call set (Windows)
    app.executeMenuCommand(a.command);
    var sel = app.documents.length ? app.activeDocument.selection : null, out = [];
    if (sel instanceof Array) out = sel;
    return A.outList(out, 50);
  };

  A.cmd.history = function (a) {
    var n = a.count || 1, done = 0;
    for (var i = 0; i < n; i++) {
      try { if (a.action === 'redo') app.redo(); else app.undo(); done++; } catch (e) { break; }
    }
    return { action: a.action || 'undo', done: done, note: 'One step = one earlier tool call or batch (the current call cannot undo itself).' };
  };
})($.global.AIA);
