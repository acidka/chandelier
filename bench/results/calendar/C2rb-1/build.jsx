// Calendar 2027 builder. Session units must be mm. Re-runnable (AIA.fresh).
var MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
var DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
var YEAR = 2027;

AIA.swatch('Navy', 'cmyk(100,85,35,30)');
AIA.swatch('Weekend Red', 'cmyk(0,95,100,10)');
AIA.swatch('Text Black', 'cmyk(0,0,0,100)');
AIA.swatch('Week Grey', 'cmyk(0,0,0,50)');
AIA.swatch('Rule Grey', 'cmyk(0,0,0,18)');
AIA.swatch('Photo Grey', 'cmyk(15,10,7,0)');

AIA.pstyle('Month Title', { font: 'Montserrat Bold', size: 58, color: 'swatch:Navy', align: 'left', tracking: -10 });
AIA.pstyle('Year Title', { font: 'Montserrat Bold', size: 58, color: 'swatch:Navy', align: 'right', tracking: -10 });
AIA.pstyle('Week Label', { font: 'Montserrat ExtraBold', size: 9.5, color: 'swatch:Navy', align: 'center' });
AIA.pstyle('Week Number', { font: 'Montserrat Medium', size: 20, color: 'swatch:Week Grey', align: 'center' });
AIA.pstyle('Day Header', { font: 'Montserrat SemiBold', size: 15, color: 'swatch:Text Black', align: 'center' });
AIA.pstyle('Day Header Weekend', { font: 'Montserrat SemiBold', size: 15, color: 'swatch:Weekend Red', align: 'center' });
AIA.pstyle('Date', { font: 'Montserrat Medium', size: 30, color: 'swatch:Text Black', align: 'center' });
AIA.pstyle('Date Weekend', { font: 'Montserrat Medium', size: 30, color: 'swatch:Weekend Red', align: 'center' });
AIA.pstyle('Mini Title', { font: 'Montserrat Bold', size: 19, color: 'swatch:Navy', align: 'left' });
AIA.pstyle('Mini Header', { font: 'Montserrat Bold', size: 10, color: 'swatch:Text Black', align: 'center' });
AIA.pstyle('Mini Header Weekend', { font: 'Montserrat Bold', size: 10, color: 'swatch:Weekend Red', align: 'center' });
AIA.pstyle('Mini Date', { font: 'Montserrat Medium', size: 13.5, color: 'swatch:Text Black', align: 'center' });
AIA.pstyle('Mini Date Weekend', { font: 'Montserrat Bold', size: 13.5, color: 'swatch:Weekend Red', align: 'center' });

function dim(y, m) { return new Date(y, m + 1, 0, 12).getDate(); }
function dow(y, m, d) { return (new Date(y, m, d, 12).getDay() + 6) % 7; } // Monday = 0
function isoWeek(y, m, d) {
  var t = new Date(new Date(y, m, d, 12).getTime() + (3 - dow(y, m, d)) * 86400000); // Thursday of that week
  var j = new Date(t.getFullYear(), 0, 1, 12);
  return 1 + Math.floor(Math.round((t - j) / 86400000) / 7);
}
// rows of 7 cells (day number or 0) for month m (may be -1 or 12; ExtendScript's Date does not roll negative months)
function weeks(y, m) {
  if (m < 0) { y--; m += 12; }
  if (m > 11) { y++; m -= 12; }
  var rows = [], row = [], i, first = dow(y, m, 1), n = dim(y, m);
  for (i = 0; i < first; i++) row.push(0);
  for (i = 1; i <= n; i++) { row.push(i); if (row.length === 7) { rows.push(row); row = []; } }
  if (row.length) { while (row.length < 7) row.push(0); rows.push(row); }
  return { y: y, m: m, rows: rows };
}

var photo = AIA.fresh('Photo');
var cal = AIA.fresh('Calendar');

function mini(g, y, m, x0, c0, ruleX1, ruleX2) {
  var w = weeks(y, m), i, r, c;
  AIA.text(MONTHS[w.m] + ' ' + w.y, { x: x0, y: 144.5, style: 'Mini Title', parent: g });
  AIA.line(ruleX1, 148.8, ruleX2, 148.8, { stroke: 'swatch:Navy', sw: 1, parent: g });
  for (c = 0; c < 7; c++) AIA.text(DAYS[c], { x: c0 + c * 11, y: 155.4, style: c > 4 ? 'Mini Header Weekend' : 'Mini Header', parent: g });
  for (r = 0; r < w.rows.length; r++)
    for (c = 0; c < 7; c++)
      if (w.rows[r][c]) AIA.text(String(w.rows[r][c]), { x: c0 + c * 11, y: 164.2 + r * 7.4, style: c > 4 ? 'Mini Date Weekend' : 'Mini Date', parent: g });
}

var counts = [];
for (var k = 0; k < 12; k++) {
  AIA.at(k, function () {
    var name = (k < 9 ? '0' : '') + (k + 1) + '_' + MONTHS[k];
    AIA.rect(-3, -3, 118, 216, { fill: 'swatch:Photo Grey', name: 'Photo area ' + name, parent: photo });
    var g = AIA.group(name, cal);
    AIA.text(MONTHS[k], { x: 127.5, y: 28.4, style: 'Month Title', parent: g });
    AIA.text(String(YEAR), { x: 288.5, y: 28.4, style: 'Year Title', parent: g });
    AIA.line(125.5, 34.4, 288.5, 34.4, { stroke: 'swatch:Navy', sw: 1.25, parent: g });
    AIA.text('Тиждень', { x: 133, y: 44.8, style: 'Week Label', parent: g });
    var c, r, w = weeks(YEAR, k), n = w.rows.length, top = 49, h = 81 / n;
    for (c = 0; c < 7; c++) AIA.text(DAYS[c], { x: 157.4 + c * 20.33, y: 44.8, style: c > 4 ? 'Day Header Weekend' : 'Day Header', parent: g });
    for (r = 0; r < n; r++) {
      var cy = top + h * (r + 0.5), firstDay = 0;
      for (c = 0; c < 7; c++) if (w.rows[r][c] && !firstDay) firstDay = w.rows[r][c];
      AIA.text(String(isoWeek(YEAR, k, firstDay)), { x: 133, y: cy + 2.5, style: 'Week Number', parent: g });
      for (c = 0; c < 7; c++)
        if (w.rows[r][c]) AIA.text(String(w.rows[r][c]), { x: 157.4 + c * 20.33, y: cy + 3.7, style: c > 4 ? 'Date Weekend' : 'Date', parent: g });
      if (r > 0) AIA.line(123, top + h * r, 289, top + h * r, { stroke: 'swatch:Rule Grey', sw: 0.75, parent: g });
    }
    mini(g, YEAR, k - 1, 119, 121, 117, 193);
    mini(g, YEAR, k + 1, 210.8, 213.8, 208.5, 288.5);
    AIA.line(200.4, 141, 200.4, 200, { stroke: 'swatch:Rule Grey', sw: 0.75, parent: g });
    counts.push(name + ':' + n + 'w');
  });
}
return counts;
