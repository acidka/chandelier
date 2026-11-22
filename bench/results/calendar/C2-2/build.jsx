// Calendar 2027 builder. Re-runnable (AIA.fresh). Session units mm; design values in pt.
var K = 1 / 2.834645669; // pt -> mm
function m(v) { return v * K; }
var doc = AIA.doc();

AIA.swatch("Navy", "cmyk(100,85,30,25)");
AIA.swatch("Weekend Red", "cmyk(0,100,100,5)");
AIA.swatch("Text Black", "cmyk(0,0,0,100)");
AIA.swatch("Week Grey", "cmyk(0,0,0,50)");
AIA.swatch("Rule Grey", "cmyk(0,0,0,25)");
AIA.swatch("Photo Grey", "cmyk(15,9,5,0)");

var F = "MontserratRoman-";
AIA.pstyle("Month Title", { font: F + "Bold", size: 54, tracking: -40, color: "swatch:Navy", align: "left" });
AIA.pstyle("Year", { font: F + "SemiBold", size: 52, tracking: -40, color: "swatch:Navy", align: "right" });
AIA.pstyle("Week Label", { font: F + "Bold", size: 11, color: "swatch:Navy", align: "center" });
AIA.pstyle("Weekday", { font: F + "SemiBold", size: 16, color: "swatch:Text Black", align: "center" });
AIA.pstyle("Weekday Weekend", { font: F + "SemiBold", size: 16, color: "swatch:Weekend Red", align: "center" });
AIA.pstyle("Date", { font: F + "Medium", size: 30, color: "swatch:Text Black", align: "center" });
AIA.pstyle("Date Weekend", { font: F + "Medium", size: 30, color: "swatch:Weekend Red", align: "center" });
AIA.pstyle("Week Number", { font: F + "Regular", size: 22, color: "swatch:Week Grey", align: "center" });
AIA.pstyle("Mini Title", { font: F + "Bold", size: 19, color: "swatch:Navy", align: "left" });
AIA.pstyle("Mini Weekday", { font: F + "SemiBold", size: 13, color: "swatch:Text Black", align: "center" });
AIA.pstyle("Mini Weekday Weekend", { font: F + "SemiBold", size: 13, color: "swatch:Weekend Red", align: "center" });
AIA.pstyle("Mini Date", { font: F + "Medium", size: 15.5, color: "swatch:Text Black", align: "center" });
AIA.pstyle("Mini Date Weekend", { font: F + "SemiBold", size: 15.5, color: "swatch:Weekend Red", align: "center" });

var MONTHS = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
var DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
var WEEK = "Тиждень";

function daysIn(y, mo) { return new Date(y, mo + 1, 0).getDate(); }
function startDow(y, mo) { var d = new Date(y, mo, 1).getDay(); return (d + 6) % 7; } // Mon=0
function isoWeek(y, mo, d) {
  var t = new Date(Date.UTC(y, mo, d));
  var dow = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dow + 3); // Thursday of this week
  var y1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  var dow1 = (y1.getUTCDay() + 6) % 7;
  y1.setUTCDate(y1.getUTCDate() - dow1 + 3);
  return 1 + Math.round((t - y1) / 604800000);
}

// artboard offsets (mm, relative to artboard 0)
var abs = doc.artboards, OFF = [];
var r0 = abs[0].artboardRect;
for (var a = 0; a < 12; a++) {
  var r = abs[a].artboardRect;
  OFF.push([(r[0] - r0[0]) * K, (r0[1] - r[1]) * K]);
}

var photoLayer = AIA.fresh("Photo area");
var calLayer = AIA.fresh("Calendar");

var COLX0 = 446, COLSTEP = 57.6, WEEKX = 376;
var GRID_L = 347, GRID_R = 821;

