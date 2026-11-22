// transform_items, duplicate_items (phase 2). ES3.
(function (A) {
  // session delta -> document delta
  A.dxy = function (dx, dy) {
    return A.S.origin === 'document' ? [A.u(dx || 0), A.u(dy || 0)] : [A.u(dx || 0), -A.u(dy || 0)];
  };
  function center(b) { return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }
  function union(items) {
    var b = A.gb(items[0]).slice(0);
    for (var i = 1; i < items.length; i++) {
      var g = A.gb(items[i]);
      b = [Math.min(b[0], g[0]), Math.max(b[1], g[1]), Math.max(b[2], g[2]), Math.min(b[3], g[3])];
    }
    return b;
  }
  // anchor name -> point (document coords) of bounds [l,t,r,b]
  var AP = { top_left: [0, 0], top: [0.5, 0], top_right: [1, 0], left: [0, 0.5], center: [0.5, 0.5], right: [1, 0.5],
    bottom_left: [0, 1], bottom: [0.5, 1], bottom_right: [1, 1] };
  function anchorPoint(b, name) {
    var f = AP[name || 'center'];
    if (!f) throw new Error('Unknown origin "' + name + '".');
    return [b[0] + f[0] * (b[2] - b[0]), b[1] - f[1] * (b[1] - b[3])];
  }
  // Apply a linear map M (2x2, document coords) about point P: transform about the item's own centre, then
  // translate by M(C-P)+P-C. Never depends on Illustrator's ruler/document origin.
  function linearAbout(it, kind, val, P, s) {
    var C = center(A.gb(it)), v = [C[0] - P[0], C[1] - P[1]], m;
    var lw = s.scale_strokes ? null : 100;
    if (kind === 'rotate') {
      var r = val * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
      it.rotate(val, true, true, true, true, Transformation.CENTER);
      m = [cs * v[0] - sn * v[1], sn * v[0] + cs * v[1]];
    } else { // scale [sx%, sy%] (reflect = negative)
      var sx = val[0] / 100, sy = val[1] / 100;
      it.resize(val[0], val[1], true, true, true, true, lw === null ? Math.sqrt(Math.abs(sx * sy)) * 100 : lw, Transformation.CENTER);
      m = [sx * v[0], sy * v[1]];
    }
    it.translate(m[0] + P[0] - C[0], m[1] + P[1] - C[1]);
  }
  // One transform step on a list of items.
  function transformOnce(items, s) {
    var i, ub = s.as_group ? union(items) : null;
    function pivot(it) {
      if (s.origin instanceof Array) return A.P(s.origin[0], s.origin[1]);
      return anchorPoint(ub || A.gb(it), s.origin);
    }
    for (i = 0; i < items.length; i++) {
      var it = items[i], P;
      if (s.scale !== undefined || s.sx !== undefined || s.sy !== undefined) {
        P = pivot(it);
        var sx = s.sx !== undefined ? s.sx : (s.scale !== undefined ? s.scale : 100), sy = s.sy !== undefined ? s.sy : (s.scale !== undefined ? s.scale : 100);
        linearAbout(it, 'scale', [sx, sy], P, s);
      }
      // the server sends "reflect" as "flip": every ExtendScript object has a built-in .reflect (quirk C13)
      if (typeof s.flip === 'string') {
        P = pivot(it);
        linearAbout(it, 'scale', s.flip === 'horizontal' ? [-100, 100] : [100, -100], P, { scale_strokes: true });
      }
      if (s.rotate) {
        P = pivot(it);
        // session angle: positive = clockwise on screen when y grows down (artboard origin)
        linearAbout(it, 'rotate', A.S.origin === 'document' ? s.rotate : -s.rotate, P, s);
      }
      if (s.dx || s.dy) { var d = A.dxy(s.dx, s.dy); it.translate(d[0], d[1]); }
    }
  }
  A.cmd.transform_items = function (a) {
    var items = A.refs(a.refs), i;
    if (!items.length) throw new Error('No items for ' + A.json(a.refs) + '.');
    for (i = 0; i < items.length; i++) if (items[i].locked) throw new Error('Item ' + (items[i].name || items[i].uuid) + ' is locked.');
    if (!a.copies) { transformOnce(items, a); return A.outList(items); }
    // step and repeat: each copy is the previous one transformed again
    var made = [], prev = items;
    for (var c = 0; c < a.copies; c++) {
      var next = [];
      for (i = 0; i < prev.length; i++) next.push(A.track(prev[i].duplicate()));
      transformOnce(next, a);
      for (i = 0; i < next.length; i++) made.push(next[i]);
      prev = next;
    }
    return A.outList(made);
  };

  // -- duplicate_items ---------------------------------------------------------------
  function dest(a) {
    if (a.parent !== undefined || a.layer) return A.container(a);
    return null;
  }
  function dup(it, to) {
    var d = to ? it.duplicate(to, ElementPlacement.PLACEATBEGINNING) : it.duplicate();
    return A.track(d);
  }
  A.cmd.duplicate_items = function (a) {
    var items = A.refs(a.refs), doc = A.doc(), to = dest(a), made = [], i, j, k, d;
    if (!items.length) throw new Error('No items for ' + A.json(a.refs) + '.');
    if (a.to_artboards !== undefined) {
      var targets = [];
      if (a.to_artboards === 'all') { for (k = 0; k < doc.artboards.length; k++) targets.push(k); } else targets = a.to_artboards;
      for (i = 0; i < items.length; i++) {
        var from = a.from_artboard !== undefined ? a.from_artboard : A.abOf(items[i], doc);
        if (from === null) throw new Error('Item ' + (items[i].name || items[i].uuid) + ' is on no artboard: give from_artboard.');
        var fr = doc.artboards[from].artboardRect;
        for (k = 0; k < targets.length; k++) {
          var t = targets[k];
          if (t === from) continue;
          if (t < 0 || t >= doc.artboards.length) throw new Error('Artboard ' + t + ' does not exist.');
          var tr = doc.artboards[t].artboardRect;
          d = dup(items[i], to);
          d.translate(tr[0] - fr[0], tr[1] - fr[1]);
          if (a.name_suffix) d.name = (items[i].name || '') + String(a.name_suffix).replace('{artboard}', t);
          made.push(d);
        }
      }
      return A.outList(made);
    }
    var rows = a.rows || 1, cols = a.cols || 1, count = a.count || 1;
    if (rows > 1 || cols > 1) {
      // grid: step = the selection's size + gap, unless step_x / step_y are given
      var ub = union(items), w = (ub[2] - ub[0]) / A.unit(), h = (ub[1] - ub[3]) / A.unit();
      var stx = a.step_x !== undefined ? a.step_x : w + (a.gap_x || 0), sty = a.step_y !== undefined ? a.step_y : h + (a.gap_y || 0);
      for (j = 0; j < rows; j++) for (k = 0; k < cols; k++) {
        if (j === 0 && k === 0) continue;
        for (i = 0; i < items.length; i++) {
          d = dup(items[i], to);
          var g = A.dxy(k * stx, j * sty);
          d.translate(g[0], g[1]);
          made.push(d);
        }
      }
      return A.outList(made);
    }
    for (var n = 1; n <= count; n++) {
      for (i = 0; i < items.length; i++) {
        d = dup(items[i], to);
        var o = A.dxy((a.dx || 0) * n, (a.dy || 0) * n);
        d.translate(o[0], o[1]);
        made.push(d);
      }
    }
    return A.outList(made);
  };
})($.global.AIA);
