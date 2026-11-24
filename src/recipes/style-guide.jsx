// recipe: style-guide - a sheet of the document's global/spot swatches (chips with values) and paragraph styles (a sample line each)
// args: {x: 0, y: 0, w (session units; default the reference artboard width), title: "Style guide", sample: "The quick brown fox jumps over the lazy dog 0123456789", chip: 16 mm, font: "Arial", name: "Style guide"}
var o = arguments[0] || {};
var doc = AIA.doc(), U = AIA.u(1), i;
var ab = doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect;
var x = o.x || 0, y = o.y || 0, w = o.w || (ab[2] - ab[0]) / U - 2 * x;
var font = o.font || 'Arial', chip = o.chip || AIA.mm(16) / U, gap = AIA.mm(4) / U;
var g = AIA.group(o.name || 'Style guide');
AIA.text(o.title || 'Style guide', { x: x, y: y + 22 / U, font: font + ' Bold', size: 20, color: 'gray(90)', parent: g, name: 'title' });
var cy = y + 40 / U;
AIA.text('Colours', { x: x, y: cy, font: font + ' Bold', size: 10, color: 'gray(70)', parent: g });
cy += 8 / U;
var cols = Math.max(1, Math.floor((w + gap) / (chip + gap))), n = 0;
for (i = 0; i < doc.swatches.length; i++) {
  var sw = doc.swatches[i], col = sw.color;
  if (col.typename !== 'SpotColor' || col.spot.colorType === ColorModel.REGISTRATION) continue;
  var cx = x + (n % cols) * (chip + gap), yy = cy + Math.floor(n / cols) * (chip + 26 / U + gap);
  var cg = AIA.group('chip-' + sw.name, g);
  AIA.rect(cx, yy, chip, chip, { fill: 'swatch:' + sw.name, stroke: 'gray(20)', sw: 0.25, parent: cg });
  AIA.text(sw.name, { x: cx, y: yy + chip + 9 / U, font: font + ' Bold', size: 7, color: 'gray(90)', parent: cg });
  AIA.text(AIA.colorStr(col.spot.color), { x: cx, y: yy + chip + 18 / U, font: font, size: 6, color: 'gray(60)', parent: cg });
  n++;
}
if (!n) AIA.text('(no global or spot swatches)', { x: x, y: cy + 10 / U, font: font, size: 8, color: 'gray(60)', parent: g });
var sy = cy + (n ? Math.ceil(n / cols) * (chip + 26 / U + gap) : 20 / U) + 12 / U;
AIA.text('Paragraph styles', { x: x, y: sy, font: font + ' Bold', size: 10, color: 'gray(70)', parent: g });
sy += 10 / U;
var styles = 0, sample = o.sample || 'The quick brown fox jumps over the lazy dog 0123456789';
for (i = 0; i < doc.paragraphStyles.length; i++) {
  var st = doc.paragraphStyles[i];
  if (i === 0 && /^\[/.test(st.name)) continue; // [Normal Paragraph Style]
  AIA.text(st.name, { x: x, y: sy + 8 / U, font: font, size: 7, color: 'gray(60)', parent: g });
  // the style's size can't be read (reading a paragraph style's attributes crashes Illustrator, B1): measure the sample
  var t = AIA.text(st.name + ' - ' + sample, { x: x, y: sy + 40 / U, style: st.name, parent: g, name: 'sample-' + st.name });
  var words = t.contents.split(' ');
  while (AIA.box(t)[2] > w && words.length > 2) { words.pop(); t.contents = words.join(' '); } // fit the width
  var bx = AIA.box(t), top = sy + 12 / U;
  t.translate(0, -(top - bx[1]) * U); // its top just under the label (document y is up)
  sy = top + bx[3] + 12 / U;
  styles++;
}
return { group: g.name, swatches: n, styles: styles };
