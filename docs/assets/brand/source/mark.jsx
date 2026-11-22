// Chandelier mark (concept C2, refined) as a reusable function + the boards built from it.
// mark(parent, ox, oy, size, opts) draws the mark in a size x size box at (ox, oy) in the current artboard frame.
// opts: theme 'light' (ink on light) | 'dark' (paper on dark) | 'black' | 'white'; small: true (16-32 px version);
//       glow: false to leave the glow out.
var o = arguments[0] || {};
var doc = AIA.doc();
var COL = { Ink: '#0F1B2D', Amber: '#F2A93B', Glow: '#FFD27A', Handle: '#8A9BB8', Paper: '#F6F3EC', Night: '#0B1422' };
for (var c in COL) if (COL.hasOwnProperty(c)) AIA.swatch(c, COL[c]);

// radial glow gradient: Glow, fading to transparent
var GL;
try { GL = doc.gradients.getByName('Light Glow'); } catch (e) { GL = doc.gradients.add(); GL.name = 'Light Glow'; }
GL.type = GradientType.RADIAL;
while (GL.gradientStops.length < 2) GL.gradientStops.add();
GL.gradientStops[0].color = AIA.color('swatch:Glow'); GL.gradientStops[0].rampPoint = 0; GL.gradientStops[0].opacity = 85;
GL.gradientStops[1].color = AIA.color('swatch:Glow'); GL.gradientStops[1].rampPoint = 100; GL.gradientStops[1].opacity = 0;

function style(it, s) {
  if (s.fill) { it.filled = true; it.fillColor = s.fill.typename ? s.fill : AIA.color(s.fill); } else it.filled = false;
  if (s.stroke) {
    it.stroked = true; it.strokeColor = AIA.color(s.stroke); it.strokeWidth = s.sw || 1;
    it.strokeCap = s.cap === 'butt' ? StrokeCap.BUTTENDCAP : StrokeCap.ROUNDENDCAP; it.strokeJoin = StrokeJoin.ROUNDENDJOIN;
  } else it.stroked = false;
  if (s.name) it.name = s.name;
  return it;
}
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
function glowColor() { var g = new GradientColor(); g.gradient = GL; return g; }

function mark(parent, ox, oy, size, opts) {
  opts = opts || {};
  var s = size / 512, k = Math.PI / 180, th = opts.theme || 'light';
  var ring = { light: 'swatch:Ink', dark: 'swatch:Paper', black: '#000000', white: '#FFFFFF' }[th];
  var light = (th === 'black' || th === 'white') ? ring : 'swatch:Amber';
  var edge = { light: 'swatch:Ink', dark: 'swatch:Night', black: '#FFFFFF', white: '#000000' }[th];
  var handle = (th === 'black' || th === 'white') ? ring : 'swatch:Handle';
  var g = AIA.group(opts.name || 'Mark', parent);
  function X(v) { return ox + v * s; } function Y(v) { return oy + v * s; }
  var small = !!opts.small;
  var cx = 256, cy = small ? 272 : 300, r = small ? 176 : 160, sw = small ? 84 : 56, end = 40, sq = small ? 104 : 64;
  function pt(a) { return [cx + r * Math.cos(a * k), cy - r * Math.sin(a * k)]; }
  var a0 = pt(end), a1 = pt(-end);
  // glows first (behind)
  if (!small && opts.glow !== false && th !== 'black' && th !== 'white') {
    var ends = [a0, a1];
    for (var i = 0; i < 2; i++) {
      var gr = 92, e = AIA.ellipse(X(ends[i][0] - gr), Y(ends[i][1] - gr), 2 * gr * s, 2 * gr * s, { parent: g });
      style(e, { fill: glowColor(), name: 'Glow' });
    }
  }
  if (!small) { // hanger + chain
    style(AIA.ellipse(X(256 - 16), Y(20), 32 * s, 32 * s, { parent: g }), { stroke: ring, sw: 10 * s, name: 'Hanger' });
    bez('M ' + X(256) + ' ' + Y(52) + ' L ' + X(256) + ' ' + Y(cy - r - sw / 2 + 2), { stroke: ring, sw: 10 * s, cap: 'butt', name: 'Chain' }, g);
  }
  bez('M ' + X(a0[0]) + ' ' + Y(a0[1]) + ' A ' + (r * s) + ' ' + (r * s) + ' 0 1 0 ' + X(a1[0]) + ' ' + Y(a1[1]),
    { stroke: ring, sw: sw * s, cap: 'butt', name: 'Ring' }, g);
  // end anchors: the lights. One handle each, along the arc's tangent (as on a real open path end)
  var tang = [[Math.sin(end * k), Math.cos(end * k)], [Math.sin(end * k), -Math.cos(end * k)]], hl = 84;
  var anchors = [a0, a1];
  for (var j = 0; j < 2; j++) {
    var p = anchors[j];
    if (!small) {
      var hx = p[0] + tang[j][0] * hl, hy = p[1] + tang[j][1] * hl;
      bez('M ' + X(p[0]) + ' ' + Y(p[1]) + ' L ' + X(hx) + ' ' + Y(hy), { stroke: handle, sw: 6 * s, name: 'Handle line' }, g);
      style(AIA.ellipse(X(hx - 11), Y(hy - 11), 22 * s, 22 * s, { parent: g }), { fill: handle, name: 'Handle' });
    }
    var sqItem = AIA.rect(X(p[0] - sq / 2), Y(p[1] - sq / 2), sq * s, sq * s, { parent: g });
    style(sqItem, small ? { fill: light, name: 'Light' } : { fill: light, stroke: edge, sw: 10 * s, name: 'Light' });
  }
  return g;
}
$.global.CHANDELIER_MARK = mark; // reused by the lockup and hero builders in this session

// boards: add an artboard by name if missing (rect in artboard-0 frame)
function board(name, x, y, w, h) {
  for (var i = 0; i < doc.artboards.length; i++) if (doc.artboards[i].name === name) return i;
  var a = AIA.at(0, function () { var p0 = AIA.P(x, y), p1 = AIA.P(x + w, y + h); return [p0[0], p0[1], p1[0], p1[1]]; });
  var ab = doc.artboards.add(a); ab.name = name;
  return doc.artboards.length - 1;
}
var kM = board('Mark', 0, 1792, 512, 512), kS = board('Mark small', 576, 1792, 512, 512), kD = board('Mark dark', 1152, 1792, 512, 512);
var L = AIA.fresh('Master');
AIA.at(kM, function () { mark(L, 0, 0, 512, { name: 'Mark' }); });
AIA.at(kS, function () { mark(L, 0, 0, 512, { small: true, name: 'Mark small' }); });
AIA.at(kD, function () {
  var bg = AIA.rect(0, 0, 512, 512, { fill: 'swatch:Night', parent: L }); bg.name = 'Dark background';
  mark(L, 0, 0, 512, { theme: 'dark', name: 'Mark dark' });
});
return { boards: [kM, kS, kD] };
