// create_text, edit_text (phase 2). ES3.
// Never reads ParagraphStyle.characterAttributes (crashes Illustrator, quirk B1): styles are only written/applied.
(function (A) {
  var JUST = { left: 'LEFT', center: 'CENTER', right: 'RIGHT', justify: 'FULLJUSTIFYLASTLINELEFT', justify_all: 'FULLJUSTIFY' };
  var CAPS = { normal: 'NORMAL', all: 'ALLCAPS', small: 'SMALLCAPS', all_small: 'ALLSMALLCAPS' };

  function styleByName(coll, name, what) {
    try { return coll.getByName(name); } catch (e) { throw new Error('No ' + what + ' named "' + name + '".'); }
  }
  // Character attributes on a TextRange. Colours via "fill"/"color".
  A.charStyle = function (r, s) {
    if (s.character_style) styleByName(A.doc().characterStyles, s.character_style, 'character style').applyTo(r, true);
    A.setCharAttrs(r.characterAttributes, s);
  };
  // Text colour. A scripted gradient on characters renders black (quirk C33: whatever origin/length or route), so
  // refuse it instead of producing black text silently (bugs.md #14).
  A.GRAD_TEXT = 'Gradients on live text render black when set by a script (Illustrator, quirk C33): use a solid colour, ' +
    'or outline the text (path_ops {op: "outline_text"}) and fill the outlines with the gradient.';
  A.textColor = function (spec) {
    if (String(spec).indexOf('gradient:') === 0) throw new Error(A.GRAD_TEXT);
    return A.color(spec);
  };
  // Write character attributes (also on a style's characterAttributes: writing is safe, reading is not, B1).
  A.setCharAttrs = function (ca, s) {
    var col = s.fill !== undefined ? s.fill : s.color;
    if (s.font) ca.textFont = A.font(s.font);
    if (s.size !== undefined) ca.size = s.size;
    if (col !== undefined) ca.fillColor = A.textColor(col);
    if (s.stroke !== undefined) { ca.strokeColor = A.textColor(s.stroke); if (s.stroke !== 'none' && s.stroke_width === undefined) ca.strokeWeight = 1; }
    if (s.stroke_width !== undefined) ca.strokeWeight = s.stroke_width;
    if (s.leading !== undefined) { if (s.leading === 'auto') ca.autoLeading = true; else { ca.autoLeading = false; ca.leading = s.leading; } }
    if (s.tracking !== undefined) ca.tracking = s.tracking;
    if (s.baseline_shift !== undefined) ca.baselineShift = s.baseline_shift;
    if (s.underline !== undefined) ca.underline = s.underline;
    if (s.strikethrough !== undefined) ca.strikeThrough = s.strikethrough;
    if (s.caps) ca.capitalization = FontCapsOption[CAPS[s.caps]];
    if (s.horizontal_scale !== undefined) ca.horizontalScale = s.horizontal_scale;
  };
  // Paragraph attributes on a TextRange.
  A.paraStyle = function (r, s) {
    if (s.paragraph_style) styleByName(A.doc().paragraphStyles, s.paragraph_style, 'paragraph style').applyTo(r, true);
    A.setParaAttrs(r.paragraphAttributes, s);
  };
  A.setParaAttrs = function (pa, s) {
    if (s.align) { if (!JUST[s.align]) throw new Error('Unknown align "' + s.align + '".'); pa.justification = Justification[JUST[s.align]]; }
    if (s.space_before !== undefined) pa.spaceBefore = s.space_before;
    if (s.space_after !== undefined) pa.spaceAfter = s.space_after;
    if (s.first_indent !== undefined) pa.firstLineIndent = s.first_indent;
    if (s.left_indent !== undefined) pa.leftIndent = s.left_indent;
    if (s.right_indent !== undefined) pa.rightIndent = s.right_indent;
    if (s.hyphenation !== undefined) pa.hyphenation = s.hyphenation;
  };
  function textOf(s) {
    var t = s.text !== undefined ? s.text : s.contents;
    if (t === undefined || t === null) throw new Error('text is required.');
    return String(t).replace(/\r\n|\n/g, '\r');
  }
  // Move an item so its visible top-left is at (x, y) in session coordinates.
  A.moveTo = function (it, x, y) {
    var b = A.box(it), p0 = A.P(b[0], b[1]), p1 = A.P(x === undefined ? b[0] : x, y === undefined ? b[1] : y);
    it.translate(p1[0] - p0[0], p1[1] - p0[1]);
  };
  A.overset = function (tf) {
    try {
      if (tf.kind === TextType.POINTTEXT) return false;
      var n = tf.characters.length;
      if (!n) return false;
      if (!tf.lines.length) return true;
      var l = tf.lines[tf.lines.length - 1];
      return l.characterOffset - 1 + l.length < n;
    } catch (e) { return false; }
  };

  function makeText(s) {
    var c = A.container(s), kind = s.kind || (s.on_path !== undefined ? 'path' : (s.w !== undefined ? 'area' : 'point')), tf, host = null;
    var text = textOf(s);
    if (kind === 'point') {
      tf = c.textFrames.pointText(A.P(s.x || 0, s.y || 0));
    } else if (kind === 'area') {
      if (!(s.w > 0) || !(s.h > 0)) throw new Error('area text needs w and h (> 0).');
      var p = A.P(s.x || 0, s.y || 0);
      host = c.pathItems.rectangle(p[1], p[0], A.u(s.w), A.u(s.h));
      tf = c.textFrames.areaText(host);
    } else if (kind === 'path') {
      if (s.on_path === undefined) throw new Error('path text needs on_path (a path ref).');
      var src = A.ref(s.on_path);
      if (src.typename !== 'PathItem') throw new Error('on_path must be a path, not ' + src.typename + '.');
      host = s.keep_path ? src.duplicate() : src;
      tf = c.textFrames.pathText(host);
    } else throw new Error('Unknown text kind "' + kind + '". Use point, area or path.');
    A.track(tf);
    try {
      tf.contents = text;
      A.retry(function () {
        A.paraStyle(tf.textRange, s);
        A.charStyle(tf.textRange, s);
      });
      A.applyStyle(tf, { opacity: s.opacity, blend: s.blend, name: s.name, note: s.note, hidden: s.hidden, locked: s.locked });
      if (kind === 'point' && s.y_ref === 'top') A.moveTo(tf, undefined, s.y || 0);
    } catch (e) {
      try { tf.remove(); } catch (e2) {}
      throw e;
    }
    return tf;
  }
  A.cmd.create_text = function (a) {
    var made = A.createEach(a, makeText), res = A.outList(made);
    var over = [];
    for (var i = 0; i < made.length; i++) if (A.overset(made[i])) over.push(made[i].uuid);
    if (over.length) { res.overset = over; A.warn(over.length + ' area/path text frame(s) are too small for their text (overset): ' + over.join(', ')); }
    return res;
  };

  // -- edit_text ---------------------------------------------------------------------
  // occurrences of needle in hay: [[start, length], ...]
  function findAll(hay, needle, ci) {
    var out = [], h = ci ? hay.toLowerCase() : hay, n = ci ? needle.toLowerCase() : needle, k = 0;
    if (!n.length) return out;
    while ((k = h.indexOf(n, k)) >= 0) { out.push([k, n.length]); k += n.length; }
    return out;
  }
  function rangeAt(tf, start, len) {
    var r = tf.textRange.characters[start];
    r.length = len;
    return r;
  }
  var CHAR_KEYS = ['character_style', 'font', 'size', 'fill', 'color', 'stroke', 'stroke_width', 'leading', 'tracking', 'baseline_shift', 'underline', 'strikethrough', 'caps', 'horizontal_scale'];
  var PARA_KEYS = ['paragraph_style', 'align', 'space_before', 'space_after', 'first_indent', 'left_indent', 'right_indent', 'hyphenation'];
  function anyKey(s, keys) { for (var i = 0; i < keys.length; i++) if (s[keys[i]] !== undefined) return true; return false; }

  A.cmd.edit_text = function (a) {
    var frames = [], i, j, k, total = 0;
    if (a.refs !== undefined) {
      var rs = A.refs(a.refs);
      for (i = 0; i < rs.length; i++) {
        if (rs[i].typename === 'TextFrame') frames.push(rs[i]);
        else if (rs[i].typename === 'GroupItem') A.walk(function (it) { if (it.typename === 'TextFrame') frames.push(it); }, rs[i]);
      }
    } else if (a.replace) A.walk(function (it) { if (it.typename === 'TextFrame') frames.push(it); });
    else throw new Error('Give refs (text frames or groups), or replace:{find, with} to work on every text frame.');
    if (!frames.length) throw new Error('No text frames in ' + A.json(a.refs) + '.');
    var changed = [];
    for (i = 0; i < frames.length; i++) {
      var tf = frames[i], n = 0;
      if (tf.locked) { A.warn('Skipped locked text frame ' + tf.uuid + '.'); continue; }
      if (a.contents !== undefined) { tf.contents = String(a.contents).replace(/\r\n|\n/g, '\r'); n++; }
      if (a.replace) {
        var find = String(a.replace.find), rep = String(a.replace['with'] === undefined ? '' : a.replace['with']).replace(/\n/g, '\r');
        var hits = findAll(tf.contents, find, a.replace.ignore_case);
        if (a.replace.all === false && hits.length > 1) hits = [hits[0]];
        // replace from the end so earlier offsets stay valid; styling of the first replaced character is kept
        for (k = hits.length - 1; k >= 0; k--) { rangeAt(tf, hits[k][0], hits[k][1]).contents = rep; n++; }
      }
      if (anyKey(a, PARA_KEYS)) { A.retry(function () { A.paraStyle(tf.textRange, a); }); n++; }
      if (anyKey(a, CHAR_KEYS)) { A.retry(function () { A.charStyle(tf.textRange, a); }); n++; }
      if (a.ranges) {
        for (j = 0; j < a.ranges.length; j++) {
          var R = a.ranges[j], spans = [];
          if (R.match !== undefined) {
            spans = findAll(tf.contents, String(R.match), R.ignore_case);
            if (R.nth !== undefined) spans = spans.length > R.nth ? [spans[R.nth]] : [];
          } else {
            var len = tf.contents.length, st = R.start || 0, en = R.end === undefined ? len : R.end;
            if (st < 0) st = Math.max(0, len + st);
            if (en < 0) en = Math.max(0, len + en);
            if (en > st) spans = [[st, Math.min(en, len) - st]];
          }
          for (k = 0; k < spans.length; k++) {
            var rg = rangeAt(tf, spans[k][0], spans[k][1]);
            (function (rg2, R2) { A.retry(function () { if (anyKey(R2, PARA_KEYS)) A.paraStyle(rg2, R2); A.charStyle(rg2, R2); }); })(rg, R);
            n++;
          }
        }
      }
      if (n) { total += n; changed.push(tf); }
    }
    var res = A.outList(changed);
    res.edits = total;
    var over = [];
    for (i = 0; i < changed.length; i++) if (A.overset(changed[i])) over.push(changed[i].uuid);
    if (over.length) { res.overset = over; A.warn(over.length + ' text frame(s) now overset: ' + over.join(', ')); }
    return res;
  };
})($.global.AIA);
