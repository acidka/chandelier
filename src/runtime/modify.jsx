// modify_items, delete_items (phase 2). ES3.
(function (A) {
  var ANCHOR = { top_left: 'TOPLEFT', top: 'TOP', top_right: 'TOPRIGHT', left: 'LEFT', center: 'CENTER', right: 'RIGHT',
    bottom_left: 'BOTTOMLEFT', bottom: 'BOTTOM', bottom_right: 'BOTTOMRIGHT' };
  A.anchor = function (name) {
    var k = ANCHOR[name || 'top_left'];
    if (!k) throw new Error('Unknown anchor "' + name + '". Use top_left, top, top_right, left, center, right, bottom_left, bottom or bottom_right.');
    return Transformation[k];
  };
  // Bounds used for x/y/w/h: geometric (as create_shape sizes; default) or visible (incl. stroke, as "box").
  A.bounds = function (it, which) { return which === 'visible' ? A.vb(it) : A.gb(it); };
  A.rectOf = function (it, which) { return A.rectOut(A.bounds(it, which)); };

  // Set position and/or size: x, y = top-left; w, h; keep_ratio; anchor = fixed point when resizing.
  A.setGeometry = function (it, s) {
    var which = s.bounds, r;
    if (s.w !== undefined || s.h !== undefined) {
      r = A.rectOf(it, which);
      var sx = s.w !== undefined ? s.w / r[2] * 100 : null, sy = s.h !== undefined ? s.h / r[3] * 100 : null;
      if (sx === null) sx = s.keep_ratio ? sy : 100;
      if (sy === null) sy = s.keep_ratio ? sx : 100;
      if (!(sx > 0) || !(sy > 0) || !isFinite(sx) || !isFinite(sy)) throw new Error('Cannot resize ' + (it.name || it.uuid) + ' (zero size, or w/h <= 0).');
      it.resize(sx, sy, true, true, true, true, s.scale_strokes ? Math.sqrt(sx * sy) : 100, A.anchor(s.anchor));
    }
    if (s.x !== undefined || s.y !== undefined) {
      r = A.rectOf(it, which);
      var p0 = A.P(r[0], r[1]), p1 = A.P(s.x === undefined ? r[0] : s.x, s.y === undefined ? r[1] : s.y);
      it.translate(p1[0] - p0[0], p1[1] - p0[1]);
    }
  };

  function modifyOne(it, s) {
    var wasLocked = it.locked;
    if (wasLocked && s.locked !== false) throw new Error('Item ' + (it.name || it.uuid) + ' is locked: pass locked:false to unlock and change it.');
    if (wasLocked) it.locked = false;
    A.setGeometry(it, s);
    A.applyStyle(it, s);
  }

  A.cmd.modify_items = function (a) {
    var jobs = [], i, j, base = {}, k;
    for (k in a) if (a.hasOwnProperty(k) && k !== 'items' && k !== 'refs') base[k] = a[k];
    if (a.refs !== undefined) { var rs = A.refs(a.refs); for (i = 0; i < rs.length; i++) jobs.push([rs[i], base]); }
    if (a.items) for (i = 0; i < a.items.length; i++) {
      var spec = A.merge(base, a.items[i]), its = A.refs(a.items[i].ref);
      for (j = 0; j < its.length; j++) jobs.push([its[j], spec]);
    }
    if (!jobs.length) throw new Error('Nothing to modify: give refs (with props) or items:[{ref, ...props}].');
    var done = [], seen = {};
    for (i = 0; i < jobs.length; i++) {
      try { modifyOne(jobs[i][0], jobs[i][1]); } catch (e) {
        var err = new Error('item ' + (jobs[i][0].name || jobs[i][0].uuid) + ': ' + e.message + (done.length ? ' (' + done.length + ' item(s) before it were already changed)' : ''));
        err.number = e.number; throw err;
      }
      if (!seen[jobs[i][0].uuid]) { seen[jobs[i][0].uuid] = true; done.push(jobs[i][0]); }
    }
    return A.outList(done);
  };

  // Refs that name nothing (a missing layer or name, a uuid already gone) delete nothing instead of failing, so a
  // re-runnable batch can start by clearing its own layer (bug #7). Other ref errors still fail.
  function softRefs(ref, missing) {
    if (ref instanceof Array) { var all = []; for (var k = 0; k < ref.length; k++) all = all.concat(softRefs(ref[k], missing)); return all; }
    try { return A.refs(ref); } catch (e) {
      if (typeof ref === 'string' && /^(layer:|name:|\d+$)/.test(ref)) { missing.push(ref); return []; }
      throw e;
    }
  }
  A.cmd.delete_items = function (a) {
    if (a.refs === undefined || a.refs === null) A.refs(a.refs);
    var missing = [], items = softRefs(a.refs, missing), n = 0, skipped = [], i;
    // delete children before parents and never twice (a group and its child both listed)
    var uu = {};
    for (i = 0; i < items.length; i++) uu[items[i].uuid] = items[i];
    for (var key in uu) {
      if (!uu.hasOwnProperty(key)) continue;
      var it = uu[key], p = it.parent, inside = false;
      for (var d = 0; p && p.typename !== 'Layer' && p.typename !== 'Document' && d < 50; d++) { if (uu[p.uuid]) { inside = true; break; } p = p.parent; }
      if (inside) continue;
      if (it.locked || A.layerOf(it).locked) {
        if (!a.force) { skipped.push(it.name || it.uuid); continue; }
        it.locked = false;
        if (A.layerOf(it).locked) { skipped.push(it.name || it.uuid); continue; }
      }
      it.remove(); n++;
    }
    var res = { deleted: n };
    if (missing.length) { res.not_found = missing; A.warn('Nothing found for ' + missing.join(', ') + ': nothing deleted there.'); }
    if (skipped.length) { res.skipped_locked = skipped; A.warn(skipped.length + ' locked item(s) were not deleted' + (a.force ? ' (their layer is locked)' : ': pass force:true to unlock and delete them') + '.'); }
    return res;
  };
})($.global.AIA);
