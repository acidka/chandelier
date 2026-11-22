// arrange_items, align_items (phase 2). ES3.
(function (A) {
  // Stacking rank of items, front to back (walk order: layers top to bottom, containers front to back).
  function frontToBack(items) {
    var want = {}, rank = {}, n = 0, i;
    for (i = 0; i < items.length; i++) want[items[i].uuid] = true;
    A.walk(function (it) { if (want[it.uuid]) rank[it.uuid] = n++; });
    var out = items.slice(0);
    out.sort(function (a, b) { return rank[a.uuid] - rank[b.uuid]; });
    return out;
  }
  function uniq(items) {
    var seen = {}, out = [];
    for (var i = 0; i < items.length; i++) if (!seen[items[i].uuid]) { seen[items[i].uuid] = true; out.push(items[i]); }
    return out;
  }
  function notLocked(items) {
    for (var i = 0; i < items.length; i++) if (items[i].locked || A.layerOf(items[i]).locked) throw new Error('Item ' + (items[i].name || items[i].uuid) + ' is locked (or on a locked layer).');
  }
  // New container placed where the frontmost item is; items moved in keeping their order.
  function wrap(items, makeIn) {
    var ord = frontToBack(items), top = ord[0];
    var box = makeIn(top.parent);
    box.move(top, ElementPlacement.PLACEBEFORE);
    for (var i = 0; i < ord.length; i++) ord[i].move(box, ElementPlacement.PLACEATEND);
    return A.track(box);
  }
  // Group items in place (at the frontmost item's position, stacking kept).
  A.groupOf = function (items) { return wrap(uniq(items), function (p) { return p.groupItems.add(); }); };
  var Z = { front: 'BRINGTOFRONT', forward: 'BRINGFORWARD', backward: 'SENDBACKWARD', back: 'SENDTOBACK' };

  A.cmd.arrange_items = function (a) {
    var act = a.action, items = uniq(A.refs(a.refs)), i, out = [], g;
    if (!items.length) throw new Error('No items for ' + A.json(a.refs) + '.');
    notLocked(items);
    if (act === 'group') {
      g = wrap(items, function (p) { return p.groupItems.add(); });
      if (a.name) g.name = a.name;
      return A.outList([g]);
    }
    if (act === 'ungroup') {
      for (i = 0; i < items.length; i++) {
        g = items[i];
        if (g.typename !== 'GroupItem') throw new Error((g.name || g.uuid) + ' is not a group.');
        var kids = [], k;
        for (k = 0; k < g.pageItems.length; k++) kids.push(g.pageItems[k]);
        for (k = kids.length - 1; k >= 0; k--) {
          if (g.clipped && kids[k].clipping && a.release_clip !== false) { try { kids[k].clipping = false; } catch (e) {} }
          kids[k].move(g, ElementPlacement.PLACEAFTER);
        }
        for (k = 0; k < kids.length; k++) out.push(kids[k]);
        g.remove();
      }
      return A.outList(out);
    }
    if (act === 'clip') {
      var mask = a.mask !== undefined ? A.ref(a.mask) : frontToBack(items)[0];
      if (mask.typename !== 'PathItem' && mask.typename !== 'CompoundPathItem') throw new Error('The clipping mask must be a path or compound path (convert text with path_ops "outline" first), not ' + mask.typename + '.');
      var all = items.slice(0), has = false;
      for (i = 0; i < all.length; i++) if (all[i] === mask) has = true;
      if (!has) all.push(mask);
      g = wrap(all, function (p) { return p.groupItems.add(); });
      mask.move(g, ElementPlacement.PLACEATBEGINNING);
      if (mask.typename === 'CompoundPathItem') mask.pathItems[0].clipping = true; else mask.clipping = true;
      g.clipped = true;
      if (a.name) g.name = a.name;
      return A.outList([g]);
    }
    if (act === 'compound') {
      for (i = 0; i < items.length; i++) if (items[i].typename !== 'PathItem' && items[i].typename !== 'CompoundPathItem') throw new Error('compound needs paths, not ' + items[i].typename + '.');
      var ord = frontToBack(items), top = ord[0];
      var cp = top.parent.compoundPathItems.add();
      cp.move(top, ElementPlacement.PLACEBEFORE);
      for (i = ord.length - 1; i >= 0; i--) {
        if (ord[i].typename === 'CompoundPathItem') { while (ord[i].pathItems.length) ord[i].pathItems[0].move(cp, ElementPlacement.PLACEATBEGINNING); ord[i].remove(); }
        else ord[i].move(cp, ElementPlacement.PLACEATBEGINNING);
      }
      if (a.name) cp.name = a.name;
      return A.outList([A.track(cp)]);
    }
    if (act === 'release_compound') {
      for (i = 0; i < items.length; i++) {
        var c = items[i];
        if (c.typename !== 'CompoundPathItem') throw new Error((c.name || c.uuid) + ' is not a compound path.');
        while (c.pathItems.length) { var p = c.pathItems[0]; p.move(c, ElementPlacement.PLACEBEFORE); out.push(p); }
        c.remove();
      }
      return A.outList(out);
    }
    if (Z[act]) {
      // keep relative order: to front -> move back-most first; to back -> front-most first
      var o2 = frontToBack(items);
      if (act === 'front' || act === 'forward') o2.reverse();
      for (i = 0; i < o2.length; i++) o2[i].zOrder(ZOrderMethod[Z[act]]);
      return A.outList(items);
    }
    if (act === 'move_into' || act === 'move_above' || act === 'move_below') {
      if (a.target === undefined) throw new Error(act + ' needs target.');
      var tgt = String(a.target).indexOf('layer:') === 0 ? A.layerGet(String(a.target).slice(6)) : A.ref(a.target);
      var ordered = frontToBack(items);
      if (act === 'move_into') {
        if (tgt.typename !== 'Layer' && tgt.typename !== 'GroupItem') throw new Error('move_into target must be a layer ("layer:Name") or a group.');
        var where = a.position === 'back' ? ElementPlacement.PLACEATEND : ElementPlacement.PLACEATBEGINNING;
        if (a.position === 'back') { for (i = 0; i < ordered.length; i++) ordered[i].move(tgt, where); }
        else { for (i = ordered.length - 1; i >= 0; i--) ordered[i].move(tgt, where); }
      } else {
        if (act === 'move_above') { for (i = ordered.length - 1; i >= 0; i--) ordered[i].move(tgt, ElementPlacement.PLACEBEFORE); }
        else { for (i = 0; i < ordered.length; i++) ordered[i].move(tgt, ElementPlacement.PLACEAFTER); }
      }
      return A.outList(items);
    }
    throw new Error('Unknown arrange action "' + act + '".');
  };

  // -- align_items -------------------------------------------------------------------
  // works in document coordinates [l, t, r, b] (y up)
  A.cmd.align_items = function (a) {
    var items = uniq(A.refs(a.refs)), doc = A.doc(), i, b, T;
    if (!items.length) throw new Error('No items for ' + A.json(a.refs) + '.');
    notLocked(items);
    var vis = a.bounds === 'visible';
    function bb(it) { return vis ? A.vb(it) : A.gb(it); }
    var key = null;
    if (a.to === 'artboard') T = doc.artboards[a.artboard === undefined ? A.abIndex(doc) : a.artboard].artboardRect;
    else if (a.to === 'key') {
      if (a.key === undefined) throw new Error('to:"key" needs key (a ref).');
      key = A.ref(a.key); T = bb(key);
    } else {
      T = bb(items[0]).slice(0);
      for (i = 1; i < items.length; i++) { b = bb(items[i]); T = [Math.min(T[0], b[0]), Math.max(T[1], b[1]), Math.max(T[2], b[2]), Math.min(T[3], b[3])]; }
    }
    var h = a.horizontal, v = a.vertical;
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      if (it === key) continue;
      b = bb(it);
      var dx = 0, dy = 0;
      if (h === 'left') dx = T[0] - b[0];
      else if (h === 'center') dx = (T[0] + T[2]) / 2 - (b[0] + b[2]) / 2;
      else if (h === 'right') dx = T[2] - b[2];
      if (v === 'top') dy = T[1] - b[1];
      else if (v === 'middle') dy = (T[1] + T[3]) / 2 - (b[1] + b[3]) / 2;
      else if (v === 'bottom') dy = T[3] - b[3];
      if (dx || dy) it.translate(dx, dy);
    }
    if (a.distribute) {
      if (items.length < 2) throw new Error('distribute needs at least 2 items.');
      var horiz = a.distribute === 'horizontal', list = items.slice(0);
      list.sort(function (p, q) { var bp = bb(p), bq = bb(q); return horiz ? bp[0] - bq[0] : bq[1] - bp[1]; });
      var size = function (it) { var x = bb(it); return horiz ? x[2] - x[0] : x[1] - x[3]; };
      var startEdge, span, total = 0, gap;
      for (i = 0; i < list.length; i++) total += size(list[i]);
      var f = bb(list[0]), l = bb(list[list.length - 1]);
      if (a.to === 'artboard') { startEdge = horiz ? T[0] : T[1]; span = horiz ? T[2] - T[0] : T[1] - T[3]; }
      else { startEdge = horiz ? f[0] : f[1]; span = horiz ? l[2] - f[0] : f[1] - l[3]; }
      gap = a.spacing !== undefined ? A.u(a.spacing) : (span - total) / (list.length - 1);
      var pos = startEdge;
      for (i = 0; i < list.length; i++) {
        var c = bb(list[i]);
        if (horiz) list[i].translate(pos - c[0], 0); else list[i].translate(0, pos - c[1]);
        pos += horiz ? size(list[i]) + gap : -(size(list[i]) + gap);
      }
    }
    return A.outList(items);
  };
})($.global.AIA);
