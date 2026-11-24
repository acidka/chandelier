// recipe: business-card - one card at x, y: colour band with the company, name (bold), title and contact lines; the band runs into the bleed
// args: {name, title, lines: ["+1 555 0100", "name@example.com", ...], company, x: 0, y: 0, w: 85 mm, h: 55 mm (session units), bleed: 0, band: "left"|"top", colors: {band, text, accent}, font: "Arial", bold_font: "Arial Bold", group: "Card"}
var o = arguments[0] || {};
if (!o.name) throw new Error('business-card needs name.');
var U = AIA.u(1), x = o.x || 0, y = o.y || 0;
var w = o.w || AIA.mm(85) / U, h = o.h || AIA.mm(55) / U, b = o.bleed || 0;
var c = o.colors || {}, cBand = c.band || 'cmyk(100,85,35,30)', cText = c.text || 'gray(90)', cAccent = c.accent || 'cmyk(10,100,90,5)';
var font = o.font || 'Arial', bold = o.bold_font || 'Arial Bold';
var g = AIA.group(o.group || ('Card ' + o.name));
var top = o.band === 'top', m = AIA.mm(5) / U; // margin
if (top) AIA.rect(x - b, y - b, w + 2 * b, h * 0.3 + b, { fill: cBand, parent: g, name: 'band' });
else AIA.rect(x - b, y - b, w * 0.32 + b, h + 2 * b, { fill: cBand, parent: g, name: 'band' });
var hU = AIA.u(h); // card height in pt for type sizes
if (o.company) {
  if (top) AIA.text(o.company, { x: x + m, y: y + h * 0.3 - m * 0.8, font: bold, size: hU * 0.075, color: 'gray(0)', parent: g, name: 'company' });
  else AIA.text(o.company, { x: x + w * 0.16, y: y + h / 2 + hU * 0.03 / U, font: bold, size: hU * 0.07, color: 'gray(0)', align: 'center', parent: g, name: 'company' });
}
var tx = top ? x + m : x + w * 0.32 + m, ty = top ? y + h * 0.3 + m * 1.6 : y + m * 1.8;
AIA.text(o.name, { x: tx, y: ty, font: bold, size: hU * 0.085, color: cText, parent: g, name: 'name' });
if (o.title) AIA.text(o.title, { x: tx, y: ty + hU * 0.085 * 1.25 / U, font: font, size: hU * 0.055, color: cAccent, parent: g, name: 'title' });
var lines = o.lines || [], ls = hU * 0.05, ly = y + h - m - (lines.length - 1) * ls * 1.35 / U;
for (var i = 0; i < lines.length; i++) AIA.text(lines[i], { x: tx, y: ly + i * ls * 1.35 / U, font: font, size: ls, color: cText, parent: g, name: 'line-' + (i + 1) });
return { group: g.name, size: [w, h], bleed: b };
