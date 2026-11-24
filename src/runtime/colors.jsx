// swatches, fonts (phase 2). ES3.
// Special swatches are matched by colour TYPE, never by their localised names (quirk B5: "[Registration]" is localised).
(function (A) {
  function kindOf(sw) {
    var c = sw.color, t = c.typename;
    if (t === 'NoColor') return 'none';
    if (t === 'SpotColor') {
      var ct = c.spot.colorType;
      if (ct === ColorModel.REGISTRATION) return 'registration';
      return ct === ColorModel.SPOT ? 'spot' : 'global';
    }
    if (t === 'GradientColor') return 'gradient';
    if (t === 'PatternColor') return 'pattern';
    return 'process';
  }
  function info(sw, group) {
    var k = kindOf(sw), o = { name: sw.name, kind: k };
    if (k === 'global' || k === 'spot') o.color = A.colorStr(sw.color.spot.color);
    else if (k === 'process') o.color = A.colorStr(sw.color);
    else if (k === 'gradient') {
      var g = sw.color.gradient, st = [];
      for (var i = 0; i < g.gradientStops.length; i++) { var s = g.gradientStops[i]; st.push({ color: A.colorStr(s.color), at: Math.round(s.rampPoint * 10) / 10 }); }
      o.type = g.type === GradientType.RADIAL ? 'radial' : 'linear';
      o.stops = st;
    }
    if (group) o.group = group;
    return o;
  }
  function groupOfMap(doc) {
    var m = {}, i, j;
    for (i = 1; i < doc.swatchGroups.length; i++) {
      var g = doc.swatchGroups[i], all = g.getAllSwatches();
      for (j = 0; j < all.length; j++) m[all[j].name] = g.name;
    }
    return m;
  }
  function swatchGroup(doc, name) {
    for (var i = 1; i < doc.swatchGroups.length; i++) if (doc.swatchGroups[i].name === name) return doc.swatchGroups[i];
    var g = doc.swatchGroups.add(); g.name = name; return g;
  }
  function findSwatch(doc, name) { try { return doc.swatches.getByName(name); } catch (e) { return null; } }

  // global / spot swatch from a colour spec (create or update); returns the Swatch
  function spotSwatch(doc, name, spec, spot) {
    var base = A.color(spec), sp;
    if (base.typename === 'SpotColor') base = base.spot.color;
    if (base.typename !== 'CMYKColor' && base.typename !== 'RGBColor' && base.typename !== 'GrayColor' && base.typename !== 'LabColor') throw new Error('A ' + (spot ? 'spot' : 'global') + ' swatch needs a plain colour (cmyk/#rgb/gray), not ' + spec + '.');
    A.retry(function () {
      sp = A.namedSpot(doc, name);
      sp.colorType = spot ? ColorModel.SPOT : ColorModel.PROCESS;
      sp.color = base;
    });
    return findSwatch(doc, name);
  }
  function makeGradient(doc, a) {
    if (!a.stops || a.stops.length < 2) throw new Error('A gradient needs stops: [{color, at}, ...] (2 or more).');
    var g;
    try { g = doc.gradients.getByName(a.name); } catch (e) { g = doc.gradients.add(); g.name = a.name; }
    g.type = a.type === 'radial' ? GradientType.RADIAL : GradientType.LINEAR;
    while (g.gradientStops.length < a.stops.length) g.gradientStops.add();
    while (g.gradientStops.length > a.stops.length) g.gradientStops[g.gradientStops.length - 1].remove();
    for (var i = 0; i < a.stops.length; i++) {
      var s = a.stops[i], st = g.gradientStops[i];
      st.rampPoint = s.at === undefined ? 100 * i / (a.stops.length - 1) : s.at;
      st.color = A.color(s.color);
      if (s.opacity !== undefined) st.opacity = s.opacity;
      if (s.midpoint !== undefined && i < a.stops.length - 1) st.midPoint = s.midpoint;
    }
    return findSwatch(doc, a.name);
  }

  A.cmd.swatches = function (a) {
    var doc = A.doc(), act = a.action || 'list', i, sw, out = [];
    if (act === 'list') {
      var gm = groupOfMap(doc), lim = a.limit || 200;
      for (i = 0; i < doc.swatches.length; i++) {
        var s = doc.swatches[i], inf = info(s, gm[s.name]);
        if (a.kind && inf.kind !== a.kind) continue;
        if (a.group && inf.group !== a.group) continue;
        if (out.length < lim) out.push(inf);
      }
      return { count: out.length, swatches: out };
    }
    if (act === 'add' || act === 'update') {
      if (!a.name) throw new Error(act + ' needs name.');
      var kind = a.kind || 'global';
      sw = findSwatch(doc, a.name);
      if (act === 'update' && !sw) throw new Error('No swatch named "' + a.name + '".');
      if (act === 'update' && !a.kind) kind = kindOf(sw);
      if (kind === 'gradient') sw = makeGradient(doc, a);
      else if (kind === 'global' || kind === 'spot') { if (a.color === undefined && act === 'update') { /* rename only */ } else sw = spotSwatch(doc, a.name, a.color, kind === 'spot'); }
      else if (kind === 'process') {
        if (a.color === undefined) throw new Error('process swatch needs color.');
        if (!sw) { sw = doc.swatches.add(); sw.name = a.name; }
        sw.color = A.color(a.color);
      } else throw new Error('kind must be global, spot, process or gradient.');
      if (a.group) swatchGroup(doc, a.group).addSwatch(sw);
      if (a.new_name) { if (kindOf(sw) === 'global' || kindOf(sw) === 'spot') sw.color.spot.name = a.new_name; else sw.name = a.new_name; sw = findSwatch(doc, a.new_name) || sw; }
      return info(sw, a.group || groupOfMap(doc)[sw.name]);
    }
    if (act === 'remove') {
      var names = a.names || (a.name ? [a.name] : []), n = 0, missing = [];
      for (i = 0; i < names.length; i++) {
        sw = findSwatch(doc, names[i]);
        if (!sw) { missing.push(names[i]); continue; }
        var k = kindOf(sw);
        if (k === 'none' || k === 'registration') throw new Error('Swatch "' + names[i] + '" is a built-in swatch and cannot be removed.');
        if (k === 'global' || k === 'spot') { try { sw.color.spot.remove(); } catch (e) { sw.remove(); } } else sw.remove();
        n++;
      }
      if (missing.length) A.warn('Not found: ' + missing.join(', '));
      return { removed: n };
    }
    if (act === 'clean_defaults') {
      // keep [None], [Registration] (by type), global + spot swatches, gradients/patterns in use, and "keep" names
      var keep = {}, used = {};
      if (a.keep) for (i = 0; i < a.keep.length; i++) keep[a.keep[i]] = true;
      A.walk(function (it) {
        var ps = A.paintables(it);
        for (var j = 0; j < ps.length; j++) {
          var p = ps[j], cs = [];
          try { if (p.typename === 'TextFrame') { cs.push(p.textRange.characterAttributes.fillColor); } else { if (p.filled) cs.push(p.fillColor); if (p.stroked) cs.push(p.strokeColor); } } catch (e) {}
          for (var q = 0; q < cs.length; q++) {
            if (cs[q].typename === 'GradientColor') used[cs[q].gradient.name] = true;
            if (cs[q].typename === 'PatternColor') used[cs[q].pattern.name] = true;
          }
        }
      });
      var removed = 0;
      for (i = doc.swatches.length - 1; i >= 0; i--) {
        sw = doc.swatches[i];
        var kk = kindOf(sw);
        if (keep[sw.name] || kk === 'none' || kk === 'registration' || kk === 'global' || kk === 'spot') continue;
        if ((kk === 'gradient' || kk === 'pattern') && used[sw.name]) continue;
        try { sw.remove(); removed++; } catch (e) {}
      }
      var groupsRemoved = 0;
      for (i = doc.swatchGroups.length - 1; i >= 1; i--) {
        if (!doc.swatchGroups[i].getAllSwatches().length) { try { doc.swatchGroups[i].remove(); groupsRemoved++; } catch (e) {} }
      }
      return { removed: removed, groups_removed: groupsRemoved, left: doc.swatches.length };
    }
    if (act === 'import') {
      // swatches read from an .ase file on the Node side: [{name, color, kind, group}]
      var made = 0, upd = 0;
      for (i = 0; i < a.items.length; i++) {
        var it = a.items[i], kd = a.kind || it.kind, ex = !!findSwatch(doc, it.name), gname = a.group || it.group;
        if (kd === 'process') {
          sw = findSwatch(doc, it.name);
          if (!sw) { sw = doc.swatches.add(); sw.name = it.name; }
          sw.color = A.color(it.color);
        } else sw = spotSwatch(doc, it.name, it.color, kd === 'spot');
        if (gname) swatchGroup(doc, gname).addSwatch(sw);
        if (ex) upd++; else made++;
      }
      return { added: made, updated: upd, group: a.group || undefined };
    }
    if (act === 'recolor') return recolor(a, doc);
    if (act === 'convert') {
      // Edit > Edit Colors > Convert to Grayscale / CMYK / RGB on the items (the document's colour profiles convert);
      // without refs cmyk / rgb also switch the document colour mode (File > Document Color Mode)
      var CMD = { gray: 'Colors7', cmyk: 'Colors8', rgb: 'Colors9' }, m = a.mode, sw0 = false;
      if (!CMD[m]) throw new Error('convert needs mode: "cmyk", "rgb" or "gray".');
      if ((a.refs === undefined || a.refs === null) && m !== 'gray') {
        var want = m === 'cmyk' ? DocumentColorSpace.CMYK : DocumentColorSpace.RGB;
        if (doc.documentColorSpace !== want) { app.executeMenuCommand(m === 'cmyk' ? 'doc-color-cmyk' : 'doc-color-rgb'); sw0 = true; }
      }
      var its = a.refs !== undefined && a.refs !== null ? A.refs(a.refs) : A.topLevel(doc), sel = 0, skip = 0;
      doc.selection = null;
      for (i = 0; i < its.length; i++) { try { its[i].selected = true; sel++; } catch (e) { skip++; } }
      A.syncSelection();
      if (sel) app.executeMenuCommand(CMD[m]);
      doc.selection = null;
      var res = { converted: sel, mode: m, color_space: doc.documentColorSpace === DocumentColorSpace.CMYK ? 'CMYK' : 'RGB' };
      if (sw0) res.document_mode_changed = true;
      if (skip) res.skipped_locked = skip;
      return res;
    }
    throw new Error('Unknown swatches action "' + act + '".');
  };

  // -- recolor (0.3): every fill, stroke, text run and gradient stop -> the nearest target swatch (CIE76 dE in Lab;
  // CMYK is approximated without a profile, the same way on both sides) or an explicit map. Recolor Artwork has no
  // scripting API, so this walks the items.
  function rgbOf(c) {
    var t = c.typename;
    if (t === 'RGBColor') return [c.red, c.green, c.blue];
    if (t === 'GrayColor') { var g = 255 * (1 - c.gray / 100); return [g, g, g]; }
    if (t === 'CMYKColor') { var k = 1 - c.black / 100; return [255 * (1 - c.cyan / 100) * k, 255 * (1 - c.magenta / 100) * k, 255 * (1 - c.yellow / 100) * k]; }
    return null;
  }
  function labOf(c) {
    if (!c) return null;
    var t = c.typename;
    if (t === 'LabColor') return [c.l, c.a, c.b];
    if (t === 'SpotColor') {
      var base = labOf(c.spot.color), f = c.tint / 100;
      if (!base) return null;
      return [100 - (100 - base[0]) * f, base[1] * f, base[2] * f];
    }
    var rgb = rgbOf(c);
    if (!rgb) return null;
    function lin(v) { v = v / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    var R = lin(rgb[0]), G = lin(rgb[1]), B = lin(rgb[2]);
    var X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
    function fn(v) { return v > 0.008856 ? Math.pow(v, 1 / 3) : 7.787 * v + 16 / 116; }
    var fx = fn(X), fy = fn(Y), fz = fn(Z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  function dE(p, q) { return Math.sqrt((p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1]) + (p[2] - q[2]) * (p[2] - q[2])); }

  function recolor(a, doc) {
    var targets = [], tset = {}, i, j, gm = groupOfMap(doc);
    function addTarget(sw) {
      var k = kindOf(sw);
      if (k !== 'global' && k !== 'spot' && k !== 'process') return;
      if (tset[sw.name]) return;
      tset[sw.name] = true;
      var base = k === 'process' ? sw.color : sw.color.spot.color;
      targets.push({ name: sw.name, kind: k, sw: sw, lab: labOf(base) });
    }
    if (a.to) {
      for (i = 0; i < a.to.length; i++) {
        var nm = String(a.to[i]).replace(/^swatch:/, '');
        if (nm.indexOf('group:') === 0) {
          var gn = nm.slice(6), found = false;
          for (j = 0; j < doc.swatches.length; j++) if (gm[doc.swatches[j].name] === gn) { addTarget(doc.swatches[j]); found = true; }
          if (!found) throw new Error('No swatches in a group named "' + gn + '".');
        } else { var s0 = findSwatch(doc, nm); if (!s0) throw new Error('No swatch named "' + nm + '".'); addTarget(s0); }
      }
    } else if (!a.map) {
      for (j = 0; j < doc.swatches.length; j++) { var kk = kindOf(doc.swatches[j]); if (kk === 'global' || kk === 'spot') addTarget(doc.swatches[j]); }
    }
    if (!targets.length && !a.map) throw new Error('No target swatches: give to [names or "group:Name"], or map {from: to}, or add global swatches first.');
    var map = {}, k2;
    if (a.map) for (k2 in a.map) if (a.map.hasOwnProperty(k2)) map[A.colorStr(A.color(k2))] = a.map[k2];
    var tol = a.tolerance === undefined ? 20 : a.tolerance, dry = !!a.dry_run;
    var seen = {}, order = [], changed = 0, locked = 0;
    // decide once per distinct colour
    function plan(c) {
      var key = A.colorStr(c);
      if (seen.hasOwnProperty(key)) return seen[key];
      var p = { from: key, uses: 0, to: null };
      seen[key] = p; order.push(key);
      if (c.typename === 'SpotColor') {
        var ct = c.spot.colorType;
        if (ct === ColorModel.REGISTRATION || tset[c.spot.name]) { p.keep = true; return p; }
      }
      if (map.hasOwnProperty(key)) { p.to = map[key]; p.spec = map[key]; return p; }
      if (!targets.length) { p.keep = true; return p; }
      // a tint of a swatch is matched by its swatch's colour (and stays a tint)
      var L = labOf(c.typename === 'SpotColor' ? c.spot.color : c);
      if (!L) { p.keep = true; return p; }
      var best = null, bd = 1e9;
      for (var q = 0; q < targets.length; q++) { if (!targets[q].lab) continue; var d = dE(L, targets[q].lab); if (d < bd) { bd = d; best = targets[q]; } }
      p.de = Math.round(bd * 10) / 10;
      if (!best || bd > tol) { p.nearest = best ? best.name : null; return p; }
      p.to = best.name;
      // a tint of a global/spot swatch stays a tint of the new one
      var tint = c.typename === 'SpotColor' ? c.tint : 100;
      p.spec = best.kind === 'process' ? best.sw.color : 'swatch:' + best.name + (Math.round(tint) === 100 ? '' : '@' + Math.round(tint));
      return p;
    }
    function apply(c, set) {
      if (!c || c.typename === 'NoColor' || c.typename === 'PatternColor') return;
      if (c.typename === 'GradientColor') { grads[c.gradient.name] = c.gradient; return; }
      var p = plan(c);
      p.uses++;
      if (p.keep || !p.spec || dry) return;
      set(typeof p.spec === 'string' ? A.color(p.spec) : p.spec);
      changed++;
    }
    var grads = {};
    function paintItem(it) {
      var t = it.typename;
      if (t === 'PathItem') {
        if (it.filled) apply(it.fillColor, function (c) { it.fillColor = c; });
        if (it.stroked) apply(it.strokeColor, function (c) { it.strokeColor = c; });
      } else if (t === 'TextFrame') {
        // textRanges holds one range per character: equal neighbours become one span, recoloured in one write
        var chars = it.textRanges, n = chars.length, spans = [], r, cur = null;
        for (r = 0; r < n; r++) {
          var ca = chars[r].characterAttributes, f = ca.fillColor, sk = ca.strokeWeight > 0 ? ca.strokeColor : null;
          var key = A.colorStr(f) + '|' + (sk ? A.colorStr(sk) : '');
          if (cur && cur.key === key) cur.len++;
          else { cur = { key: key, at: r, len: 1, fill: f, stroke: sk }; spans.push(cur); }
        }
        for (r = 0; r < spans.length; r++) (function (sp) {
          function range() { var g = it.textRanges[sp.at]; if (sp.len > 1) g.length = sp.len; return g.characterAttributes; }
          apply(sp.fill, function (c) { range().fillColor = c; });
          if (sp.stroke) apply(sp.stroke, function (c) { range().strokeColor = c; });
        })(spans[r]);
      } else if (t === 'CompoundPathItem') {
        for (var m = 0; m < it.pathItems.length; m++) paintItem(it.pathItems[m]);
      }
    }
    // locked items, or items in a locked / hidden layer or a locked group, can't be changed: counted, not touched
    function blocked(it) {
      if (it.locked) return true;
      for (var q = it.parent; q && q.typename !== 'Document'; q = q.parent) {
        if (q.typename === 'Layer' && (q.locked || !q.visible)) return true;
        if (q.typename === 'GroupItem' && q.locked) return true;
      }
      return false;
    }
    function visit(it) {
      if (!dry && it.typename !== 'GroupItem' && blocked(it)) { locked++; return; }
      paintItem(it);
    }
    var roots = a.refs !== undefined ? A.refs(a.refs) : null;
    if (roots) { for (i = 0; i < roots.length; i++) { visit(roots[i]); if (roots[i].typename === 'GroupItem') A.walk(visit, roots[i]); } }
    else A.walk(visit);
    // gradients are document-wide: their stops are recoloured once
    var gcount = 0, gn2;
    for (gn2 in grads) if (grads.hasOwnProperty(gn2)) {
      gcount++;
      var st = grads[gn2].gradientStops;
      for (j = 0; j < st.length; j++) (function (stop) { apply(stop.color, function (c) { stop.color = c; }); })(st[j]);
    }
    var colors = [], unmatched = [];
    for (i = 0; i < order.length; i++) {
      var p = seen[order[i]];
      if (p.keep) continue;
      if (p.to) colors.push({ from: p.from, to: p.to, de: p.de, uses: p.uses });
      else unmatched.push({ color: p.from, nearest: p.nearest, de: p.de, uses: p.uses });
    }
    var res = { changed: changed, colors: colors, unmatched: unmatched, tolerance: tol, targets: targets.length };
    if (dry) { res.dry_run = true; delete res.changed; }
    if (gcount) res.gradients = gcount;
    if (locked) res.skipped_locked = locked;
    return res;
  }

  // -- fonts ----------------------------------------------------------------------------
  A.cmd.fonts = function (a) {
    if (a.resolve !== undefined) {
      var f = A.font(a.resolve);
      return { asked: a.resolve, name: f.name, family: f.family, style: f.style };
    }
    var q = a.query !== undefined ? String(a.query).toLowerCase().replace(/[\s\-_]+/g, '') : null;
    var out = [], lim = a.limit || 50, total = 0, fams = {};
    for (var i = 0; i < app.textFonts.length; i++) {
      var tf = app.textFonts[i];
      if (a.family !== undefined && String(tf.family).toLowerCase() !== String(a.family).toLowerCase()) continue;
      if (q !== null) {
        var hay = (tf.name + '|' + tf.family + tf.style).toLowerCase().replace(/[\s\-_]+/g, '');
        if (hay.indexOf(q) < 0) continue;
      }
      total++;
      if (a.families_only) { if (!fams[tf.family]) { fams[tf.family] = true; if (out.length < lim) out.push(tf.family); } continue; }
      if (out.length < lim) out.push({ name: tf.name, family: tf.family, style: tf.style });
    }
    var res = { total: total, fonts: out };
    if (out.length < (a.families_only ? out.length : total)) res.more = 'narrow the query or raise limit';
    return res;
  };
})($.global.AIA);
