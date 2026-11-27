// layers, artboards (phase 2). ES3.
(function (A) {
  // -- layers -------------------------------------------------------------------------
  function layerInfo(L, deep) {
    var o = { name: L.name, items: L.pageItems.length };
    if (!L.visible) o.visible = false;
    if (L.locked) o.locked = true;
    if (!L.printable) o.printable = false;
    if (L.isTemplate) o.template = true;
    try { o.color = A.colorStr(L.color); } catch (e) {}
    if (L.layers.length) {
      o.sublayers = [];
      for (var i = 0; i < L.layers.length; i++) o.sublayers.push(deep ? layerInfo(L.layers[i], true) : L.layers[i].name);
    }
    return o;
  }
  function placeLayer(L, pos) {
    if (!pos || pos === 'top') { L.zOrder(ZOrderMethod.BRINGTOFRONT); return; }
    if (pos === 'bottom') { L.zOrder(ZOrderMethod.SENDTOBACK); return; }
    var m = String(pos).match(/^(above|below):(.+)$/);
    if (!m) throw new Error('position must be top, bottom, above:Name or below:Name.');
    var ref = A.layerByName(m[2]);
    // a locked or hidden neighbour refuses the move too (bug #18): open it for the move, then restore it
    var rl = ref.locked, rv = ref.visible;
    if (rl) ref.locked = false;
    if (!rv) ref.visible = true;
    try { L.move(ref, m[1] === 'above' ? ElementPlacement.PLACEBEFORE : ElementPlacement.PLACEAFTER); }
    finally { if (!rv) ref.visible = false; if (rl) ref.locked = true; }
  }
  function setLayer(L, a) {
    var wasLocked = L.locked;
    if (wasLocked) L.locked = false; // a locked layer can't be renamed or changed
    try {
      // a hidden or locked layer can't be moved ("Cannot modify a layer that is locked"): move first, visible
      if (a.position) { var vis = L.visible; L.visible = true; try { placeLayer(L, a.position); } finally { L.visible = vis; } }
      setProps(L, a);
    } finally { L.locked = a.locked !== undefined ? a.locked : wasLocked; }
  }
  function setProps(L, a) {
    if (a.new_name !== undefined) L.name = a.new_name;
    if (a.visible !== undefined) L.visible = a.visible;
    if (a.printable !== undefined) L.printable = a.printable;
    if (a.template !== undefined) L.isTemplate = a.template;
    if (a.dim_images !== undefined) L.dimPlacedImages = a.dim_images;
    if (a.color !== undefined) {
      var c = A.color(a.color);
      if (c.typename !== 'RGBColor') throw new Error('Layer colour must be RGB: "#rrggbb" or rgb(r,g,b).');
      L.color = c;
    }
    if (a.opacity !== undefined) L.opacity = a.opacity;
  }
  function findChild(parent, name) { try { return parent.layers.getByName(name); } catch (e) { return null; } }
  A.cmd.layers = function (a) {
    var doc = A.doc(), act = a.action || 'list', L, i;
    if (act === 'list') {
      var out = [];
      for (i = 0; i < doc.layers.length; i++) out.push(layerInfo(doc.layers[i], true));
      return { active: doc.activeLayer.name, layers: out };
    }
    if (act === 'add') {
      if (!a.name) throw new Error('add needs name.');
      var parent = a.parent ? A.layerByName(a.parent) : null;
      // adding a layer that exists is a no-op that applies the props, like swatches add (bug #10): re-runnable batches
      var had = parent ? findChild(parent, a.name) : A.findLayer(a.name, doc);
      if (had) {
        setLayer(had, a);
        if (a.activate !== false) doc.activeLayer = had;
        var info = layerInfo(had, true); info.existed = true; return info;
      }
      L = parent ? parent.layers.add() : doc.layers.add();
      L.name = a.name;
      setLayer(L, a);
      if (a.activate !== false) doc.activeLayer = L;
      return layerInfo(L, true);
    }
    if (!a.name) throw new Error(act + ' needs name.');
    L = A.layerByName(a.name);
    if (act === 'update') { setLayer(L, a); return layerInfo(L, true); }
    if (act === 'activate') { if (!L.visible || L.locked) A.warn('Layer "' + L.name + '" is hidden or locked: new items cannot go there.'); doc.activeLayer = L; return { active: L.name }; }
    if (act === 'reorder') { setLayer(L, { position: a.position || 'top' }); return layerInfo(L, false); }
    if (act === 'remove') {
      var n = 0;
      A.walk(function () { n++; }, L);
      if (n && !a.force) throw new Error('Layer "' + L.name + '" has ' + n + ' item(s): pass force:true to delete it with them, or move them first (arrange_items move_into).');
      if (doc.layers.length === 1 && L.parent.typename === 'Document') throw new Error('Cannot remove the only layer.');
      if (L.locked) L.locked = false;
      var nm = L.name;
      L.remove();
      return { removed: nm, items_deleted: n };
    }
    throw new Error('Unknown layers action "' + act + '".');
  };

  // -- artboards ----------------------------------------------------------------------
  // Rects are [x, y, w, h] in session coordinates both ways (quirk A7).
  function abOut(doc, i) { return { i: i, name: doc.artboards[i].name, rect: A.rectOut(doc.artboards[i].artboardRect) }; }
  function abIdx(doc, i) {
    if (i === undefined || i === null) return doc.artboards.getActiveArtboardIndex();
    if (i < 0 || i >= doc.artboards.length) throw new Error('Artboard ' + i + ' does not exist (document has ' + doc.artboards.length + ').');
    return i;
  }
  // top-level items whose centre lies on artboard rect r (document coords)
  function artOn(r) {
    var items = A.topLevel(), out = [];
    for (var i = 0; i < items.length; i++) {
      var b = A.vb(items[i]), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
      if (cx >= r[0] && cx <= r[2] && cy <= r[1] && cy >= r[3]) out.push(items[i]);
    }
    return out;
  }
  function moveBoard(doc, i, nr, withArt) {
    var r = doc.artboards[i].artboardRect, art = withArt ? artOn(r) : [];
    doc.artboards[i].artboardRect = nr;
    var dx = nr[0] - r[0], dy = nr[1] - r[1];
    if (dx || dy) for (var k = 0; k < art.length; k++) { if (!art[k].locked) art[k].translate(dx, dy); }
    return art.length;
  }
  // Crop (trim) marks drawn as artwork in [Registration] (found by colour type, B5): 2 lines per corner, starting
  // offset away from the trim edge. Around artboards (index / all) or around items (refs).
  function registration(doc) {
    for (var i = 0; i < doc.spots.length; i++) if (doc.spots[i].colorType === ColorModel.REGISTRATION) { var c = new SpotColor(); c.spot = doc.spots[i]; c.tint = 100; return c; }
    var k = new CMYKColor(); k.cyan = 100; k.magenta = 100; k.yellow = 100; k.black = 100; return k;
  }
  function cropMarks(doc, a) {
    var rects = [], i;
    if (a.refs !== undefined) {
      var items = A.refs(a.refs), b = A.vb(items[0]).slice(0);
      for (i = 1; i < items.length; i++) { var v = A.vb(items[i]); b = [Math.min(b[0], v[0]), Math.max(b[1], v[1]), Math.max(b[2], v[2]), Math.min(b[3], v[3])]; }
      rects.push(b);
    } else if (a.index === 'all' || a.all) { for (i = 0; i < doc.artboards.length; i++) rects.push(doc.artboards[i].artboardRect); }
    else rects.push(doc.artboards[abIdx(doc, a.index)].artboardRect);
    var mb = A.metaGet ? A.metaGet('bleed', doc) : null;
    var off = a.offset !== undefined ? A.u(a.offset) : Math.max(mb ? Math.max(mb.left, mb.top, mb.right, mb.bottom) : 0, 3 * 72 / 25.4);
    var len = a.length !== undefined ? A.u(a.length) : 5 * 72 / 25.4, w = a.weight || 0.25, col = registration(doc);
    var L = A.usableTarget(A.layerGet(a.layer || 'Crop Marks')), made = [];
    var g = A.track(L.groupItems.add()); g.name = a.name || 'Crop Marks';
    function line(x1, y1, x2, y2) {
      var p = g.pathItems.add();
      p.setEntirePath([[x1, y1], [x2, y2]]);
      p.filled = false; p.stroked = true; p.strokeColor = col; p.strokeWidth = w; p.strokeCap = StrokeCap.BUTTENDCAP;
      made.push(p);
    }
    for (i = 0; i < rects.length; i++) {
      var r = rects[i], l = r[0], t = r[1], rt = r[2], bt = r[3];
      line(l - off - len, t, l - off, t); line(l, t + off, l, t + off + len);       // top left
      line(rt + off, t, rt + off + len, t); line(rt, t + off, rt, t + off + len);   // top right
      line(l - off - len, bt, l - off, bt); line(l, bt - off, l, bt - off - len);   // bottom left
      line(rt + off, bt, rt + off + len, bt); line(rt, bt - off, rt, bt - off - len); // bottom right
    }
    var res = A.out(g);
    res.marks = made.length; res.offset = A.toU(off); res.length = A.toU(len);
    return res;
  }
  A.cmd.artboards = function (a) { return A.boardFrame(function () { return boards(a); }); };
  function boards(a) {
    var doc = A.doc(), act = a.action || 'list', i, r, out = [];
    if (act === 'list') {
      for (i = 0; i < doc.artboards.length; i++) out.push(abOut(doc, i));
      return { active: doc.artboards.getActiveArtboardIndex(), artboards: out };
    }
    if (act === 'add') {
      if (a.rect) r = A.rectIn(a.rect);
      else {
        if (!(a.w > 0) || !(a.h > 0)) throw new Error('add needs rect [x,y,w,h], or w and h (placed right of the last artboard).');
        var last = doc.artboards[doc.artboards.length - 1].artboardRect, gap = A.u(a.spacing === undefined ? 20 / A.unit() : a.spacing);
        r = [last[2] + gap, last[1], last[2] + gap + A.u(a.w), last[1] - A.u(a.h)];
      }
      var keepActive = doc.artboards.getActiveArtboardIndex();
      var ab = doc.artboards.add(r); // makes the new artboard active: switch back so other coordinates don't shift
      if (a.name) ab.name = a.name;
      doc.artboards.setActiveArtboardIndex(keepActive);
      return abOut(doc, doc.artboards.length - 1);
    }
    if (act === 'crop_marks') return cropMarks(doc, a);
    if (act === 'grid_layout') {
      // rearrange all artboards in a grid (left to right, top to bottom), art moves along unless move_art:false
      var cols = a.columns || Math.ceil(Math.sqrt(doc.artboards.length)), sp = A.u(a.spacing === undefined ? 20 / A.unit() : a.spacing);
      var o = doc.artboards[0].artboardRect, x0 = o[0], y0 = o[1], rowH = 0, x = x0, y = y0, moved = 0, targets = [];
      for (i = 0; i < doc.artboards.length; i++) {
        var cr = doc.artboards[i].artboardRect, w = cr[2] - cr[0], h = cr[1] - cr[3];
        if (i > 0 && i % cols === 0) { x = x0; y -= rowH + sp; rowH = 0; }
        targets.push([x, y, x + w, y - h]);
        x += w + sp; rowH = Math.max(rowH, h);
      }
      // collect art for every board first, then move (boards may overlap on the way)
      var arts = [];
      for (i = 0; i < doc.artboards.length; i++) arts.push(a.move_art === false ? [] : artOn(doc.artboards[i].artboardRect));
      for (i = 0; i < doc.artboards.length; i++) {
        var old = doc.artboards[i].artboardRect, t = targets[i];
        doc.artboards[i].artboardRect = t;
        for (var k = 0; k < arts[i].length; k++) if (!arts[i][k].locked) { arts[i][k].translate(t[0] - old[0], t[1] - old[1]); moved++; }
      }
      for (i = 0; i < doc.artboards.length; i++) out.push(abOut(doc, i));
      return { artboards: out, items_moved: moved };
    }
    i = abIdx(doc, a.index);
    if (act === 'update') {
      if (a.name !== undefined) doc.artboards[i].name = a.name;
      var moved1 = 0;
      if (a.rect || a.x !== undefined || a.y !== undefined || a.w !== undefined || a.h !== undefined) {
        var cur = A.rectOut(doc.artboards[i].artboardRect);
        var nr = a.rect || [a.x === undefined ? cur[0] : a.x, a.y === undefined ? cur[1] : a.y, a.w === undefined ? cur[2] : a.w, a.h === undefined ? cur[3] : a.h];
        moved1 = moveBoard(doc, i, A.rectIn(nr), !!a.move_art);
      }
      var res = abOut(doc, i);
      if (a.move_art) res.items_moved = moved1;
      return res;
    }
    if (act === 'remove') {
      if (doc.artboards.length === 1) throw new Error('Cannot remove the only artboard.');
      var nm = doc.artboards[i].name;
      doc.artboards.remove(i);
      return { removed: nm, artboards: doc.artboards.length };
    }
    if (act === 'activate') { doc.artboards.setActiveArtboardIndex(i); return abOut(doc, i); }
    if (act === 'fit_to_art') {
      if (a.refs !== undefined) {
        var items = A.refs(a.refs), b = A.vb(items[0]).slice(0);
        for (var j = 1; j < items.length; j++) { var vb = A.vb(items[j]); b = [Math.min(b[0], vb[0]), Math.max(b[1], vb[1]), Math.max(b[2], vb[2]), Math.min(b[3], vb[3])]; }
        var pad = A.u(a.pad || 0);
        doc.artboards[i].artboardRect = [b[0] - pad, b[1] + pad, b[2] + pad, b[3] - pad];
      } else {
        var prev = doc.artboards.getActiveArtboardIndex();
        doc.artboards.setActiveArtboardIndex(i);
        doc.selectObjectsOnActiveArtboard();
        if (!(doc.selection instanceof Array) || !doc.selection.length) { doc.artboards.setActiveArtboardIndex(prev); throw new Error('Artboard ' + i + ' has no art to fit to: give refs.'); }
        doc.fitArtboardToSelectedArt(i);
        doc.selection = null;
        doc.artboards.setActiveArtboardIndex(prev);
      }
      return abOut(doc, i);
    }
    throw new Error('Unknown artboards action "' + act + '".');
  }
})($.global.AIA);
