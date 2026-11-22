// Logo exploration: concepts A (Bezier chandelier), C (monogram C), D (connected lights), 3 variants each,
// one per artboard (A1..D3 = artboards 0..8), 512 x 512 px. Re-runnable (AIA.fresh). args[0] = {only: [k...]}.
var o = arguments[0] || {};
var doc = AIA.doc();
var COL = { Ink: '#0F1B2D', Amber: '#F2A93B', Glow: '#FFD27A', Handle: '#8A9BB8', Paper: '#F6F3EC' };
for (var c in COL) if (COL.hasOwnProperty(c)) AIA.swatch(c, COL[c]);
var INK = 'swatch:Ink', AMB = 'swatch:Amber', GLOW = 'swatch:Glow', HND = 'swatch:Handle';

function style(it, s) {
  if (s.fill) { it.filled = true; it.fillColor = AIA.color(s.fill); } else it.filled = false;
  if (s.stroke) {
    it.stroked = true; it.strokeColor = AIA.color(s.stroke); it.strokeWidth = s.sw || 1;
    it.strokeCap = StrokeCap.ROUNDENDCAP; it.strokeJoin = StrokeJoin.ROUNDENDJOIN;
  } else it.stroked = false;
  if (s.opacity !== undefined) it.opacity = s.opacity;
  if (s.name) it.name = s.name;
  return it;
}
// Bezier path from SVG path data (artboard coordinates, y down)
function bez(d, s, parent) {
  var sub = AIA.svgPath(d)[0], p = parent.pathItems.add(), anchors = [], i;
  for (i = 0; i < sub.pts.length; i++) anchors.push(AIA.P(sub.pts[i].a[0], sub.pts[i].a[1]));
  p.setEntirePath(anchors);
  for (i = 0; i < sub.pts.length; i++) {
    var q = sub.pts[i], pp = p.pathPoints[i];
    pp.leftDirection = AIA.P(q.i[0], q.i[1]); pp.rightDirection = AIA.P(q.o[0], q.o[1]);
  }
  p.closed = sub.closed;
  return style(p, s);
}
function circ(x, y, r, s, parent) { return style(AIA.ellipse(x - r, y - r, 2 * r, 2 * r, { parent: parent }), s); }
function box(x, y, w, h, s, parent) { return style(AIA.rect(x, y, w, h, { parent: parent }), s); }
function line(x1, y1, x2, y2, s, parent) { return bez('M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2, s, parent); }
// flame: teardrop with its base at (x, yb), height h, width w
function flame(x, yb, h, w, s, parent) {
  var t = yb - h;
  return bez('M ' + x + ' ' + t + ' C ' + (x + w * 0.55) + ' ' + (yb - h * 0.5) + ' ' + (x + w * 0.5) + ' ' + yb + ' ' + x + ' ' + yb +
    ' C ' + (x - w * 0.5) + ' ' + yb + ' ' + (x - w * 0.55) + ' ' + (yb - h * 0.5) + ' ' + x + ' ' + t + ' Z', s, parent);
}
function glow(x, y, r, g) { return circ(x, y, r, { fill: GLOW, opacity: 35, name: 'Glow' }, g); }
// anchor square with two handles (the vector-editing look)
function anchor(x, y, size, dx, dy, s, g) {
  line(x - dx, y - dy, x + dx, y + dy, { stroke: HND, sw: 3, name: 'Handle line' }, g);
  circ(x - dx, y - dy, 6, { fill: HND, name: 'Handle' }, g);
  circ(x + dx, y + dy, 6, { fill: HND, name: 'Handle' }, g);
  return box(x - size / 2, y - size / 2, size, size, s, g);
}
function chain(cx, y2, g) {
  circ(cx, 40, 10, { stroke: INK, sw: 6, name: 'Chain ring' }, g);
  line(cx, 50, cx, y2, { stroke: INK, sw: 6, name: 'Chain' }, g);
}

// ---- A: Bezier chandelier: hub, arms as Bezier curves, flames; crystals = Bezier handles
function A(v, g) {
  var cx = 256, offs = v === 2 ? [-170, 170] : [-180, -100, 100, 180], sw = v === 2 ? 20 : 14, i;
  chain(cx, 150, g);
  bez('M 256 140 C 290 165 292 228 256 262 C 220 228 222 165 256 140 Z', { fill: INK, name: 'Hub' }, g);
  for (i = 0; i < offs.length; i++) {
    var x = cx + offs[i], ey = Math.abs(offs[i]) > 150 ? 282 : 304;
    bez('M 256 240 C 256 345 ' + x + ' 352 ' + x + ' ' + (ey + 10), { stroke: INK, sw: sw, name: 'Arm' }, g);
    box(x - 18, ey, 36, 12, { fill: INK, name: 'Cup' }, g);
    glow(x, ey - 26, 36, g);
    if (v === 3) anchor(x, ey - 22, 24, 30, 0, { fill: AMB, stroke: INK, sw: 4, name: 'Light (anchor)' }, g);
    else if (v === 2) circ(x, ey - 26, 20, { fill: AMB, name: 'Light' }, g);
    else flame(x, ey - 4, 48, 30, { fill: AMB, name: 'Flame' }, g);
    if (v === 1) { // crystal pendants drawn as Bezier handles
      line(x, ey + 12, x, ey + 58, { stroke: HND, sw: 3, name: 'Handle line' }, g);
      circ(x, ey + 62, 6, { fill: 'none', stroke: INK, sw: 3, name: 'Handle' }, g);
    }
  }
}
// ---- C: monogram C: the chandelier ring as a C opening to the right
function C(v, g) {
  var cx = 256, cy = 292, r = 150, sw = v === 3 ? 46 : 34, k = Math.PI / 180;
  function pt(a) { return [cx + r * Math.cos(a * k), cy - r * Math.sin(a * k)]; }
  var a0 = pt(45), a1 = pt(315);
  chain(cx, cy - r - sw / 2, g);
  if (v === 3) { glow(cx + 10, cy + 6, 92, g); flame(cx + 10, cy + 58, 128, 80, { fill: AMB, name: 'Flame' }, g); }
  bez('M ' + a0[0] + ' ' + a0[1] + ' A ' + r + ' ' + r + ' 0 1 0 ' + a1[0] + ' ' + a1[1], { stroke: INK, sw: sw, name: 'Ring C' }, g);
  if (v === 1) {
    var as = [125, 165, 205, 245];
    for (var i = 0; i < as.length; i++) { var p = pt(as[i]); glow(p[0], p[1], 30, g); circ(p[0], p[1], 11, { fill: AMB, name: 'Light' }, g); }
  }
  if (v === 2) {
    glow(a0[0], a0[1], 40, g); glow(a1[0], a1[1], 40, g);
    anchor(a0[0], a0[1], 34, 30, -30, { fill: AMB, stroke: INK, sw: 5, name: 'Light (anchor)' }, g);
    anchor(a1[0], a1[1], 34, 30, 30, { fill: AMB, stroke: INK, sw: 5, name: 'Light (anchor)' }, g);
  }
}
// ---- D: connected lights: a hub and lights like a node diagram
function D(v, g) {
  var cx = 256, hy = 190, k = Math.PI / 180, i, nodes;
  chain(cx, hy - 24, g);
  if (v === 2) nodes = [[25, 190, 20], [70, 190, 20], [110, 190, 20], [155, 190, 20], [45, 110, 14], [90, 110, 14], [135, 110, 14]];
  else if (v === 3) nodes = [[35, 180, 28], [90, 180, 28], [145, 180, 28]];
  else nodes = [[20, 170, 22], [55, 170, 22], [90, 170, 22], [125, 170, 22], [160, 170, 22]];
  for (i = 0; i < nodes.length; i++) {
    var x = cx + nodes[i][1] * Math.cos(nodes[i][0] * k), y = hy + nodes[i][1] * Math.sin(nodes[i][0] * k);
    if (v === 3) bez('M ' + cx + ' ' + hy + ' C ' + cx + ' ' + (hy + 120) + ' ' + x + ' ' + (y - 110) + ' ' + x + ' ' + y, { stroke: INK, sw: 10, name: 'Link' }, g);
    else line(cx, hy, x, y, { stroke: INK, sw: 8, name: 'Link' }, g);
    glow(x, y, nodes[i][2] + 18, g);
    circ(x, y, nodes[i][2], { fill: AMB, stroke: INK, sw: 6, name: 'Light' }, g);
  }
  if (v === 3) box(cx - 24, hy - 24, 48, 48, { fill: INK, name: 'Hub (anchor)' }, g);
  else circ(cx, hy, 26, { fill: INK, name: 'Hub' }, g);
}

var L = AIA.fresh('Art'), LB = AIA.fresh('Labels');
var names = ['A1', 'A2', 'A3', 'C1', 'C2', 'C3', 'D1', 'D2', 'D3'], fns = [A, A, A, C, C, C, D, D, D];
for (var k = 0; k < 9; k++) {
  (function (k) {
    AIA.at(k, function () {
      var g = AIA.group(names[k], L);
      fns[k]((k % 3) + 1, g);
      AIA.text(names[k], { x: 20, y: 496, font: 'Verdana', size: 14, color: HND, parent: LB });
    });
  })(k);
}
for (var li = doc.layers.length - 1; li >= 0; li--) if (doc.layers[li].pageItems.length === 0 && doc.layers.length > 2) doc.layers[li].remove();
return 'ok';
