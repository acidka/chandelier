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
    throw new Error('Unknown swatches action "' + act + '".');
  };

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
