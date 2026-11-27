// Calendar 2027 builder: run_script {file}, session units mm. Re-runnable (AIA.fresh).
var YEAR = 2027;
var MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
var DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

AIA.swatch('Navy', 'cmyk(100,85,35,30)');
AIA.swatch('Red', 'cmyk(0,95,100,5)');
AIA.swatch('Ink', 'cmyk(0,0,0,100)');
AIA.swatch('Week Grey', 'cmyk(0,0,0,60)');
AIA.swatch('Rule Grey', 'cmyk(0,0,0,20)');
AIA.swatch('Photo Grey', 'cmyk(14,9,6,0)');

var F = 'Montserrat';
AIA.pstyle('Month Title', { font: F + ' ExtraBold', size: 57, color: 'swatch:Navy', tracking: -10, align: 'left' });
AIA.pstyle('Year', { font: F + ' SemiBold', size: 48, color: 'swatch:Navy', tracking: -10, align: 'right' });
AIA.pstyle('Week Label', { font: F + ' Bold', size: 10.5, color: 'swatch:Navy', align: 'center' });
AIA.pstyle('Weekday', { font: F + ' Bold', size: 15, color: 'swatch:Ink', align: 'center' });
AIA.pstyle('Weekday Weekend', { font: F + ' Bold', size: 15, color: 'swatch:Red', align: 'center' });
AIA.pstyle('Week Number', { font: F + ' Medium', size: 21, color: 'swatch:Week Grey', align: 'center' });
AIA.pstyle('Date', { font: F + ' SemiBold', size: 34, color: 'swatch:Ink', align: 'center' });
AIA.pstyle('Date Weekend', { font: F + ' SemiBold', size: 34, color: 'swatch:Red', align: 'center' });
AIA.pstyle('Week Number Compact', { font: F + ' Medium', size: 19, color: 'swatch:Week Grey', align: 'center' });
AIA.pstyle('Date Compact', { font: F + ' SemiBold', size: 30, color: 'swatch:Ink', align: 'center' });
AIA.pstyle('Date Weekend Compact', { font: F + ' SemiBold', size: 30, color: 'swatch:Red', align: 'center' });
AIA.pstyle('Mini Title', { font: F + ' ExtraBold', size: 18.5, color: 'swatch:Navy', align: 'left' });
AIA.pstyle('Mini Weekday', { font: F + ' Bold', size: 10.5, color: 'swatch:Ink', align: 'center' });
AIA.pstyle('Mini Weekday Weekend', { font: F + ' Bold', size: 10.5, color: 'swatch:Red', align: 'center' });
AIA.pstyle('Mini Date', { font: F + ' SemiBold', size: 13.5, color: 'swatch:Ink', align: 'center' });
AIA.pstyle('Mini Date Weekend', { font: F + ' SemiBold', size: 13.5, color: 'swatch:Red', align: 'center' });

function daysIn(y, m) { return new Date(y, m + 1, 0, 12).getDate(); }
function dow(y, m, d) { return (new Date(y, m, d, 12).getDay() + 6) % 7; } // Monday = 0
function isoWeek(y, m, d) {
  var t = new Date(y, m, d, 12), wd = (t.getDay() + 6) % 7;
  var th = new Date(y, m, d - wd + 3, 12), ty = th.getFullYear();
  var jan4 = new Date(ty, 0, 4, 12), w1 = new Date(ty, 0, 4 - (jan4.getDay() + 6) % 7, 12);
  return 1 + Math.round((th - w1) / 86400000 / 7 - 3 / 7);
}

var photo = AIA.fresh('Photo area');
var cal = AIA.fresh('Calendar');

// main grid geometry (mm)
var COL0 = 155.8, DCOL = 20.6, WEEKX = 132.5, ROWTOP = 49.9, ROWH = 79.7;
var MINI = [{ x: 118.6, c0: 120.7, rule: [115.1, 192.3] }, { x: 211.0, c0: 213.8, rule: [208.8, 288.0] }];
var MDX = 11.15, MDY = 7.33;

