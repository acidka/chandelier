// styles (phase 2) + document metadata store. ES3.
// Reading ParagraphStyle.characterAttributes crashes Illustrator (quirk B1), so the spec of every style created
// through this tool is kept in the document's XMP (namespace below) and "list" returns that spec.
(function (A) {
  var NS = 'http://ns.chandelier/1.0/';
  function xmp() {
    if (!ExternalObject.AdobeXMPScript) ExternalObject.AdobeXMPScript = new ExternalObject('lib:AdobeXMPScript');
    XMPMeta.registerNamespace(NS, 'chandelier');
  }
  // JSON values stored per document (survive save/reopen). Used for style specs; later for bleed (phase 3).
  A.metaGet = function (key, doc) {
    doc = doc || A.doc();
    try { xmp(); var m = new XMPMeta(doc.XMPString), p = m.getProperty(NS, key); return p ? A.parse(p.value) : null; } catch (e) { return null; }
  };
  A.metaSet = function (key, value, doc) {
    doc = doc || A.doc();
    xmp();
    var m = new XMPMeta(doc.XMPString);
    m.setProperty(NS, key, A.json(value));
    doc.XMPString = m.serialize();
  };

  var CHAR = ['font', 'size', 'fill', 'color', 'stroke', 'stroke_width', 'leading', 'tracking', 'baseline_shift', 'underline', 'strikethrough', 'caps', 'horizontal_scale'];
  var PARA = ['align', 'space_before', 'space_after', 'first_indent', 'left_indent', 'right_indent', 'hyphenation'];
  function pick(s, keys) { var o = {}, n = 0; for (var i = 0; i < keys.length; i++) if (s[keys[i]] !== undefined) { o[keys[i]] = s[keys[i]]; n++; } return n ? o : null; }
  function coll(doc, kind) {
    if (kind === 'paragraph') return doc.paragraphStyles;
    if (kind === 'character') return doc.characterStyles;
    if (kind === 'graphic') return doc.graphicStyles;
    throw new Error('kind must be paragraph, character or graphic.');
  }
  function get(doc, kind, name) { try { return coll(doc, kind).getByName(name); } catch (e) { return null; } }
  function textFramesOf(refs) {
    var items = A.refs(refs), out = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].typename === 'TextFrame') out.push(items[i]);
      else if (items[i].typename === 'GroupItem') A.walk(function (it) { if (it.typename === 'TextFrame') out.push(it); }, items[i]);
    }
    return out;
  }

  A.cmd.styles = function (a) {
    var doc = A.doc(), act = a.action || 'list', kind = a.kind || 'paragraph', specs = A.metaGet('styles', doc) || {}, i, st;
    var key = kind.charAt(0);
    if (!specs[key]) specs[key] = {};
    if (act === 'list') {
      var out = {}, kinds = a.kind ? [kind] : ['paragraph', 'character', 'graphic'];
      for (var k = 0; k < kinds.length; k++) {
        var c = coll(doc, kinds[k]), list = [], sp = specs[kinds[k].charAt(0)] || {};
        for (i = 0; i < c.length; i++) { var o = { name: c[i].name }; if (sp[c[i].name]) o.spec = sp[c[i].name]; list.push(o); }
        out[kinds[k]] = list;
      }
      return out;
    }
    if (!a.name) throw new Error(act + ' needs name.');
    if (act === 'create' || act === 'update') {
      if (kind === 'graphic') throw new Error('Graphic styles cannot be created from scripts: make one in Illustrator, then apply it here (or use graphic_style in modify_items).');
      st = get(doc, kind, a.name);
      if (act === 'update' && !st) throw new Error('No ' + kind + ' style named "' + a.name + '".');
      if (!st) st = coll(doc, kind).add(a.name);
      var cs = pick(a, CHAR), ps = kind === 'paragraph' ? pick(a, PARA) : null;
      A.retry(function () {
        if (cs) A.setCharAttrs(st.characterAttributes, cs);
        if (ps) A.setParaAttrs(st.paragraphAttributes, ps);
      });
      var prev = act === 'update' && specs[key][a.name] ? specs[key][a.name] : {}, merged = A.merge(prev, A.merge(cs || {}, ps || {}));
      if (a.new_name) { st.name = a.new_name; delete specs[key][a.name]; specs[key][a.new_name] = merged; }
      else specs[key][a.name] = merged;
      A.metaSet('styles', specs, doc);
      var res = { kind: kind, name: st.name, spec: merged };
      if (a.refs !== undefined) res.applied = applyTo(doc, kind, st, a);
      return res;
    }
    if (act === 'apply') {
      st = get(doc, kind, a.name);
      if (!st) throw new Error('No ' + kind + ' style named "' + a.name + '".');
      return { kind: kind, name: st.name, applied: applyTo(doc, kind, st, a) };
    }
    if (act === 'remove') {
      st = get(doc, kind, a.name);
      if (!st) throw new Error('No ' + kind + ' style named "' + a.name + '".');
      st.remove();
      if (specs[key][a.name]) { delete specs[key][a.name]; A.metaSet('styles', specs, doc); }
      return { removed: a.name };
    }
    throw new Error('Unknown styles action "' + act + '".');
  };
  function applyTo(doc, kind, st, a) {
    if (a.refs === undefined) throw new Error('apply needs refs.');
    var n = 0, i;
    if (kind === 'graphic') {
      var items = A.refs(a.refs);
      for (i = 0; i < items.length; i++) { st.applyTo(items[i]); n++; }
      return n;
    }
    var frames = textFramesOf(a.refs);
    if (!frames.length) throw new Error('No text frames in ' + A.json(a.refs) + '.');
    for (i = 0; i < frames.length; i++) {
      var tf = frames[i];
      if (kind === 'character' && a.match !== undefined) {
        var hay = tf.contents, k = 0;
        while ((k = hay.indexOf(a.match, k)) >= 0) { var r = tf.textRange.characters[k]; r.length = a.match.length; st.applyTo(r, a.clear_overrides !== false); k += a.match.length; n++; }
      } else {
        (function (t) { A.retry(function () { st.applyTo(t.textRange, a.clear_overrides !== false); }); })(tf);
        n++;
      }
    }
    return n;
  }
})($.global.AIA);