function mini(y, mo, ox, oy, x0, parent) {
  var g = AIA.group("Mini " + MONTHS[mo] + " " + y, parent);
  var W = 222;
  AIA.text(MONTHS[mo] + " " + y, { x: ox + m(x0 + 7), y: oy + m(410), style: "Mini Title", name: "Mini title", parent: g });
  AIA.line(ox + m(x0), oy + m(421.3), ox + m(x0 + W), oy + m(421.3), { stroke: "swatch:Navy", sw: 1, name: "Mini rule", parent: g });
  var i, cx;
  for (i = 0; i < 7; i++) {
    cx = x0 + 14.5 + i * 32;
    AIA.text(DAYS[i], { x: ox + m(cx), y: oy + m(440), style: (i >= 5 ? "Mini Weekday Weekend" : "Mini Weekday"), name: "Mini weekday " + DAYS[i], parent: g });
  }
  var s = startDow(y, mo), n = daysIn(y, mo), d, col, row;
  for (d = 1; d <= n; d++) {
    col = (s + d - 1) % 7; row = Math.floor((s + d - 1) / 7);
    cx = x0 + 14.5 + col * 32;
    AIA.text(String(d), { x: ox + m(cx), y: oy + m(466 + row * 21.2), style: (col >= 5 ? "Mini Date Weekend" : "Mini Date"), name: "Mini date " + d, parent: g });
  }
  return g;
}

for (var mo = 0; mo < 12; mo++) {
  var ox = OFF[mo][0], oy = OFF[mo][1];
  var Y = 2027;
  var pg = AIA.group((mo < 9 ? "0" : "") + (mo + 1) + "_" + MONTHS[mo], calLayer);

  // photo placeholder (empty area, bleeds left/top/bottom)
  AIA.rect(ox - 3, oy - 3, m(322) + 3, 216, { fill: "swatch:Photo Grey", stroke: "none", name: "Photo area " + (mo + 1), parent: photoLayer });

  var hg = AIA.group("Header", pg);
  AIA.text(MONTHS[mo], { x: ox + m(358), y: oy + m(81), style: "Month Title", name: "Month title", parent: hg });
  AIA.text(String(Y), { x: ox + m(816), y: oy + m(81), style: "Year", name: "Year", parent: hg });
  AIA.line(ox + m(356), oy + m(98), ox + m(816.5), oy + m(98), { stroke: "swatch:Navy", sw: 1.75, name: "Title rule", parent: hg });

  var gg = AIA.group("Main grid", pg);
  AIA.text(WEEK, { x: ox + m(WEEKX), y: oy + m(126.5), style: "Week Label", name: "Week label", parent: gg });
  var i;
  for (i = 0; i < 7; i++) {
    AIA.text(DAYS[i], { x: ox + m(COLX0 + i * COLSTEP), y: oy + m(127.5), style: (i >= 5 ? "Weekday Weekend" : "Weekday"), name: "Weekday " + DAYS[i], parent: gg });
  }
  var s = startDow(Y, mo), n = daysIn(Y, mo);
  var rows = Math.ceil((s + n) / 7);
  var step = rows <= 5 ? 45.6 : 38;
  var dg = AIA.group("Dates", gg), wg = AIA.group("Week numbers", gg), rg = AIA.group("Row rules", gg);
  var d, col, row;
  for (d = 1; d <= n; d++) {
    col = (s + d - 1) % 7; row = Math.floor((s + d - 1) / 7);
    AIA.text(String(d), { x: ox + m(COLX0 + col * COLSTEP), y: oy + m(173.4 + row * step), style: (col >= 5 ? "Date Weekend" : "Date"), name: "Date " + d, parent: dg });
  }
  for (row = 0; row < rows; row++) {
    var firstDay = row === 0 ? 1 : (row * 7 - s + 1);
    AIA.text(String(isoWeek(Y, mo, firstDay)), { x: ox + m(WEEKX), y: oy + m(171.5 + row * step), style: "Week Number", name: "Week " + (row + 1), parent: wg });
    if (row < rows - 1) {
      var ly = 173.4 + row * step + step * 0.26;
      AIA.line(ox + m(GRID_L), oy + m(ly), ox + m(GRID_R), oy + m(ly), { stroke: "swatch:Rule Grey", sw: 0.75, name: "Row rule " + (row + 1), parent: rg });
    }
  }

  var pmo = mo === 0 ? 11 : mo - 1, py = mo === 0 ? 2026 : 2027;
  var nmo = mo === 11 ? 0 : mo + 1, ny = mo === 11 ? 2028 : 2027;
  var mg = AIA.group("Mini calendars", pg);
  mini(py, pmo, ox, oy, 328, mg);
  mini(ny, nmo, ox, oy, 592, mg);
  AIA.line(ox + m(569), oy + m(399), ox + m(569), oy + m(552), { stroke: "swatch:Rule Grey", sw: 0.75, name: "Mini separator", parent: mg });
}
return { ok: true, offsets: OFF };
