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
