// Appearance and placement helpers shared by the create/edit commands (phase 2).
// ES3. Loaded after core.jsx into the same $.global.AIA.
(function (A) {
  var BLEND = { normal: 'NORMAL', multiply: 'MULTIPLY', screen: 'SCREEN', overlay: 'OVERLAY', darken: 'DARKEN', lighten: 'LIGHTEN',
    color_dodge: 'COLORDODGE', color_burn: 'COLORBURN', hard_light: 'HARDLIGHT', soft_light: 'SOFTLIGHT', difference: 'DIFFERENCE',
    exclusion: 'EXCLUSION', hue: 'HUE', saturation: 'SATURATIONBLEND', color: 'COLORBLEND', luminosity: 'LUMINOSITY' };
  var CAP = { butt: 'BUTTENDCAP', round: 'ROUNDENDCAP', square: 'PROJECTINGENDCAP' };
  var JOIN = { miter: 'MITERENDJOIN', round: 'ROUNDENDJOIN', bevel: 'BEVELENDJOIN' };

  // Known-flaky operations (MRAP in long sessions, quirk B3) go through A.retry (core.jsx).

  // Where new items go: parent (ref of a group, or "layer:Name"), else layer (get or create), else the active layer.
  A.container = function (a) {
    if (a.parent !== undefined && a.parent !== null) {
      var s = String(a.parent), p;
      p = s.indexOf('layer:') === 0 ? A.layerByName(s.slice(6)) : A.ref(a.parent);
      if (p.typename !== 'Layer' && p.typename !== 'GroupItem') throw new Error('parent must be a layer ("layer:Name") or a group, not ' + p.typename + '.');
      return p;
    }
    if (a.layer) return A.layerGet(a.layer);
    var L = A.doc().activeLayer;
    if (L.locked || !L.visible) throw new Error('The active layer "' + L.name + '" is locked or hidden: give layer or parent.');
    return L;
  };

  // Paths and text frames that carry the paint of an item (groups: all descendants).
  function paintables(it, out) {
    var t = it.typename, i;
    if (t === 'PathItem' || t === 'TextFrame') out.push(it);
    else if (t === 'CompoundPathItem') { for (i = 0; i < it.pathItems.length; i++) out.push(it.pathItems[i]); }
    else if (t === 'GroupItem') { for (i = 0; i < it.pageItems.length; i++) paintables(it.pageItems[i], out); }
    return out;
  }
  A.paintables = function (it) { return paintables(it, []); };

  function paintOne(p, s) {
    var text = p.typename === 'TextFrame', ca = text ? p.textRange.characterAttributes : null;
    if (s.fill !== undefined) {
      if (text) ca.fillColor = A.color(s.fill);
      else if (s.fill === 'none') p.filled = false;
      else { p.filled = true; p.fillColor = A.color(s.fill); }
    }
    if (s.stroke !== undefined) {
      if (text) { ca.strokeColor = A.color(s.stroke); if (s.stroke !== 'none' && s.stroke_width === undefined && !(ca.strokeWeight > 0)) ca.strokeWeight = 1; }
      else if (s.stroke === 'none') p.stroked = false;
      else { p.stroked = true; p.strokeColor = A.color(s.stroke); }
    }
    if (s.stroke_width !== undefined) { if (text) ca.strokeWeight = s.stroke_width; else p.strokeWidth = s.stroke_width; }
    if (!text) {
      if (s.dash !== undefined) p.strokeDashes = s.dash;
      if (s.cap) p.strokeCap = StrokeCap[CAP[s.cap]];
      if (s.join) p.strokeJoin = StrokeJoin[JOIN[s.join]];
    }
  }

  // Apply appearance/state props to an item. Undefined props are left alone.
  // fill, stroke, stroke_width (pt), dash [pt...], cap, join, opacity (0-100), blend, graphic_style, name, note, hidden, locked
  A.applyStyle = function (it, s) {
    var i;
    if (s.graphic_style) {
      var gs;
      try { gs = A.doc().graphicStyles.getByName(s.graphic_style); } catch (e) { throw new Error('No graphic style named "' + s.graphic_style + '".'); }
      gs.applyTo(it);
    }
    if (s.fill !== undefined || s.stroke !== undefined || s.stroke_width !== undefined || s.dash !== undefined || s.cap || s.join) {
      var ps = A.paintables(it);
      for (i = 0; i < ps.length; i++) paintOne(ps[i], s);
    }
    if (s.opacity !== undefined) it.opacity = s.opacity;
    if (s.blend) { if (!BLEND[s.blend]) throw new Error('Unknown blend "' + s.blend + '": use normal, multiply, screen, overlay, darken, lighten, color_dodge, color_burn, hard_light, soft_light, difference, exclusion, hue, saturation, color or luminosity.'); it.blendingMode = BlendModes[BLEND[s.blend]]; }
    if (s.name !== undefined) it.name = s.name;
    if (s.note !== undefined) it.note = s.note;
    if (s.hidden !== undefined) it.hidden = s.hidden;
    if (s.locked !== undefined) it.locked = s.locked;
    return it;
  };

  // Compact result for created/changed items.
  A.out = function (it) {
    var o = { uuid: it.uuid };
    if (it.name) o.name = it.name;
    o.type = A.kindOf(it.typename);
    try { o.box = A.box(it); } catch (e) {}
    return o;
  };
  A.outList = function (items, max) {
    var o = [], n = Math.min(items.length, max || 100);
    for (var i = 0; i < n; i++) o.push(A.out(items[i]));
    var r = { count: items.length, items: o };
    if (items.length > n) r.more = (items.length - n) + ' more not listed';
    return r;
  };

  // Create through make(spec) for one spec or a.items[] (each merged over the shared args). All-or-nothing per call.
  A.createEach = function (a, make) {
    var list = a.items || [a], out = [], base = {}, k;
    for (k in a) if (a.hasOwnProperty(k) && k !== 'items') base[k] = a[k];
    for (var i = 0; i < list.length; i++) {
      var s = a.items ? A.merge(base, list[i]) : a;
      var it;
      try { it = make(s, i); } catch (e) {
        // all-or-nothing: remove what this call already made
        for (var j = out.length - 1; j >= 0; j--) { try { out[j].remove(); } catch (e2) {} }
        if (a.items) { var err = new Error('item ' + i + ': ' + e.message + (out.length ? ' (the ' + out.length + ' item(s) before it were removed again)' : '')); err.number = e.number; throw err; }
        throw e;
      }
      out.push(it);
    }
    return out;
  };
  // Run style() on a fresh item; remove it again if that fails (no orphans, quirk A8).
  A.finish = function (it, s) {
    A.track(it);
    try { A.applyStyle(it, s); } catch (e) { try { it.remove(); } catch (e2) {} throw e; }
    return it;
  };
})($.global.AIA);
