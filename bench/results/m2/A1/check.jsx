var doc = app.documents.getByName("M2-A.ai"); var o = [];
o.push("mode=" + (doc.documentColorSpace == DocumentColorSpace.CMYK ? "CMYK" : "RGB") + " artboards=" + doc.artboards.length + " rect=" + doc.artboards[0].artboardRect);
o.push("layers=" + doc.layers.length + " " + doc.layers[0].name + " raster=" + doc.rasterItems.length + " placed=" + doc.placedItems.length + " compound=" + doc.compoundPathItems.length + " plugin=" + doc.pluginItems.length);
o.push("textFrames=" + doc.textFrames.length + " paths=" + doc.pathItems.length + " groups=" + doc.groupItems.length);
var fonts = {}, rgb = 0, empty = 0, unnamed = 0;
for (var i = 0; i < doc.textFrames.length; i++) { var t = doc.textFrames[i]; fonts[t.textRange.characterAttributes.textFont.name] = 1;
  if (t.textRange.characterAttributes.fillColor.typename === "RGBColor") rgb++; if (!t.contents) empty++; if (!t.name) unnamed++; }
for (var j = 0; j < doc.pathItems.length; j++) { var p = doc.pathItems[j]; if (p.strokeColor.typename === "RGBColor") rgb++; if (!p.name) unnamed++; }
for (var g = 0; g < doc.groupItems.length; g++) if (doc.groupItems[g].pageItems.length === 0) empty++;
var gn = []; for (var g2 = 0; g2 < doc.layers[0].groupItems.length; g2++) gn.push(doc.layers[0].groupItems[g2].name);
o.push("fonts=" + (function(){var a=[];for(var k in fonts)a.push(k);return a.join(",")})() + " rgb=" + rgb + " empty=" + empty + " unnamed=" + unnamed + " topGroups=" + gn.join("|") + " layerDirectItems=" + doc.layers[0].pageItems.length);
var ws=[]; var wn=doc.layers[0].groupItems.getByName("Main grid").groupItems.getByName("Week numbers"); for (var w=wn.textFrames.length-1;w>=0;w--) ws.push(wn.textFrames[w].contents);
o.push("weeks=" + ws.join(",") + " saved=" + doc.saved);
o.join("\n");
