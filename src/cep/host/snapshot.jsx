// Chandelier panel: what the designer has in front of them, as one JSON string (ES3, no JSON object).
// Run by the panel every poll tick through evalScript; must stay cheap: no item walks, at most 10 selected items read.
// Fields: doc (active document name or null), path (its file, "" while never saved), docs (open documents), saved,
// count (selected items), items
// [{uuid, type, name, text?}], text (when the selection is a text cursor or range: {uuid of the frame, text}).
(function () {
  function q(s) {
    s = String(s);
    var o = '"', i, c, ch, h;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i); ch = s.charAt(i);
      if (ch === '"' || ch === '\\') o += '\\' + ch;
      else if (c < 32 || c > 126) { h = c.toString(16); while (h.length < 4) h = '0' + h; o += '\\u' + h; }
      else o += ch;
    }
    return o + '"';
  }
  function uuidOf(it) { try { return it.uuid; } catch (e) { return ''; } }
  try {
    if (app.documents.length === 0) return '{"doc":null,"path":"","docs":0,"saved":true,"count":0,"items":[]}';
    var d = app.activeDocument, s = d.selection, items = [], n = 0, i, it, e, tx = '', p = '';
    try { if (String(d.path) !== '') p = d.fullName.fsName; } catch (e2) {}
    if (s && s.typename === 'TextRange') {
      var frame = null;
      try { frame = s.story.textFrames[0]; } catch (e1) {}
      tx = ',"text":{"uuid":' + q(frame ? uuidOf(frame) : '') + ',"text":' + q(String(s.contents).substring(0, 200)) + '}';
      n = frame ? 1 : 0;
      if (frame) items.push('{"uuid":' + q(uuidOf(frame)) + ',"type":"TextFrame","name":' + q(frame.name) + '}');
    } else if (s) {
      n = s.length || 0;
      for (i = 0; i < n && i < 10; i++) {
        it = s[i];
        e = '{"uuid":' + q(uuidOf(it)) + ',"type":' + q(it.typename) + ',"name":' + q(it.name);
        if (it.typename === 'TextFrame') e += ',"text":' + q(String(it.contents).substring(0, 80));
        items.push(e + '}');
      }
    }
    return '{"doc":' + q(d.name) + ',"path":' + q(p) + ',"docs":' + app.documents.length + ',"saved":' + (d.saved ? 'true' : 'false') +
      ',"count":' + n + ',"items":[' + items.join(',') + ']' + tx + '}';
  } catch (err) {
    return '{"error":' + q(err.message || err) + '}';
  }
})();