function mini(g, y, m, k) {
  var o = MINI[k], i, d, first = dow(y, m, 1), n = daysIn(y, m);
  AIA.text(MONTHS[m] + ' ' + y, { x: o.x, y: 144.7, style: 'Mini Title', parent: g });
  AIA.line(o.rule[0], 148.8, o.rule[1], 148.8, { stroke: 'swatch:Navy', sw: 0.75, parent: g });
  for (i = 0; i < 7; i++) AIA.text(DAYS[i], { x: o.c0 + i * MDX, y: 155.2, style: i > 4 ? 'Mini Weekday Weekend' : 'Mini Weekday', parent: g });
  for (d = 1; d <= n; d++) {
    var c = (first + d - 1) % 7, r = Math.floor((first + d - 1) / 7);
    AIA.text(String(d), { x: o.c0 + c * MDX, y: 164.2 + r * MDY, style: c > 4 ? 'Mini Date Weekend' : 'Mini Date', parent: g });
  }
}

var out = [];
for (var m = 0; m < 12; m++) {
  AIA.at(m, function () {
    var tag = (m < 9 ? '0' : '') + (m + 1);
    AIA.rect(-3, -3, 117, 216, { fill: 'swatch:Photo Grey', name: 'Photo ' + tag, parent: photo });
    var g = AIA.group('Page ' + tag, cal), i, d;
    AIA.text(MONTHS[m], { x: 127.6, y: 28.4, style: 'Month Title', parent: g });
    AIA.text(String(YEAR), { x: 288.0, y: 28.4, style: 'Year', parent: g });
    AIA.line(127.6, 34.5, 288.0, 34.5, { stroke: 'swatch:Navy', sw: 1.25, parent: g });
    AIA.text('Тиждень', { x: WEEKX, y: 45.2, style: 'Week Label', parent: g });
    for (i = 0; i < 7; i++) AIA.text(DAYS[i], { x: COL0 + i * DCOL, y: 45.2, style: i > 4 ? 'Weekday Weekend' : 'Weekday', parent: g });

    var first = dow(YEAR, m, 1), n = daysIn(YEAR, m), rows = Math.ceil((first + n) / 7);
    var pitch = ROWH / rows, size = rows > 5 ? 30 : 34, sfx = rows > 5 ? ' Compact' : '';
    var off = pitch / 2 + size * 0.70 * 0.3528 / 2;
    for (var r = 0; r < rows; r++) {
      var base = ROWTOP + r * pitch + off;
      AIA.text(String(isoWeek(YEAR, m, 1 - first + r * 7)), { x: WEEKX, y: base - 0.4, style: 'Week Number' + sfx, parent: g });
      if (r > 0) AIA.line(121.8, ROWTOP + r * pitch, 289.2, ROWTOP + r * pitch, { stroke: 'swatch:Rule Grey', sw: 0.75, parent: g });
    }
    for (d = 1; d <= n; d++) {
      var c = (first + d - 1) % 7, rr = Math.floor((first + d - 1) / 7);
      AIA.text(String(d), { x: COL0 + c * DCOL, y: ROWTOP + rr * pitch + off, style: (c > 4 ? 'Date Weekend' : 'Date') + sfx, parent: g });
    }
    var py = m === 0 ? YEAR - 1 : YEAR, pm = m === 0 ? 11 : m - 1;
    var ny = m === 11 ? YEAR + 1 : YEAR, nm = m === 11 ? 0 : m + 1;
    mini(g, py, pm, 0);
    mini(g, ny, nm, 1);
    AIA.line(200.7, 141.2, 200.7, 194.9, { stroke: 'swatch:Rule Grey', sw: 0.75, parent: g });
    out.push(MONTHS[m] + ': ' + rows + ' rows, weeks ' + isoWeek(YEAR, m, 1 - first) + '-' + isoWeek(YEAR, m, n));
  });
}
return out;
