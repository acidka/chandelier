// Wordmark (Montserrat SemiBold, outlined, the i-dot replaced by an amber anchor square), lockups and the GitHub hero.
// Needs mark.jsx run first in this Illustrator session. Re-runnable: layers emptied, artboards found by name.
var doc = AIA.doc(), mark = $.global.CHANDELIER_MARK;
if (!mark) throw new Error('Run mark.jsx first (it defines the mark function).');
var FONT = 'Montserrat SemiBold', TRACK = -10;

function board(name) {
  for (var i = 0; i < doc.artboards.length; i++) if (doc.artboards[i].name === name) return i;
  var r = doc.artboards[0].artboardRect;
  doc.artboards.add([r[0], r[1], r[0] + 10, r[1] - 10]).name = name;
  return doc.artboards.length - 1;
}
function fit(k, item, pad) { var b = item.visibleBounds; doc.artboards[k].artboardRect = [b[0] - pad, b[1] + pad, b[2] + pad, b[3] - pad]; }
function setRect(k, x, y, w, h) { // artboard-0 frame
  var r = AIA.at(0, function () { var p0 = AIA.P(x, y), p1 = AIA.P(x + w, y + h); return [p0[0], p0[1], p1[0], p1[1]]; });
  doc.artboards[k].artboardRect = r;
}
function fill(it, c, name) { it.filled = true; it.fillColor = AIA.color(c); it.stroked = false; if (name) it.name = name; return it; }

// outlined wordmark; returns {group, width}
function wordmark(parent, x, by, size, color) {
  var g = AIA.group('Wordmark', parent);
  var t = AIA.text('Chandelier', { x: x, y: by, font: FONT, size: size, color: color, tracking: TRACK, parent: g });
  var o = t.createOutline(), best = null, bestA = 1e12, i, j;
  // the i-dot = the smallest closed sub-path
  for (i = 0; i < o.compoundPathItems.length; i++) {
    var cp = o.compoundPathItems[i];
    for (j = 0; j < cp.pathItems.length; j++) {
      var b = cp.pathItems[j].geometricBounds, a = (b[2] - b[0]) * (b[1] - b[3]);
      if (a < bestA) { bestA = a; best = cp.pathItems[j]; }
    }
  }
  for (i = 0; i < o.pathItems.length; i++) {
    var b2 = o.pathItems[i].geometricBounds, a2 = (b2[2] - b2[0]) * (b2[1] - b2[3]);
    if (a2 < bestA) { bestA = a2; best = o.pathItems[i]; }
  }
  var db = best.geometricBounds, cxd = (db[0] + db[2]) / 2, cyd = (db[1] + db[3]) / 2, d = (db[2] - db[0]) * 0.98;
  best.remove();
  var sq = g.pathItems.rectangle(cyd + d / 2, cxd - d / 2, d, d);
  fill(sq, 'swatch:Amber', 'i-dot (anchor)');
  o.name = 'Letters';
  var gb = g.visibleBounds;
  return { group: g, width: gb[2] - gb[0] };
}

var L = AIA.fresh('Lockups');
// --- horizontal, light + dark
function horizontal(name, ox, oy, theme) {
  var k = board(name), g;
  AIA.at(0, function () {
    g = AIA.group(name, L);
    mark(g, ox, oy, 300, { theme: theme, glow: false, name: 'Mark' });
    wordmark(g, ox + 318, oy + 226, 168, theme === 'dark' ? 'swatch:Paper' : 'swatch:Ink');
  });
  fit(k, g, 48);
  if (theme === 'dark') { var bg = L.pathItems.rectangle(doc.artboards[k].artboardRect[1], doc.artboards[k].artboardRect[0],
    doc.artboards[k].artboardRect[2] - doc.artboards[k].artboardRect[0], doc.artboards[k].artboardRect[1] - doc.artboards[k].artboardRect[3]);
    fill(bg, 'swatch:Night', name + ' background'); bg.move(g, ElementPlacement.PLACEAFTER); }
  return k;
}
var kH = horizontal('Horizontal', 0, 3700, 'light'), kHD = horizontal('Horizontal dark', 1700, 3700, 'dark');
// --- stacked
var kS = board('Stacked'), gS;
AIA.at(0, function () {
  gS = AIA.group('Stacked', L);
  var w = wordmark(gS, 3400, 4236, 150, 'swatch:Ink');
  mark(gS, 3400 + w.width / 2 - 190, 3700, 380, { glow: false, name: 'Mark' });
});
fit(kS, gS, 48);

