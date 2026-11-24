// export (phase 3). ES3.
// Everything goes through doc.exportForScreens (PDF with a preset, PNG, JPEG, SVG, WebP): unlike saveAs/exportFile it
// does not rebind the document to the exported file (C6) and honours PDF presets incl. PDF/X-4 (verified 2026-11-22).
// PDF bleed: Illustrator ignores bleed settings from scripts (B2), so artboards are enlarged by the bleed for the
// export and restored afterwards; the server then sets TrimBox/BleedBox with pdf-lib.
(function (A) {
  function indices(doc, a) {
    var out = [], i;
    if (a.artboards === 'all') { for (i = 0; i < doc.artboards.length; i++) out.push(i); return out; }
    if (a.artboards instanceof Array) {
      for (i = 0; i < a.artboards.length; i++) {
        var k = a.artboards[i];
        if (k < 0 || k >= doc.artboards.length) throw new Error('Artboard ' + k + ' does not exist (document has ' + doc.artboards.length + ').');
        out.push(k);
      }
      return out;
    }
    return [doc.artboards.getActiveArtboardIndex()];
  }
  // fonts used by the document that are variable-font instances (quirk B10)
  function variableFonts() {
    var seen = {}, out = [];
    A.walk(function (it) {
      if (it.typename !== 'TextFrame') return;
      try {
        var tr = it.textRanges, n = Math.min(tr.length, 200);
        for (var i = 0; i < n; i++) {
          var f = tr[i].characterAttributes.textFont;
          if (seen[f.name]) continue;
          seen[f.name] = true;
          var av = f.axisVector;
          if (av && av.length) out.push(f.name);
        }
      } catch (e) {}
    });
    return out;
  }
  // export {variants} (0.2.1): show/hide layers by name for one variant and return their previous state; {restore}
  // puts it back. Hidden layers are also made non-printing so they can't end up in a PDF as hidden content.
  A.cmd.layer_state = function (a) {
    var doc = A.doc(), prev = [], i, L;
    if (a.restore) {
      for (i = 0; i < a.restore.length; i++) {
        try { L = A.layerByName(a.restore[i].name, doc); L.visible = a.restore[i].visible; L.printable = a.restore[i].printable; } catch (e) {}
      }
      return { restored: a.restore.length };
    }
    // resolve every name first: a wrong one must fail before anything changed
    var todo = [], lists = [[a.show, true], [a.hide, false]];
    for (i = 0; i < lists.length; i++) for (var k = 0; lists[i][0] && k < lists[i][0].length; k++) todo.push([A.layerByName(lists[i][0][k], doc), lists[i][1]]);
    for (i = 0; i < todo.length; i++) {
      L = todo[i][0];
      prev.push({ name: L.name, visible: L.visible, printable: L.printable });
      L.visible = todo[i][1]; L.printable = todo[i][1];
    }
    return { prev: prev };
  };
  // first step: what will be exported, and what we know about bleed
  A.cmd.export_prep = function (a) {
    var doc = A.doc(), idx = indices(doc, a), boards = [];
    for (var i = 0; i < idx.length; i++) {
      var r = doc.artboards[idx[i]].artboardRect;
      boards.push({ i: idx[i], name: doc.artboards[idx[i]].name, w_pt: r[2] - r[0], h_pt: r[1] - r[3] });
    }
    var path = null;
    try { if (String(doc.path) !== '') path = doc.fullName.fsName; } catch (e) {}
    return { doc: doc.name, path: path, saved: doc.saved, all: idx.length === doc.artboards.length, boards: boards,
      bleed: A.metaGet ? A.metaGet('bleed', doc) : null, variable_fonts: a.format === 'pdf' ? variableFonts() : [] };
  };

  function scaleOpts(o, a) {
    if (a.width) { o.scaleType = ExportForScreensScaleType.SCALEBYWIDTH; o.scaleTypeValue = a.width; }
    else if (a.dpi) { o.scaleType = ExportForScreensScaleType.SCALEBYRESOLUTION; o.scaleTypeValue = a.dpi; }
    else { o.scaleType = ExportForScreensScaleType.SCALEBYFACTOR; o.scaleTypeValue = a.scale || 1; }
  }
  function options(a) {
    var f = a.format, o, t;
    if (f === 'pdf') { o = new ExportForScreensPDFOptions(); if (a.preset) o.pdfPreset = a.preset; t = ExportForScreensType.SE_PDF; }
    else if (f === 'png') { o = new ExportForScreensOptionsPNG24(); scaleOpts(o, a); o.transparency = a.background === 'transparent'; o.antiAliasing = AntiAliasingMethod.TYPEOPTIMIZED; t = ExportForScreensType.SE_PNG24; }
    else if (f === 'jpg') { o = new ExportForScreensOptionsJPEG(); scaleOpts(o, a); t = ExportForScreensType.SE_JPEG80; } // the only JPEG type exportForScreens offers (29.1)
    else if (f === 'webp') { o = new ExportForScreensOptionsWebP(); scaleOpts(o, a); o.transparency = a.background !== 'white'; t = ExportForScreensType.SE_WEBP; }
    else if (f === 'svg') {
      o = new ExportForScreensOptionsWebOptimizedSVG();
      try { o.fontType = a.svg_text === 'outline' ? SVGFontType.OUTLINEFONT : SVGFontType.SVGFONT; } catch (e) {}
      try { o.rasterImageLocation = RasterImageLocation.EMBED; } catch (e) {}
      t = ExportForScreensType.SE_SVG;
    } else throw new Error('Unknown format "' + f + '". Use pdf, png, jpg, svg or webp.');
    return { opt: o, type: t };
  }

  // exportForScreens writes nothing into a folder that doesn't exist
  function folder(p) { var f = new Folder(p); if (!f.exists) f.create(); return f; }
  // second step: export into a.dir (one sub-folder per output so the server can map files to artboards)
  A.cmd['export'] = function (a) {
    var doc = A.doc(), wasSaved = doc.saved, idx = indices(doc, a), ot = options(a), out = [], i;
    var b = a.bleed_pt, saved = [], hid = a.format === 'pdf' ? [] : A.hideNonPrinting(doc);
    try {
      if (a.format === 'pdf' && b && (b[0] || b[1] || b[2] || b[3])) {
        for (i = 0; i < idx.length; i++) {
          var r = doc.artboards[idx[i]].artboardRect;
          saved.push([idx[i], r]);
          doc.artboards[idx[i]].artboardRect = [r[0] - b[0], r[1] + b[1], r[2] + b[2], r[3] - b[3]];
        }
      }
      var ios;
      if (a.format === 'pdf' && a.one_file && idx.length === doc.artboards.length) {
        ios = new ExportForScreensItemToExport(); ios.document = true; ios.artboards = '';
        doc.exportForScreens(folder(a.dir + '/doc'), ot.type, ot.opt, ios, 'p_');
        out.push({ sub: 'doc', artboards: idx });
      } else {
        for (i = 0; i < idx.length; i++) {
          ios = new ExportForScreensItemToExport(); ios.document = false; ios.artboards = String(idx[i] + 1);
          doc.exportForScreens(folder(a.dir + '/ab' + idx[i]), ot.type, ot.opt, ios, 'p_');
          out.push({ sub: 'ab' + idx[i], artboards: [idx[i]] });
        }
      }
    } finally {
      for (i = 0; i < saved.length; i++) doc.artboards[saved[i][0]].artboardRect = saved[i][1];
      A.restoreLayers(hid);
      if (wasSaved) { try { doc.saved = true; } catch (e) {} }
    }
    return { outputs: out };
  };
})($.global.AIA);
