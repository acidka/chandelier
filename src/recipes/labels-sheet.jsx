// recipe: labels-sheet - a grid of labels with centred (or left) text and optional borders, one named group per label
// args: {texts: ["Line 1\nLine 2", ...], cols, rows, x: 0, y: 0, label_w, label_h, gap_x: 0, gap_y: 0, padding (session units, default 2 mm), font: "Arial", size: 10 (pt), align: "center"|"left", color, border: true, border_color: "gray(30)", name: "Labels"}
var o = arguments[0] || {};
if (!o.texts || !o.texts.length) throw new Error('labels-sheet needs texts: one string per label ("\\n" for new lines).');
if (!o.cols || !o.rows || !o.label_w || !o.label_h) throw new Error('labels-sheet needs cols, rows, label_w and label_h (session units).');
var n = o.texts.length, cap = o.cols * o.rows;
if (n > cap) { AIA.warn(n + ' texts but ' + cap + ' labels on the sheet: the first ' + cap + ' were placed.'); n = cap; }
var x0 = o.x || 0, y0 = o.y || 0, gx = o.gap_x || 0, gy = o.gap_y || 0, pad = o.padding === undefined ? AIA.mm(2) / AIA.u(1) : o.padding;
var size = o.size || 10, lead = size * 1.2, left = o.align === 'left', U = AIA.u(1);
var sheet = AIA.group(o.name || 'Labels');
for (var i = 0; i < n; i++) {
  var c = i % o.cols, r = Math.floor(i / o.cols);
  var x = x0 + c * (o.label_w + gx), y = y0 + r * (o.label_h + gy);
  var g = AIA.group('label-' + (i + 1), sheet);
  if (o.border !== false) AIA.rect(x, y, o.label_w, o.label_h, { fill: 'none', stroke: o.border_color || 'gray(30)', sw: 0.25, parent: g, name: 'border' });
  var lines = String(o.texts[i]).split('\n').length;
  var block = (lines - 1) * lead + size * 0.72; // cap height of the first line to the last baseline, pt
  var firstBase = y + (o.label_h - block / U) / 2 + size * 0.72 / U;
  AIA.text(o.texts[i], { x: left ? x + pad : x + o.label_w / 2, y: firstBase, font: o.font || 'Arial', size: size, leading: lead, color: o.color, align: left ? 'left' : 'center', parent: g, name: 'text' });
}
return { group: sheet.name, labels: n };
