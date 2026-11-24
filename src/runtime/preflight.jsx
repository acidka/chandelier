// preflight (phase 3). ES3. One walk over the document; hidden and non-printing content is skipped and counted
// (quirk A3); only real spot inks count as spot colours, global process swatches don't (A2); live text is a single
// info line, never a flood (A4); categories can be ignored.
(function (A) {
  var SEV = { missing_font: 'error', broken_link: 'error', rgb_in_cmyk: 'error', overset_text: 'error', white_overprint: 'error',
    registration_color: 'warning', low_res: 'warning', empty_text: 'warning', default_text: 'warning', off_artboard: 'warning',
    small_text: 'warning', hairline: 'warning', no_bleed: 'warning', low_contrast: 'warning', off_token: 'warning',
    spot_color: 'info', overprint: 'info', transparency: 'info', live_text: 'info', empty_group: 'info' };
  var RASTER_EXT = /\.(png|jpe?g|tiff?|psd|gif|bmp|webp)$/i;

  function nonPrinting(it) {
    var p = it, n = 0;
    while (p && n++ < 60) {
      if (p.typename === 'Layer') { if (!p.visible || !p.printable) return true; }
      else if (p.typename === 'Document') return false;
      else { try { if (p.hidden) return true; } catch (e) {} }
      p = p.parent;
    }
    return false;
  }
  function isWhite(c) {
    if (!c) return false;
    if (c.typename === 'CMYKColor') return c.cyan === 0 && c.magenta === 0 && c.yellow === 0 && c.black === 0;
    if (c.typename === 'GrayColor') return c.gray === 0;
    if (c.typename === 'RGBColor') return c.red === 255 && c.green === 255 && c.blue === 255;
    if (c.typename === 'SpotColor') { try { return c.tint === 0 || (c.spot.colorType !== ColorModel.SPOT && isWhite(c.spot.color)); } catch (e) { return false; } }
    return false;
  }

  // sRGB 0..255 of a colour (CMYK and spot inks approximated), or null for gradients/patterns
  function rgbOf(c) {
    if (!c) return null;
    var t = c.typename;
    if (t === 'RGBColor') return [c.red, c.green, c.blue];
    if (t === 'GrayColor') { var g = 255 * (1 - c.gray / 100); return [g, g, g]; }
    if (t === 'CMYKColor') { var k = 1 - c.black / 100; return [255 * (1 - c.cyan / 100) * k, 255 * (1 - c.magenta / 100) * k, 255 * (1 - c.yellow / 100) * k]; }
    if (t === 'SpotColor') {
      var b = null; try { b = rgbOf(c.spot.color); } catch (e) {}
      if (!b) return null;
      var f = c.tint / 100; return [255 - (255 - b[0]) * f, 255 - (255 - b[1]) * f, 255 - (255 - b[2]) * f];
    }
    return null;
  }
  function lum(rgb) {
    function ch(v) { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * ch(rgb[0]) + 0.7152 * ch(rgb[1]) + 0.0722 * ch(rgb[2]);
  }
  function contains(o, i) { return o[0] <= i[0] + 0.01 && o[1] >= i[1] - 0.01 && o[2] >= i[2] - 0.01 && o[3] <= i[3] + 0.01; }
  A.contrastRatio = function (c1, c2) { var a = lum(c1), b = lum(c2); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };

  A.cmd.preflight = function (a) {
    var doc = A.doc(), cmyk = doc.documentColorSpace === DocumentColorSpace.CMYK, i;
    var ignore = {}, max = a.max_items || 20, minDpi = a.min_dpi || 300, minText = a.min_text_pt === undefined ? 5 : a.min_text_pt;
    var hair = a.hairline_pt === undefined ? 0.25 : a.hairline_pt;
    if (a.ignore) for (i = 0; i < a.ignore.length; i++) ignore[a.ignore[i]] = true;
    var linked = [], checks = {}, skipped = 0, plates = { C: 0, M: 0, Y: 0, K: 0 }, spotsUsed = {}, edgeItems = 0, live = 0;
    // contrast (RGB documents): items in walk order = top to bottom; texts and opaque filled shapes under them
    var order = 0, texts = [], grounds = [], doContrast = (!cmyk || a.contrast === true) && a.contrast !== false && !ignore.low_contrast;
    // brand tokens (0.2.1): colours (swatch names or colour specs; tints of an allowed swatch pass), fonts, text sizes
    var tok = null, offs = [];
    if (a.tokens && !ignore.off_token) {
      tok = { swatch: {}, spec: {}, fonts: null, sizes: a.tokens.sizes || null, colors: !!a.tokens.colors };
      var tc0 = a.tokens.colors || [];
      for (i = 0; i < tc0.length; i++) {
        var ts = String(tc0[i]);
        if (/^swatch:/.test(ts)) tok.swatch[ts.slice(7).replace(/@\d+$/, '')] = true;
        else { try { tok.spec[A.colorStr(A.color(ts))] = true; } catch (e) { tok.spec[ts] = true; } }
      }
      if (a.tokens.fonts) {
        tok.fonts = {};
        for (i = 0; i < a.tokens.fonts.length; i++) { var tf = a.tokens.fonts[i]; try { tf = A.font(tf).name; } catch (e) {} tok.fonts[tf] = true; }
      }
    }
    function colorOk(c) {
      var s = A.colorStr(c);
      if (!s || s === 'none') return true;
      if (/^swatch:/.test(s)) {
        if (tok.swatch[s.slice(7).replace(/@\d+$/, '')]) return true;
        try { if (tok.spec[A.colorStr(c.spot.color)]) return true; } catch (e) {}
        return false;
      }
      return !!tok.spec[s];
    }
    function off(what) { for (var q = 0; q < offs.length; q++) if (offs[q] === what) return; offs.push(what); }
    function hit(cat, it, detail) {
      if (ignore[cat]) return;
      var c = checks[cat];
      if (!c) c = checks[cat] = { severity: SEV[cat], count: 0, items: [] };
      c.count++;
      if (c.items.length < max) {
        var o = {};
        if (it) { try { o.uuid = it.uuid; if (it.name) o.name = it.name; o.type = A.kindOf(it.typename); } catch (e) {} }
        if (detail !== undefined) o.detail = detail;
        c.items.push(o);
      }
    }
    var installed = {};
    function fontOk(name) {
      if (installed.hasOwnProperty(name)) return installed[name];
      var ok = true;
      try { app.textFonts.getByName(name); } catch (e) { ok = false; }
      installed[name] = ok;
      return ok;
    }
    function inks(c) {
      if (!c) return;
      var t = c.typename;
      if (t === 'CMYKColor') { if (c.cyan > 0) plates.C++; if (c.magenta > 0) plates.M++; if (c.yellow > 0) plates.Y++; if (c.black > 0) plates.K++; }
      else if (t === 'GrayColor') { if (c.gray > 0) plates.K++; }
      else if (t === 'SpotColor') {
        try {
          var ct = c.spot.colorType;
          if (ct === ColorModel.SPOT) spotsUsed[c.spot.name] = true;
          else if (ct === ColorModel.PROCESS) inks(c.spot.color);
          else { plates.C++; plates.M++; plates.Y++; plates.K++; }
        } catch (e) {}
      } else if (t === 'GradientColor') { try { var st = c.gradient.gradientStops; for (var k = 0; k < st.length; k++) inks(st[k].color); } catch (e) {} }
    }
    function paint(it, p, isText) {
      // p: a PathItem, or a TextFrame's character attributes
      var fills = [], strokes = [];
      if (isText) { fills.push(p.fillColor); if (p.strokeWeight > 0) strokes.push(p.strokeColor); }
      else { if (p.filled) fills.push(p.fillColor); if (p.stroked) strokes.push(p.strokeColor); }
      var all = fills.concat(strokes), k;
      for (k = 0; k < all.length; k++) {
        var c = all[k];
        if (!c) continue;
        inks(c);
        if (tok && tok.colors && !colorOk(c)) off((k < fills.length ? 'fill ' : 'stroke ') + A.colorStr(c));
        if (cmyk && (c.typename === 'RGBColor' || c.typename === 'LabColor')) hit('rgb_in_cmyk', it, (k < fills.length ? 'fill ' : 'stroke ') + A.colorStr(c));
        if (c.typename === 'SpotColor') { try { if (c.spot.colorType === ColorModel.REGISTRATION) hit('registration_color', it, k < fills.length ? 'fill' : 'stroke'); } catch (e) {} }
      }
      var opFill = isText ? p.overprintFill : p.fillOverprint, opStroke = isText ? p.overprintStroke : p.strokeOverprint;
      if ((opFill && fills.length) || (opStroke && strokes.length)) {
        var white = (opFill && fills.length && isWhite(fills[0])) || (opStroke && strokes.length && isWhite(strokes[0]));
        if (white) hit('white_overprint', it, 'white set to overprint: it disappears in print');
        else hit('overprint', it, (opFill ? 'fill' : '') + (opFill && opStroke ? '+' : '') + (opStroke ? 'stroke' : ''));
      }
      if (!isText && p.stroked && p.strokeWidth > 0 && p.strokeWidth < hair) hit('hairline', it, p.strokeWidth + ' pt');
    }
    var abs = [];
    for (i = 0; i < doc.artboards.length; i++) abs.push(doc.artboards[i].artboardRect);
    function onSomeArtboard(b) { for (var k = 0; k < abs.length; k++) if (A.intersects(b, abs[k])) return true; return false; }
    function crossesEdge(b) {
      for (var k = 0; k < abs.length; k++) {
        var r = abs[k];
        if (!A.intersects(b, r)) continue;
        if (b[0] < r[0] - 0.01 || b[1] > r[1] + 0.01 || b[2] > r[2] + 0.01 || b[3] < r[3] - 0.01) return true;
      }
      return false;
    }

    A.walk(function (it) {
      order++;
      if (!a.include_non_printing && nonPrinting(it)) { skipped++; return; }
      offs = [];
      walkOne(it);
      if (offs.length) hit('off_token', it, offs.join('; '));
    });
    function walkOne(it) {
      var t = it.typename;
      if (doContrast && (t === 'PathItem' || t === 'CompoundPathItem')) {
        try {
          var pp = t === 'PathItem' ? it : it.pathItems[0];
          if (pp.filled && (t === 'CompoundPathItem' || pp.closed) && it.opacity >= 100) {
            var gc = rgbOf(pp.fillColor);
            if (gc) grounds.push({ n: order, b: it.geometricBounds, c: gc });
          }
        } catch (e) {}
      }
      try {
        if (it.parent.typename === 'Layer') {
          var vb = A.vb(it);
          if (!onSomeArtboard(vb)) hit('off_artboard', it);
          else if (crossesEdge(vb)) edgeItems++;
        }
      } catch (e) {}
      try { if (it.opacity < 100 || String(it.blendingMode) !== 'BlendModes.NORMAL') hit('transparency', it, 'opacity ' + it.opacity + ', ' + String(it.blendingMode).replace('BlendModes.', '').toLowerCase()); } catch (e) {}
      if (t === 'PathItem') paint(it, it, false);
      else if (t === 'CompoundPathItem') { if (it.pathItems.length) paint(it, it.pathItems[0], false); }
      else if (t === 'GroupItem') { if (!it.pageItems.length) hit('empty_group', it); }
      else if (t === 'TextFrame') {
        live++;
        if (!it.contents.length) { hit('empty_text', it); return; }
        if (A.overset(it)) hit('overset_text', it);
        var tr = it.textRanges, n = Math.min(tr.length, 50), fonts = {}, allDefault = true, small = null, k;
        for (k = 0; k < n; k++) {
          var ca = tr[k].characterAttributes, fname;
          try { fname = ca.textFont.name; } catch (e) { fname = '?'; }
          if (!fonts[fname]) { fonts[fname] = true; if (!fontOk(fname)) hit('missing_font', it, fname); if (tok && tok.fonts && !tok.fonts[fname]) off('font ' + fname); }
          if (tok && tok.sizes) { var sok = false; for (var sq = 0; sq < tok.sizes.length; sq++) if (Math.abs(tok.sizes[sq] - ca.size) < 0.01) sok = true; if (!sok) off('size ' + (Math.round(ca.size * 100) / 100) + ' pt'); }
          if (!(ca.size === 12 && /^MyriadPro-Regular$/.test(fname))) allDefault = false;
          if (minText && ca.size < minText && (small === null || ca.size < small)) small = ca.size;
          if (k === 0 || k === n - 1) paint(it, ca, true);
          if (k === 0 && doContrast) { try { var tc = rgbOf(ca.fillColor); if (tc) texts.push({ n: order, it: it, b: it.geometricBounds, c: tc, size: ca.size }); } catch (e) {} }
        }
        if (small !== null) hit('small_text', it, small + ' pt');
        if (allDefault && !it.name) hit('default_text', it, '12 pt Myriad Pro, unnamed: looks like a leftover of a failed text creation (A8)');
      } else if (t === 'PlacedItem') {
        var f = null;
        try { f = it.file; } catch (e) { f = null; }
        if (!f || !f.exists) { hit('broken_link', it, f ? f.fsName : 'file missing'); return; }
        if (RASTER_EXT.test(f.name)) { checkRes(it); linked.push({ uuid: it.uuid, name: it.name || undefined, path: f.fsName }); }
      } else if (t === 'RasterItem') {
        checkRes(it);
        // embedding converts RGB images to the document colour space, so this only catches older files
        try { if (cmyk && it.imageColorSpace === ImageColorSpace.RGB) hit('rgb_in_cmyk', it, 'RGB image'); } catch (e) {}
      }
    }
    // each text against the nearest opaque filled shape below it that covers it (none: white paper)
    if (doContrast && texts.length && texts.length * (grounds.length + 1) <= 2000000) {
      for (i = 0; i < texts.length; i++) {
        var tx = texts[i], bg = [255, 255, 255];
        for (var gi = 0; gi < grounds.length; gi++) {
          var gd = grounds[gi];
          if (gd.n > tx.n && contains(gd.b, tx.b)) { bg = gd.c; break; }
        }
        var ratio = A.contrastRatio(tx.c, bg), need = tx.size >= 18 ? 3 : 4.5;
        if (ratio < need) hit('low_contrast', tx.it, (Math.round(ratio * 100) / 100) + ':1 < ' + need + ':1 (WCAG AA)');
      }
    }
    function checkRes(it) {
      try {
        var m = it.matrix, sx = Math.sqrt(m.mValueA * m.mValueA + m.mValueB * m.mValueB), sy = Math.sqrt(m.mValueC * m.mValueC + m.mValueD * m.mValueD);
        if (sx > 0 && sy > 0) { var ppi = Math.round(Math.min(72 / sx, 72 / sy)); if (ppi < minDpi) hit('low_res', it, ppi + ' ppi < ' + minDpi); }
      } catch (e) {}
    }
    // spot inks: defined ones, used or not (only ColorModel.SPOT; registration and global process excluded: A2/B5)
    var spotList = [];
    for (i = 0; i < doc.spots.length; i++) {
      try {
        var sp = doc.spots[i];
        if (sp.colorType !== ColorModel.SPOT) continue;
        spotList.push(sp.name);
        hit('spot_color', null, sp.name + (spotsUsed[sp.name] ? ' (used)' : ' (defined, not used)'));
      } catch (e) {}
    }
    if (live && !ignore.live_text) { checks.live_text = { severity: 'info', count: live, items: [], note: 'live (not outlined) text frames: fine for editable templates; outline them if the print shop needs it' }; }
    var summary = { errors: 0, warnings: 0, info: 0 };
    for (var key in checks) if (checks.hasOwnProperty(key)) {
      var sv = checks[key].severity;
      if (sv === 'error') summary.errors += checks[key].count; else if (sv === 'warning') summary.warnings += checks[key].count; else summary.info += checks[key].count;
    }
    var usedPlates = [];
    if (plates.C) usedPlates.push('Cyan'); if (plates.M) usedPlates.push('Magenta'); if (plates.Y) usedPlates.push('Yellow'); if (plates.K) usedPlates.push('Black');
    var us = []; for (var s in spotsUsed) if (spotsUsed.hasOwnProperty(s)) us.push(s);
    return { ok: summary.errors === 0, summary: summary, color_space: cmyk ? 'CMYK' : 'RGB', skipped_non_printing: skipped,
      inks: { process: usedPlates, spot: us, spot_defined: spotList }, edge_items: edgeItems, checks: checks, linked: cmyk ? linked : [], max: max,
      bleed: A.metaGet ? A.metaGet('bleed', doc) : null, path: (function () { try { return String(doc.path) !== '' ? doc.fullName.fsName : null; } catch (e) { return null; } })(), saved: doc.saved };
  };
})($.global.AIA);
