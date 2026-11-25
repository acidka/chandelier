// create_path and the SVG path-data parser (phase 2). ES3.
(function (A) {
  // -- SVG path data -> subpaths [{closed, pts:[{a:[x,y], i:[x,y], o:[x,y]}]}] in SVG coordinates (y down) --
  // Supports M L H V C S Q T A Z, absolute and relative. Quadratics and arcs become cubic segments.
  A.svgPath = function (d) {
    var toks = String(d).match(/[MmLlHhVvCcSsQqTtAaZz]|[+\-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+\-]?\d+)?/g) || [];
    var i = 0, cmd = null, subs = [], cur = null, x = 0, y = 0, sx = 0, sy = 0;
    var lastC = null, lastQ = null; // reflected control points for S / T
    function n() {
      if (i >= toks.length || /^[A-Za-z]$/.test(toks[i])) throw new Error('SVG path: number expected after "' + cmd + '".');
      return parseFloat(toks[i++]);
    }
    function flag() {
      // arc flags may be written without separators ("a1 1 0 01 1 1"): take one digit
      var t = toks[i];
      if (t === undefined) throw new Error('SVG path: arc flag expected.');
      if (t.length > 1 && (t.charAt(0) === '0' || t.charAt(0) === '1')) { toks[i] = t.slice(1); return +t.charAt(0); }
      i++;
      return +t;
    }
    function start(px, py) { cur = { closed: false, pts: [{ a: [px, py], i: [px, py], o: [px, py] }] }; subs.push(cur); }
    function last() { return cur.pts[cur.pts.length - 1]; }
    function lineTo(px, py) { cur.pts.push({ a: [px, py], i: [px, py], o: [px, py] }); x = px; y = py; }
    function curveTo(c1x, c1y, c2x, c2y, px, py) {
      last().o = [c1x, c1y];
      cur.pts.push({ a: [px, py], i: [c2x, c2y], o: [px, py] });
      x = px; y = py;
    }
    function ensure() { if (!cur) start(x, y); }
    // endpoint arc -> cubic segments (SVG implementation notes F.6)
    function arcTo(rx, ry, rot, large, sweep, px, py) {
      if (rx === 0 || ry === 0 || (px === x && py === y)) { lineTo(px, py); return; }
      rx = Math.abs(rx); ry = Math.abs(ry);
      var phi = rot * Math.PI / 180, cs = Math.cos(phi), sn = Math.sin(phi);
      var dx = (x - px) / 2, dy = (y - py) / 2;
      var x1 = cs * dx + sn * dy, y1 = -sn * dx + cs * dy;
      var lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
      if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
      var num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1, den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
      var co = Math.sqrt(Math.max(0, num / den)) * (large === sweep ? -1 : 1);
      var cxp = co * rx * y1 / ry, cyp = -co * ry * x1 / rx;
      var cx = cs * cxp - sn * cyp + (x + px) / 2, cy = sn * cxp + cs * cyp + (y + py) / 2;
      function ang(ux, uy, vx, vy) { return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); }
      var t1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
      var dt = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
      if (!sweep && dt > 0) dt -= 2 * Math.PI;
      else if (sweep && dt < 0) dt += 2 * Math.PI;
      var segs = Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9), step = dt / segs;
      var k = 4 / 3 * Math.tan(step / 4);
      function pt(t) { var ct = Math.cos(t), st = Math.sin(t); return [cx + rx * ct * cs - ry * st * sn, cy + rx * ct * sn + ry * st * cs]; }
      function der(t) { var ct = Math.cos(t), st = Math.sin(t); return [-rx * st * cs - ry * ct * sn, -rx * st * sn + ry * ct * cs]; }
      for (var s = 0; s < segs; s++) {
        var ta = t1 + s * step, tb = ta + step, p0 = pt(ta), p3 = pt(tb), d0 = der(ta), d3 = der(tb);
        var e = s === segs - 1 ? [px, py] : p3;
        curveTo(p0[0] + k * d0[0], p0[1] + k * d0[1], p3[0] - k * d3[0], p3[1] - k * d3[1], e[0], e[1]);
      }
    }
    while (i < toks.length) {
      var t = toks[i];
      if (/^[A-Za-z]$/.test(t)) { cmd = t; i++; } else if (cmd === null) throw new Error('SVG path must start with M.');
      var rel = /[a-y]/.test(cmd); // lowercase = relative (z/Z handled apart)
      var C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0, c1x, c1y, c2x, c2y, px, py;
      if (C === 'Z') {
        if (cur) {
          cur.closed = true;
          var f = cur.pts[0], l = last();
          if (cur.pts.length > 1 && Math.abs(f.a[0] - l.a[0]) < 1e-6 && Math.abs(f.a[1] - l.a[1]) < 1e-6) { f.i = l.i; cur.pts.pop(); }
          x = sx; y = sy;
          cur = null;
        }
        lastC = lastQ = null;
        continue;
      }
      if (C === 'M') {
        px = n() + ox; py = n() + oy; start(px, py); x = sx = px; y = sy = py;
        cmd = rel ? 'l' : 'L'; // further pairs are line-tos
        lastC = lastQ = null;
        continue;
      }
      ensure();
      if (C === 'L') { lineTo(n() + ox, n() + oy); lastC = lastQ = null; }
      else if (C === 'H') { lineTo(n() + ox, y); lastC = lastQ = null; }
      else if (C === 'V') { lineTo(x, n() + oy); lastC = lastQ = null; }
      else if (C === 'C') {
        c1x = n() + ox; c1y = n() + oy; c2x = n() + ox; c2y = n() + oy; px = n() + ox; py = n() + oy;
        curveTo(c1x, c1y, c2x, c2y, px, py); lastC = [c2x, c2y]; lastQ = null;
      } else if (C === 'S') {
        c1x = lastC ? 2 * x - lastC[0] : x; c1y = lastC ? 2 * y - lastC[1] : y;
        c2x = n() + ox; c2y = n() + oy; px = n() + ox; py = n() + oy;
        curveTo(c1x, c1y, c2x, c2y, px, py); lastC = [c2x, c2y]; lastQ = null;
      } else if (C === 'Q' || C === 'T') {
        var qx, qy;
        if (C === 'Q') { qx = n() + ox; qy = n() + oy; } else { qx = lastQ ? 2 * x - lastQ[0] : x; qy = lastQ ? 2 * y - lastQ[1] : y; }
        px = n() + ox; py = n() + oy;
        curveTo(x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y), px + 2 / 3 * (qx - px), py + 2 / 3 * (qy - py), px, py);
        lastQ = [qx, qy]; lastC = null;
      } else if (C === 'A') {
        var rx = n(), ry = n(), rot = n(), large = flag(), sweep = flag();
        px = n() + ox; py = n() + oy;
        arcTo(rx, ry, rot, large, sweep, px, py); lastC = lastQ = null;
      } else throw new Error('SVG path: unknown command "' + cmd + '".');
    }
    return subs;
  };

  // -- points as the agent gives them: [x,y] or {a:[x,y], in:[x,y], out:[x,y]} (same as get_items points) --
  function normPts(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (p instanceof Array) out.push({ a: p, i: p, o: p });
      else if (p && p.a) out.push({ a: p.a, i: p['in'] || p.a, o: p.out || p.a });
      else throw new Error('point ' + i + ' must be [x, y] or {a:[x,y], in:[x,y], out:[x,y]}.');
    }
    return out;
  }
  function same(a, b) { return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6; }
  // Fill a PathItem from points; tr maps [x,y] -> document [X,Y].
  function build(path, pts, closed, tr) {
    if (pts.length < 2) throw new Error('A path needs at least 2 points.');
    var anchors = [], i;
    for (i = 0; i < pts.length; i++) anchors.push(tr(pts[i].a));
    path.setEntirePath(anchors);
    for (i = 0; i < pts.length; i++) {
      var p = pts[i], pp = path.pathPoints[i];
      if (!same(p.i, p.a) || !same(p.o, p.a)) {
        pp.leftDirection = tr(p.i);
        pp.rightDirection = tr(p.o);
        // smooth when both handles exist and are collinear through the anchor
        var ax = p.i[0] - p.a[0], ay = p.i[1] - p.a[1], bx = p.o[0] - p.a[0], by = p.o[1] - p.a[1];
        var smooth = (ax || ay) && (bx || by) && Math.abs(ax * by - ay * bx) < 1e-3 * (Math.abs(ax) + Math.abs(ay)) * (Math.abs(bx) + Math.abs(by)) && (ax * bx + ay * by) < 0;
        pp.pointType = smooth ? PointType.SMOOTH : PointType.CORNER;
      }
    }
    path.closed = !!closed;
    return path;
  }

  function makePath(s) {
    var c = A.container(s), subs = [], i, k;
    var ox = s.x || 0, oy = s.y || 0, sc = s.scale === undefined ? 1 : s.scale;
    var sx = sc instanceof Array ? sc[0] : sc, sy = sc instanceof Array ? sc[1] : sc;
    if (s.d !== undefined) {
      var sp = A.svgPath(s.d);
      for (i = 0; i < sp.length; i++) if (sp[i].pts.length > 1) subs.push(sp[i]);
    } else if (s.paths) {
      for (i = 0; i < s.paths.length; i++) subs.push({ closed: s.closed !== false, pts: normPts(s.paths[i]) });
    } else if (s.points) subs.push({ closed: !!s.closed, pts: normPts(s.points) });
    else throw new Error('create_path needs points, paths or d.');
    if (!subs.length) throw new Error('The path has no drawable segments.');
    if (s.closed !== undefined && s.d === undefined) for (i = 0; i < subs.length; i++) subs[i].closed = !!s.closed;
    function tr(p) { return A.P(ox + p[0] * sx, oy + p[1] * sy); }
    var it, anyClosed = false;
    for (i = 0; i < subs.length; i++) if (subs[i].closed) anyClosed = true;
    if (subs.length === 1) it = build(c.pathItems.add(), subs[0].pts, subs[0].closed, tr);
    else {
      it = c.compoundPathItems.add();
      try {
        for (k = 0; k < subs.length; k++) build(it.pathItems.add(), subs[k].pts, subs[k].closed, tr);
        if (s.fill_rule === 'evenodd') for (k = 0; k < it.pathItems.length; k++) it.pathItems[k].evenodd = true;
      } catch (e) { try { it.remove(); } catch (e2) {} throw e; }
    }
    if (s.fill === undefined && s.stroke === undefined) s = A.merge(s, anyClosed ? { fill: 'gray(100)', stroke: 'none' } : { fill: 'none', stroke: 'gray(100)' });
    else { if (s.fill === undefined) s = A.merge(s, { fill: 'none' }); if (s.stroke === undefined) s = A.merge(s, { stroke: 'none' }); }
    return A.finish(it, s);
  }
  A.cmd.create_path = function (a) {
    if (a.clip_to === undefined) return A.outList(A.createEach(a, makePath));
    // clip_to: the new paths go into a clip group masked by a copy of that path (shading inside its shape)
    var src = A.ref(a.clip_to);
    if (src.typename !== 'PathItem' && src.typename !== 'CompoundPathItem') throw new Error('clip_to must be a path or compound path, not ' + src.typename + '.');
    var made = A.createEach(a, makePath), m = null, g, i;
    try {
      m = src.duplicate(made[0], ElementPlacement.PLACEBEFORE);
      m.name = src.name ? src.name + ' (clip)' : ''; // the copy must not answer the source's name: refs

      g = A.groupOf(made.concat([m]));
      m.move(g, ElementPlacement.PLACEATBEGINNING);
      if (m.typename === 'CompoundPathItem') m.pathItems[0].clipping = true; else m.clipping = true;
      g.clipped = true;
    } catch (e) {
      for (i = 0; i < made.length; i++) { try { made[i].remove(); } catch (e2) {} }
      if (m) { try { m.remove(); } catch (e3) {} }
      throw e;
    }
    return A.outList([g]);
  };
})($.global.AIA);