// --- GitHub hero, 1280 x 640, light + dark
function hero(name, ox, oy, theme) {
  var k = board(name), dark = theme === 'dark';
  setRect(k, ox, oy, 1280, 640);
  AIA.at(k, function () {
    var g = AIA.group(name, L);
    fill(AIA.rect(0, 0, 1280, 640, { parent: g }), dark ? 'swatch:Night' : 'swatch:Paper', 'Background');
    // the room light: one big soft glow from the lower lamp, falling towards the artboard
    var gc = new GradientColor(); gc.gradient = doc.gradients.getByName('Light Glow');
    var big = AIA.ellipse(430 - 560, 430 - 560, 1120, 1120, { parent: g });
    big.filled = true; big.fillColor = gc; big.stroked = false; big.opacity = dark ? 32 : 55; big.name = 'Room light';
    // the "artboard" being drawn, lit by the chandelier
    var page = AIA.rect(560, 430, 620, 168, { parent: g });
    fill(page, dark ? '#13213A' : '#FFFFFF', 'Artboard'); page.stroked = true; page.strokeColor = AIA.color('swatch:Handle'); page.strokeWidth = 1.5;
    var P = g.pathItems.add();
    var pts = [[600, 560], [760, 470], [930, 545], [1140, 470]], hs = [[0, 0, 60, -40], [-70, 0, 70, 0], [-60, 0, 70, 0], [-60, 30, 0, 0]];
    var anchors = []; for (var i = 0; i < pts.length; i++) anchors.push(AIA.P(pts[i][0], pts[i][1]));
    P.setEntirePath(anchors);
    for (i = 0; i < pts.length; i++) {
      P.pathPoints[i].leftDirection = AIA.P(pts[i][0] + hs[i][0], pts[i][1] + hs[i][1]);
      P.pathPoints[i].rightDirection = AIA.P(pts[i][0] + hs[i][2], pts[i][1] + hs[i][3]);
    }
    P.filled = false; P.stroked = true; P.strokeColor = AIA.color(dark ? 'swatch:Paper' : 'swatch:Ink'); P.strokeWidth = 4; P.name = 'Path being drawn';
    // handles + anchors on the middle points (selected look)
    for (i = 1; i < 3; i++) {
      var a = pts[i], h1 = [a[0] + hs[i][0], a[1] + hs[i][1]], h2 = [a[0] + hs[i][2], a[1] + hs[i][3]];
      var hl = g.pathItems.add(); hl.setEntirePath([AIA.P(h1[0], h1[1]), AIA.P(h2[0], h2[1])]);
      hl.filled = false; hl.stroked = true; hl.strokeColor = AIA.color('swatch:Handle'); hl.strokeWidth = 2; hl.name = 'Handle line';
      var hd = [h1, h2];
      for (var j = 0; j < 2; j++) fill(AIA.ellipse(hd[j][0] - 6, hd[j][1] - 6, 12, 12, { parent: g }), 'swatch:Handle', 'Handle');
    }
    for (i = 0; i < pts.length; i++) {
      var s = (i === 1 || i === 2) ? 16 : 12, q = AIA.rect(pts[i][0] - s / 2, pts[i][1] - s / 2, s, s, { parent: g });
      fill(q, (i === 1 || i === 2) ? 'swatch:Amber' : (dark ? 'swatch:Paper' : 'swatch:Ink'), 'Anchor');
    }
    // the chandelier hangs from the top edge
    var mk = mark(g, 70, 30, 500, { theme: dark ? 'dark' : 'light', name: 'Mark' });
    var ch = g.pathItems.add(); ch.setEntirePath([AIA.P(320, 0), AIA.P(320, 52)]);
    ch.filled = false; ch.stroked = true; ch.strokeColor = AIA.color(dark ? 'swatch:Paper' : 'swatch:Ink'); ch.strokeWidth = 500 / 512 * 10; ch.name = 'Chain to ceiling';
    // text
    var w = wordmark(g, 600, 200, 104, dark ? 'swatch:Paper' : 'swatch:Ink');
    AIA.text('Light up Illustrator for AI agents.', { x: 604, y: 290, font: 'Montserrat Medium', size: 36, color: dark ? 'swatch:Paper' : 'swatch:Ink', parent: g, name: 'Tagline' });
    AIA.text('~5 ms per call  ·  batches  ·  print-ready PDF/X-4', { x: 605, y: 346, font: 'Montserrat Medium', size: 22, color: dark ? 'swatch:Amber' : '#94600F', tracking: 20, parent: g, name: 'Proof' });
    // clip everything to the 1280 x 640 frame (the room light is larger than the banner)
    var clip = AIA.rect(0, 0, 1280, 640, { parent: g }); clip.name = 'Frame'; clip.move(g, ElementPlacement.PLACEATBEGINNING);
    clip.clipping = true; g.clipped = true;
  });
  return k;
}
var kHL = hero('Hero light', 0, 4500, 'light'), kHK = hero('Hero dark', 1400, 4500, 'dark');
return { horizontal: kH, horizontal_dark: kHD, stacked: kS, hero_light: kHL, hero_dark: kHK };
