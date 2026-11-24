// recipe: calendar-month - one month block: month + year title, weekday row, date grid (weekends in their colour), optional ISO week numbers; paragraph styles per role
// args: {year, month: 1-12, x: 0, y: 0, w, h (session units; default the reference artboard), lang: "en"|"uk", week_start: "mon"|"sun", week_numbers: false, font: "Arial", bold_font: "Arial Bold", colors: {title, text, weekend, muted}, style_prefix: "Cal ", name}
var o = arguments[0] || {};
if (!o.year || !o.month || o.month < 1 || o.month > 12) throw new Error('calendar-month needs year and month (1-12).');
var L = {
  en: { months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], week: 'Week' },
  uk: { months: ['\u0421\u0456\u0447\u0435\u043d\u044c', '\u041b\u044e\u0442\u0438\u0439', '\u0411\u0435\u0440\u0435\u0437\u0435\u043d\u044c', '\u041a\u0432\u0456\u0442\u0435\u043d\u044c', '\u0422\u0440\u0430\u0432\u0435\u043d\u044c', '\u0427\u0435\u0440\u0432\u0435\u043d\u044c', '\u041b\u0438\u043f\u0435\u043d\u044c', '\u0421\u0435\u0440\u043f\u0435\u043d\u044c', '\u0412\u0435\u0440\u0435\u0441\u0435\u043d\u044c', '\u0416\u043e\u0432\u0442\u0435\u043d\u044c', '\u041b\u0438\u0441\u0442\u043e\u043f\u0430\u0434', '\u0413\u0440\u0443\u0434\u0435\u043d\u044c'], days: ['\u041f\u043d', '\u0412\u0442', '\u0421\u0440', '\u0427\u0442', '\u041f\u0442', '\u0421\u0431', '\u041d\u0434'], week: '\u0422\u0438\u0436\u0434\u0435\u043d\u044c' }
}[o.lang || 'en'];
if (!L) throw new Error('lang must be "en" or "uk" (or give months/days in names: {months, days, week}).');
if (o.names) L = { months: o.names.months || L.months, days: o.names.days || L.days, week: o.names.week || L.week };
var ab = AIA.doc().artboards[AIA.doc().artboards.getActiveArtboardIndex()].artboardRect;
var x = o.x || 0, y = o.y || 0;
var w = o.w || (ab[2] - ab[0]) / AIA.u(1), h = o.h || (ab[1] - ab[3]) / AIA.u(1);
var c = o.colors || {};
var cTitle = c.title || 'cmyk(100,85,35,30)', cText = c.text || 'gray(100)', cWeekend = c.weekend || 'cmyk(10,100,90,5)', cMuted = c.muted || 'gray(55)';
var font = o.font || 'Arial', bold = o.bold_font || 'Arial Bold', P = o.style_prefix === undefined ? 'Cal ' : o.style_prefix;
var sun = o.week_start === 'sun', wk = !!o.week_numbers;
// day order and which columns are the weekend
var order = sun ? [6, 0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6]; // indices into L.days (Mon=0 .. Sun=6)
var first = new Date(o.year, o.month - 1, 1), days = new Date(o.year, o.month, 0).getDate();
var lead = sun ? first.getDay() : (first.getDay() + 6) % 7; // empty cells before the 1st
var rows = Math.ceil((lead + days) / 7);
// geometry (session units) and type sizes (pt)
var titleH = h * 0.18, headH = h * 0.09, rowH = (h - titleH - headH) / rows;
var wkW = wk ? w * 0.09 : 0, colW = (w - wkW) / 7;
var pt = function (v) { return AIA.u(v); };
var sTitle = Math.min(pt(titleH) * 0.62, pt(w) / 7), sHead = Math.min(pt(headH) * 0.45, pt(colW) * 0.32), sDate = Math.min(pt(rowH) * 0.5, pt(colW) * 0.5);
AIA.pstyle(P + 'Title', { font: bold, size: sTitle, color: cTitle });
AIA.pstyle(P + 'Weekday', { font: bold, size: sHead, color: cText, align: 'center' });
AIA.pstyle(P + 'Date', { font: font, size: sDate, color: cText, align: 'center' });
if (wk) AIA.pstyle(P + 'Week', { font: font, size: sDate * 0.6, color: cMuted, align: 'center' });
var g = AIA.group(o.name || ('Calendar ' + o.year + '-' + (o.month < 10 ? '0' : '') + o.month));
var base = function (top, hh, size) { return top + hh * 0.5 + size * 0.35 / AIA.u(1); }; // baseline that centres digits in the cell
AIA.text(L.months[o.month - 1], { x: x, y: y + titleH * 0.72, style: P + 'Title', parent: g, name: 'Month' });
AIA.text(String(o.year), { x: x + w, y: y + titleH * 0.72, style: P + 'Title', align: 'right', parent: g, name: 'Year' });
AIA.line(x, y + titleH * 0.86, x + w, y + titleH * 0.86, { stroke: cTitle, sw: Math.max(0.5, sTitle * 0.04), parent: g, name: 'Title rule' });
var hy = base(y + titleH, headH, sHead);
if (wk) AIA.text(L.week, { x: x + wkW / 2, y: hy, style: P + 'Weekday', size: sHead * 0.75, color: cMuted, parent: g });
for (var i = 0; i < 7; i++) {
  var di = order[i], weekend = di >= 5;
  AIA.text(L.days[di], { x: x + wkW + colW * (i + 0.5), y: hy, style: P + 'Weekday', color: weekend ? cWeekend : undefined, parent: g });
}
function isoWeek(d) {
  var t = new Date(d.getFullYear(), d.getMonth(), d.getDate()), dn = (t.getDay() + 6) % 7;
  t.setDate(t.getDate() - dn + 3);
  var fy = new Date(t.getFullYear(), 0, 4);
  return 1 + Math.round(((t - fy) / 86400000 - 3 + (fy.getDay() + 6) % 7) / 7);
}
var cells = 0;
for (var r = 0; r < rows; r++) {
  var top = y + titleH + headH + rowH * r, by = base(top, rowH, sDate);
  if (r > 0) AIA.line(x, top, x + w, top, { stroke: cMuted, sw: 0.25, parent: g });
  if (wk) {
    var anyDay = Math.max(1, Math.min(days, r * 7 - lead + 1)); // a day of this row inside the month
    AIA.text(String(isoWeek(new Date(o.year, o.month - 1, anyDay))), { x: x + wkW / 2, y: by, style: P + 'Week', parent: g });
  }
  for (var col = 0; col < 7; col++) {
    var day = r * 7 + col - lead + 1;
    if (day < 1 || day > days) continue;
    var dIdx = order[col];
    AIA.text(String(day), { x: x + wkW + colW * (col + 0.5), y: by, style: P + 'Date', color: dIdx >= 5 ? cWeekend : undefined, parent: g });
    cells++;
  }
}
return { group: g.name, rows: rows, days: cells, styles: [P + 'Title', P + 'Weekday', P + 'Date'].concat(wk ? [P + 'Week'] : []) };
