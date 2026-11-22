#target illustrator
(function () {
  var f = new File("bench/results/m2/A3/M2-A3.ai");
  var doc = app.open(f), o = [];
  o.push("mode=" + doc.documentColorSpace + " artboards=" + doc.artboards.length + " rect=" + doc.artboards[0].artboardRect.join(","));
  var r = doc.artboards[0].artboardRect; o.push("ratio=" + ((r[2]-r[0])/(r[1]-r[3])).toFixed(4));
  o.push("raster=" + doc.rasterItems.length + " placed=" + doc.placedItems.length + " plugin=" + doc.pluginItems.length + " compound=" + doc.compoundPathItems.length + " legacyText=" + doc.legacyTextItems.length);
  var fonts = {}, rgb = 0, empty = 0, unnamed = 0;
  for (var i = 0; i < doc.textFrames.length; i++) { var t = doc.textFrames[i];
    if (!t.name) unnamed++; if (t.contents === "") empty++;
    for (var j = 0; j < t.textRanges.length; j++) { var ca = t.textRanges[j].characterAttributes; fonts[ca.textFont.name] = 1;
      var c = ca.fillColor; if (c.typename === "RGBColor") rgb++; } }
  for (i = 0; i < doc.pathItems.length; i++) { var p = doc.pathItems[i]; if (p.stroked && p.strokeColor.typename === "RGBColor") rgb++; if (p.filled && p.fillColor.typename === "RGBColor") rgb++; if (!p.name) unnamed++; }
  for (i = 0; i < doc.groupItems.length; i++) if (doc.groupItems[i].pageItems.length === 0) empty++;
  var ls = []; for (i = 0; i < doc.layers.length; i++) { var L = doc.layers[i], gs = []; for (j = 0; j < L.groupItems.length; j++) gs.push(L.groupItems[j].name + "(" + L.groupItems[j].pageItems.length + ")"); ls.push(L.name + ": " + gs.join(", ") + " loose=" + (L.pageItems.length - L.groupItems.length)); }
  var miss = []; for (var fn in fonts) { try { app.textFonts.getByName(fn); } catch (e) { miss.push(fn); } }
  o.push("fonts=" + (function(){var a=[];for(var k in fonts)a.push(k);return a.join(",");})() + " missing=" + miss.length + " rgb=" + rgb + " empty=" + empty + " unnamed=" + unnamed);
  o.push("layers: " + ls.join(" | "));
  var sw = []; for (i = 0; i < doc.swatches.length; i++) sw.push(doc.swatches[i].name); o.push("swatches=" + sw.join(","));
  var st = []; for (i = 0; i < doc.paragraphStyles.length; i++) st.push(doc.paragraphStyles[i].name); o.push("pstyles=" + st.join(","));
  var tx = []; var g = doc.layers.getByName("Main month").groupItems.getByName("Header"); for (i = 0; i < g.textFrames.length; i++) tx.push(g.textFrames[i].contents);
  o.push("header=" + tx.join("/"));
  doc.close(SaveOptions.DONOTSAVECHANGES);
  o.push("open docs now=" + app.documents.length);
  return o.join("\n");
})();
