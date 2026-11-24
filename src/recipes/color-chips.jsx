// recipe: color-chips - colour chips in a grid with name and colour values under each; default: the document's global and spot swatches
// args: {colors: ["swatch:Navy", {name, color: "cmyk(...)"}, ...], x: 0, y: 0, cols: 6, chip_w: 20 mm, chip_h: 20 mm (session units), gap: 4 mm, labels: true, label_size: 7 (pt), font: "Arial", make_swatches: false (plain colours become global swatches), name: "Colour chips"}
var o = arguments[0] || {};
var doc = AIA.doc(), list = [], i, U = AIA.u(1);
function fromSwatches() {
  for (var k = 0; k < doc.swatches.length; k++) {
    var sw = doc.swatches[k], col = sw.color;
    if (col.typename !== 'SpotColor') continue;
    var ct = col.spot.colorType;
    if (ct === ColorModel.REGISTRATION) continue;
    list.push({ name: sw.name, color: 'swatch:' + sw.name, spec: AIA.colorStr(col.spot.color), kind: ct === ColorModel.SPOT ? 'spot' : 'global' });
  }
}
if (o.colors && o.colors.length) {
  for (i = 0; i < o.colors.length; i++) {
    var e = o.colors[i], nm, cs;
    if (typeof e === 'string') { cs = e; nm = /^swatch:/.test(e) ? e.slice(7).replace(/@\d+$/, '') : e; }
    else { cs = e.color; nm = e.name || e.color; }
    if (o.make_swatches && !/^swatch:/.test(cs) && e.name) { AIA.swatch(e.name, cs); cs = 'swatch:' + e.name; }
    var spec = cs;
    if (/^swatch:/.test(cs)) { try { spec = AIA.colorStr(AIA.color(cs).spot.color); } catch (x) {} }
    list.push({ name: nm, color: cs, spec: spec });
  }
} else fromSwatches();
if (!list.length) throw new Error('No colours: give colors, or add global or spot swatches to the document first.');
var cols = o.cols || 6, cw = o.chip_w || AIA.mm(20) / U, ch = o.chip_h || AIA.mm(20) / U, gap = o.gap === undefined ? AIA.mm(4) / U : o.gap;
var ls = o.label_size || 7, labels = o.labels !== false, labelH = labels ? (ls * 2.6) / U : 0;
var g = AIA.group(o.name || 'Colour chips');
for (i = 0; i < list.length; i++) {
  var c = i % cols, r = Math.floor(i / cols);
  var x = (o.x || 0) + c * (cw + gap), y = (o.y || 0) + r * (ch + labelH + gap);
  var cg = AIA.group('chip-' + list[i].name, g);
  AIA.rect(x, y, cw, ch, { fill: list[i].color, stroke: 'gray(20)', sw: 0.25, parent: cg, name: 'chip' });
  if (labels) {
    AIA.text(list[i].name, { x: x, y: y + ch + ls * 1.2 / U, font: (o.font || 'Arial') + ' Bold', size: ls, color: 'gray(90)', parent: cg, name: 'label' });
    AIA.text(list[i].spec, { x: x, y: y + ch + ls * 2.3 / U, font: o.font || 'Arial', size: ls * 0.85, color: 'gray(60)', parent: cg, name: 'values' });
  }
}
return { group: g.name, chips: list.length };
