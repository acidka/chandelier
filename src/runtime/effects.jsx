// effects (0.4). ES3. Live effects through PageItem.applyEffect(LiveEffect XML). The XML is undocumented: the forms
// here come from MIT-licensed community work (mark1bean/live-effect-functions-for-illustrator) and from the art
// styles Illustrator writes into uncompressed .ai files, and each was checked live (Illustrator 29.1, 2026-11-24).
// A malformed XML string fails with MRAP. Effects can't be read back from scripts (no API), only rendered.
// Lengths in session units; colours "Fill color" = "<model> <components 0..1>": 0 gray (ink), 1 CMYK, 5 RGB.
(function (A) {
  var BL = ['normal', 'multiply', 'screen', 'overlay', 'soft_light', 'hard_light', 'color_dodge', 'color_burn', 'darken',
    'lighten', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];
  function blend(n, d) {
    if (n === undefined) return d;
    for (var i = 0; i < BL.length; i++) if (BL[i] === n) return i;
    throw new Error('Unknown blend "' + n + '". Use one of: ' + BL.join(', ') + '.');
  }
  function r(v) { return Math.round(v * 10000) / 10000; }
  function num(v, d) { return v === undefined ? d : +v; }
  function len(v, d) { return v === undefined ? d : A.u(+v); } // defaults are pt
  function fill(spec, d) {
    var c = A.color(spec === undefined ? d : spec), t = c.typename, k = 1;
    if (t === 'SpotColor') { k = c.tint / 100; c = c.spot.color; t = c.typename; }
    if (t === 'CMYKColor') return '1 ' + r(c.cyan * k / 100) + ' ' + r(c.magenta * k / 100) + ' ' + r(c.yellow * k / 100) + ' ' + r(c.black * k / 100);
    if (t === 'GrayColor') return '0 ' + r(c.gray * k / 100);
    if (t === 'RGBColor') return '5 ' + r(1 - (1 - c.red / 255) * k) + ' ' + r(1 - (1 - c.green / 255) * k) + ' ' + r(1 - (1 - c.blue / 255) * k);
    throw new Error('An effect colour must be CMYK, RGB or gray (or a swatch of one), not ' + spec + '.');
  }
  function le(name, data, colorKey, color) {
    var x = '<LiveEffect name="' + name + '"><Dict data="' + data + ' "';
    return x + (colorKey ? '><Entry name="' + colorKey + '" valueType="F"><Fill color="' + color + '"/></Entry></Dict>' : '/>') + '</LiveEffect>';
  }
  var JOIN = { round: 0, bevel: 1, miter: 2 };
  var FX = {
    drop_shadow: function (e) {
      return le('Adobe Drop Shadow', 'I blnd ' + blend(e.blend, 1) + ' R opac ' + r(num(e.opacity, 75) / 100) + ' R horz ' + r(len(e.x, 7)) + ' R vert ' + r(len(e.y, 7)) +
        ' R blur ' + r(len(e.blur, 5)) + ' B usePSLBlur 1 I csrc 0 R dark 100 B pair 1', 'sclr', fill(e.color, 'gray(100)'));
    },
    outer_glow: function (e) {
      return le('Adobe Outer Glow', 'I blnd ' + blend(e.blend, 1) + ' R opac ' + r(num(e.opacity, 75) / 100) + ' R blur ' + r(len(e.blur, 5)) + ' B usePSLBlur 1', 'sclr', fill(e.color, 'gray(100)'));
    },
    inner_glow: function (e) {
      return le('Adobe Inner Glow', 'I blnd ' + blend(e.blend, 2) + ' I gtyp ' + (e.from === 'center' ? 1 : 0) + ' R opac ' + r(num(e.opacity, 75) / 100) + ' R blur ' + r(len(e.blur, 5)), 'gclr', fill(e.color, 'gray(0)'));
    },
    round_corners: function (e) { return le('Adobe Round Corners', 'R radius ' + r(len(e.radius, 10))); },
    feather: function (e) { return le('Adobe Fuzzy Mask', 'R Radius ' + r(len(e.radius, 10))); },
    blur: function (e) { return le('Adobe PSL Gaussian Blur', 'R PrevDocScale 1 I PrevDres 300 R blur ' + r(len(e.radius, 3))); },
    offset: function (e) {
      var j = JOIN[e.joins || 'miter'];
      if (j === undefined) throw new Error('joins must be miter, round or bevel.');
      return le('Adobe Offset Path', 'R ofst ' + r(len(e.distance, 5)) + ' I jntp ' + j + ' R mlim ' + num(e.miter_limit, 4));
    },
    roughen: function (e) {
      var s = r(len(e.size, 5));
      return le('Adobe Roughen', 'R asiz ' + s + ' R size ' + s + ' R absoluteness 1 R dtal ' + num(e.detail, 10) + ' R roundness ' + (e.smooth ? 1 : 0));
    },
    zigzag: function (e) {
      return le('Adobe Zigzag', 'R amount ' + r(len(e.size, 4)) + ' R relAmount 0 R absoluteness 1 R ridges ' + num(e.ridges, 4) + ' R roundness ' + (e.smooth ? 1 : 0));
    },
    pucker_bloat: function (e) { return le('Adobe Punk and Bloat', 'R d_factor ' + num(e.amount, 20)); },
    transform: function (e) {
      var sx = num(e.scale_x, num(e.scale, 100)), sy = num(e.scale_y, num(e.scale, 100)), deg = num(e.rotate, 0);
      return le('Adobe Transform', 'R scaleH_Percent ' + sx + ' R scaleV_Percent ' + sy + ' R scaleH_Factor ' + r(sx / 100) + ' R scaleV_Factor ' + r(sy / 100) +
        ' R moveH_Pts ' + r(len(e.x, 0)) + ' R moveV_Pts ' + r(-len(e.y, 0)) + ' R rotate_Degrees ' + deg + ' R rotate_Radians ' + r(deg * Math.PI / 180) +
        ' I numCopies ' + num(e.copies, 0) + ' I pinPoint 4 B scaleLines 0 B transformPatterns 1 B transformObjects 1 B reflectX 0 B reflectY 0 B randomize 0');
    }
  };
  A.effectXml = function (e) {
    if (e.xml) return String(e.xml);
    var f = FX[e.type];
    if (!f) {
      var names = []; for (var k in FX) if (FX.hasOwnProperty(k)) names.push(k);
      throw new Error('Unknown effect "' + e.type + '". Use one of: ' + names.join(', ') + ', or {xml}.');
    }
    return f(e);
  };

  // Clearing: there is no API to remove an effect, and "Reduce to Basic Appearance" isn't scriptable (MRAP). The
  // [Default] graphic style replaces the whole appearance; the item's own basic paint is put back afterwards.
  function basic(p) {
    var o = { t: p.typename };
    try { o.op = p.opacity; o.bm = p.blendingMode; } catch (e) {}
    if (o.t === 'PathItem') { o.f = p.filled; o.fc = p.fillColor; o.s = p.stroked; o.sc = p.strokeColor; o.sw = p.strokeWidth; o.d = p.strokeDashes; }
    return o;
  }
  function restore(p, o) {
    if (o.t === 'PathItem') {
      p.filled = o.f; if (o.f) p.fillColor = o.fc;
      p.stroked = o.s; if (o.s) { p.strokeColor = o.sc; p.strokeWidth = o.sw; p.strokeDashes = o.d; }
    }
    try { p.opacity = o.op; p.blendingMode = o.bm; } catch (e) {}
  }
  function clear(it, doc) {
    var t = it.typename;
    if (t !== 'PathItem' && t !== 'CompoundPathItem' && t !== 'GroupItem') throw new Error('clear works on paths, compound paths and groups (not ' + t + '): use history undo for others.');
    // the paths under it keep their paint: remember every path's basic paint, restyle, put it back
    var ps = t === 'PathItem' ? [it] : A.paintables(it), saved = [], i;
    for (i = 0; i < ps.length; i++) saved.push(basic(ps[i]));
    var top = basic(it);
    doc.graphicStyles[0].applyTo(it);
    for (i = 0; i < ps.length; i++) restore(ps[i], saved[i]);
    if (t !== 'PathItem') { try { it.opacity = top.op; it.blendingMode = top.bm; } catch (e) {} }
  }

  A.cmd.effects = function (a) {
    var items = A.refs(a.refs), doc = A.doc(), xs = [], i, j;
    if (!items.length) throw new Error('No items for ' + A.json(a.refs) + '.');
    var add = a.add || [];
    if (!add.length && !a.clear) throw new Error('Give add: [{type, ...}] and/or clear: true.');
    for (j = 0; j < add.length; j++) xs.push(A.effectXml(add[j]));
    for (i = 0; i < items.length; i++) {
      if (a.clear) clear(items[i], doc);
      for (j = 0; j < xs.length; j++) {
        try { items[i].applyEffect(xs[j]); } catch (e) {
          throw new Error('Illustrator refused effect ' + (add[j].type || 'xml') + ' on ' + (items[i].name || items[i].typename) + (A.isMrap(e) ? ' (malformed LiveEffect XML?)' : ': ' + e.message));
        }
      }
    }
    var out = A.outList(items);
    out.effects = add.length;
    out.note = 'box includes the effects (visible bounds)';
    return out;
  };
})($.global.AIA);
