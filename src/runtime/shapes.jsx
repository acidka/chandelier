// create_shape (phase 2). ES3.
(function (A) {
  function num(v, what) {
    if (typeof v !== 'number' || !isFinite(v)) throw new Error(what + ' must be a number.');
    return v;
  }
  function makeShape(s) {
    var c = A.container(s), shape = s.shape || 'rect', it, p, w, h;
    if (shape === 'line') {
      it = c.pathItems.add();
      it.setEntirePath([A.P(num(s.x1, 'x1'), num(s.y1, 'y1')), A.P(num(s.x2, 'x2'), num(s.y2, 'y2'))]);
      it.closed = false;
      if (s.fill === undefined) s = A.merge(s, { fill: 'none' });
      if (s.stroke === undefined) s = A.merge(s, { stroke: 'gray(100)' });
      return A.finish(it, s);
    }
    num(s.x, 'x'); num(s.y, 'y'); w = A.u(num(s.w, 'w')); h = A.u(num(s.h, 'h'));
    if (!(w > 0) || !(h > 0)) throw new Error('w and h must be > 0.');
    p = A.P(s.x, s.y);
    if (shape === 'rect') it = c.pathItems.rectangle(p[1], p[0], w, h);
    else if (shape === 'rounded_rect') { var r = A.u(s.r === undefined ? 4 : s.r); it = c.pathItems.roundedRectangle(p[1], p[0], w, h, r, r); }
    else if (shape === 'ellipse') it = c.pathItems.ellipse(p[1], p[0], w, h);
    else if (shape === 'polygon' || shape === 'star') {
      var cx = p[0] + w / 2, cy = p[1] - h / 2, rad = Math.min(w, h) / 2;
      if (shape === 'polygon') it = c.pathItems.polygon(cx, cy, rad, s.sides || 6);
      else it = c.pathItems.star(cx, cy, rad, rad * (s.inner === undefined ? 0.5 : s.inner), s.points || 5);
    } else throw new Error('Unknown shape "' + shape + '". Use rect, rounded_rect, ellipse, polygon, star or line.');
    if (s.fill === undefined && s.stroke === undefined) s = A.merge(s, { fill: 'none', stroke: 'gray(100)' });
    else { if (s.fill === undefined) s = A.merge(s, { fill: 'none' }); if (s.stroke === undefined) s = A.merge(s, { stroke: 'none' }); }
    return A.finish(it, s);
  }
  A.cmd.create_shape = function (a) { return A.outList(A.createEach(a, makeShape)); };
})($.global.AIA);
