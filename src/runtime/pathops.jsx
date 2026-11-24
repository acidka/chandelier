// path_ops (phase 2). ES3. Pathfinder and friends have no DOM API: they run as menu commands on the selection.
// Verified on 29.1 (2026-11-22): Live Pathfinder works only on a GROUP, then 'expandStyle' bakes it;
// 'OffsetPath v22' is Object > Path > Outline Stroke; Offset Path = live effect "Adobe Offset Path" + expandStyle.
(function (A) {
  var PF = { unite: 'Add', minus_front: 'Subtract', minus_back: 'Minus Back', intersect: 'Intersect', exclude: 'Exclude',
    divide: 'Divide', trim: 'Trim', merge: 'Merge', crop: 'Crop' };
  var JOIN = { round: 0, bevel: 1, miter: 2 };

  function select(items) {
    var doc = A.doc();
    doc.selection = null;
    for (var i = 0; i < items.length; i++) items[i].selected = true;
    A.syncSelection(); // the menu commands below act on this selection (Windows)
  }
  function selected() {
    var s = A.doc().selection, out = [];
    if (!(s instanceof Array)) return out;
    for (var i = 0; i < s.length; i++) out.push(s[i]);
    return out;
  }
  // A group with one child is replaced by that child.
  function unwrap(it) {
    if (it.typename === 'GroupItem' && !it.clipped && it.pageItems.length === 1) {
      var k = it.pageItems[0];
      k.move(it, ElementPlacement.PLACEBEFORE);
      it.remove();
      return k;
    }
    return it;
  }
  function editable(items) {
    for (var i = 0; i < items.length; i++) if (items[i].locked || A.layerOf(items[i]).locked || items[i].hidden) throw new Error('Item ' + (items[i].name || items[i].uuid) + ' is locked or hidden.');
  }

  A.cmd.path_ops = function (a) {
    var op = a.op, items = A.refs(a.refs), out = [], i, res;
    if (!items.length) throw new Error('No items for ' + A.json(a.refs) + '.');
    editable(items);
    if (PF[op]) {
      if (items.length < 2 && !(items.length === 1 && items[0].typename === 'GroupItem')) throw new Error(op + ' needs at least 2 items (or one group).');
      var g = items.length === 1 ? items[0] : A.groupOf(items);
      select([g]);
      app.executeMenuCommand('Live Pathfinder ' + PF[op]);
      app.executeMenuCommand('expandStyle');
      res = selected();
      for (i = 0; i < res.length; i++) out.push(unwrap(res[i]));
    } else if (op === 'outline_stroke') {
      select(items);
      app.executeMenuCommand('OffsetPath v22');
      out = selected();
    } else if (op === 'offset') {
      if (a.distance === undefined) throw new Error('offset needs distance (session units; negative = inwards).');
      var xml = '<LiveEffect name="Adobe Offset Path"><Dict data="R mlim ' + (a.miter_limit || 4) + ' R ofst ' + A.u(a.distance) +
        ' I jntp ' + JOIN[a.joins || 'miter'] + ' "/></LiveEffect>';
      var src = [];
      for (i = 0; i < items.length; i++) src.push(a.keep_original ? A.track(items[i].duplicate()) : items[i]);
      for (i = 0; i < src.length; i++) src[i].applyEffect(xml);
      select(src);
      app.executeMenuCommand('expandStyle');
      res = selected();
      for (i = 0; i < res.length; i++) out.push(unwrap(res[i]));
    } else if (op === 'expand') {
      select(items);
      app.executeMenuCommand('expandStyle');
      out = selected();
    } else if (op === 'outline_text') {
      var frames = [];
      for (i = 0; i < items.length; i++) {
        if (items[i].typename === 'TextFrame') frames.push(items[i]);
        else if (items[i].typename === 'GroupItem') A.walk(function (it) { if (it.typename === 'TextFrame') frames.push(it); }, items[i]);
      }
      if (!frames.length) throw new Error('No text frames in ' + A.json(a.refs) + '.');
      for (i = 0; i < frames.length; i++) {
        var nm = frames[i].name, o = frames[i].createOutline();
        if (nm) o.name = nm;
        out.push(o);
      }
    } else throw new Error('Unknown op "' + op + '".');
    if (a.name && out.length === 1) out[0].name = a.name;
    for (i = 0; i < out.length; i++) A.track(out[i]);
    return A.outList(out);
  };
})($.global.AIA);
