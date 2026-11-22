// Wordmark side-by-side: "Chandelier" in OFL fonts, each beside a small mark, on a new artboard "Wordmarks".
var doc = AIA.doc(), mark = $.global.CHANDELIER_MARK;
if (!mark) throw new Error('Run mark.jsx first (it defines the mark function).');
function board(name, x, y, w, h) {
  for (var i = 0; i < doc.artboards.length; i++) if (doc.artboards[i].name === name) return i;
  var a = AIA.at(0, function () { var p0 = AIA.P(x, y), p1 = AIA.P(x + w, y + h); return [p0[0], p0[1], p1[0], p1[1]]; });
  doc.artboards.add(a).name = name;
  return doc.artboards.length - 1;
}
var FONTS = ['Montserrat SemiBold', 'Poppins SemiBold', 'Josefin Sans SemiBold', 'Raleway SemiBold', 'Nunito Sans Bold',
  'Cormorant Garamond SemiBold', 'Playfair Display SemiBold', 'DM Serif Display', 'Cinzel', 'Italiana'];
var k = board('Wordmarks', 0, 2368, 1664, 1240), L = AIA.fresh('Wordmarks'), used = [];
AIA.at(k, function () {
  for (var i = 0; i < FONTS.length; i++) {
    var col = i % 2, row = Math.floor(i / 2), x = 40 + col * 820, y = 40 + row * 236;
    mark(L, x, y, 150, { name: 'Mark ' + i, glow: false });
    var t = AIA.text('Chandelier', { x: x + 160, y: y + 112, font: FONTS[i], size: 84, color: 'swatch:Ink', parent: L, name: FONTS[i] });
    used.push(t.textRange.characterAttributes.textFont.name);
    AIA.text(FONTS[i] + '  →  ' + used[i], { x: x + 164, y: y + 150, font: 'Verdana', size: 13, color: 'swatch:Handle', parent: L });
  }
});
return { board: k, fonts: used };
