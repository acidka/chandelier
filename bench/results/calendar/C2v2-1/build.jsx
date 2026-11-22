var MONTHS = ["Січень","Лютий","Березень","Квітень","Травень","Червень","Липень","Серпень","Вересень","Жовтень","Листопад","Грудень"];
var WD = ["Пн","Вт","Ср","Чт","Пт","Сб","Нд"];

AIA.swatch("Navy", "cmyk(100,88,30,28)");
AIA.swatch("Red", "cmyk(0,100,100,8)");
AIA.swatch("Text Black", "cmyk(0,0,0,100)");
AIA.swatch("Week Grey", "cmyk(0,0,0,55)");
AIA.swatch("Rule Grey", "cmyk(0,0,0,30)");
AIA.swatch("Photo Grey", "cmyk(14,9,5,0)");

var B = "Montserrat Bold", SB = "Montserrat SemiBold", M = "Montserrat Medium", R = "Montserrat Regular";
AIA.pstyle("Month Title", {font: B, size: 58, color: "swatch:Navy", align: "left"});
AIA.pstyle("Year", {font: SB, size: 53, color: "swatch:Navy", align: "right"});
AIA.pstyle("Week Label", {font: B, size: 12.5, color: "swatch:Navy", align: "center"});
AIA.pstyle("Weekday", {font: SB, size: 17, color: "swatch:Text Black", align: "center"});
AIA.pstyle("Weekday Weekend", {font: SB, size: 17, color: "swatch:Red", align: "center"});
AIA.pstyle("Date", {font: M, size: 30, color: "swatch:Text Black", align: "center"});
AIA.pstyle("Date Weekend", {font: M, size: 30, color: "swatch:Red", align: "center"});
AIA.pstyle("Week Number", {font: R, size: 23, color: "swatch:Week Grey", align: "center"});
AIA.pstyle("Mini Title", {font: B, size: 20.5, color: "swatch:Navy", align: "left"});
AIA.pstyle("Mini Weekday", {font: SB, size: 12, color: "swatch:Text Black", align: "center"});
AIA.pstyle("Mini Weekday Weekend", {font: SB, size: 12, color: "swatch:Red", align: "center"});
AIA.pstyle("Mini Date", {font: M, size: 15, color: "swatch:Text Black", align: "center"});
AIA.pstyle("Mini Date Weekend", {font: SB, size: 15, color: "swatch:Red", align: "center"});

function dim(y, m) { return new Date(y, m + 1, 0).getDate(); }
function offs(y, m) { return (new Date(y, m, 1).getDay() + 6) % 7; } // Monday = 0
function isoWeek(y, m, d) {
  var t = new Date(Date.UTC(y, m, d));
  var dn = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dn + 3); // Thursday
  var fy = t.getUTCFullYear();
  var j4 = new Date(Date.UTC(fy, 0, 4));
  var j4dn = (j4.getUTCDay() + 6) % 7;
  var w1 = j4.getTime() - j4dn * 86400000 + 3 * 86400000; // Thursday of week 1
  return 1 + Math.round((t.getTime() - w1) / (7 * 86400000));
}

var bg = AIA.fresh("Photo area");
var lay = AIA.fresh("Calendar");
var doc = AIA.doc();
var report = [];

function mini(y, m, x0, step, parent, name) {
  var g = AIA.group(name, parent);
  AIA.text(MONTHS[m] + " " + y, {x: x0 - 2.3, y: 144.8, style: "Mini Title", parent: g, name: "Mini title"});
  AIA.line(x0 - 5, 148.6, x0 - 5 + 78.5, 148.6, {stroke: "swatch:Navy", sw: 1, name: "Mini rule", parent: g});
  var i;
  for (i = 0; i < 7; i++) {
    AIA.text(WD[i], {x: x0 + i * step, y: 155.2, style: (i >= 5 ? "Mini Weekday Weekend" : "Mini Weekday"), parent: g});
  }
  var o = offs(y, m), n = dim(y, m);
  for (var d = 1; d <= n; d++) {
    var c = (o + d - 1) % 7, r = Math.floor((o + d - 1) / 7);
    AIA.text(String(d), {x: x0 + c * step, y: 164.1 + r * 7.42, style: (c >= 5 ? "Mini Date Weekend" : "Mini Date"), parent: g});
  }
  return g;
}

for (var k = 0; k < 12; k++) {
  AIA.at(k, function () {
    var Y = 2027, m = k;
    AIA.layer("Photo area");
    AIA.rect(-3, -3, 118, 216, {fill: "swatch:Photo Grey", stroke: "none", name: "Photo area " + (k + 1), parent: bg});
    var pg = AIA.group(doc.artboards[k].name, lay);
    var hd = AIA.group("Header", pg);
    AIA.text(MONTHS[m], {x: 127.5, y: 28.5, style: "Month Title", parent: hd, name: "Month"});
    AIA.text(String(Y), {x: 287.6, y: 28.5, style: "Year", align: "right", parent: hd, name: "Year"});
    AIA.line(125.5, 34.7, 288, 34.7, {stroke: "swatch:Navy", sw: 1.7, name: "Title rule", parent: hd});

    var gr = AIA.group("Grid", pg);
    var c0 = 157.2, st = 20.32;
    AIA.text("Тиждень", {x: 132.7, y: 44.6, style: "Week Label", parent: gr, name: "Week label"});
    for (var i = 0; i < 7; i++) {
      AIA.text(WD[i], {x: c0 + i * st, y: 45.0, style: (i >= 5 ? "Weekday Weekend" : "Weekday"), parent: gr});
    }
    var o = offs(Y, m), n = dim(Y, m);
    var rows = Math.ceil((o + n) / 7);
    var rs = Math.min(16.13, (125.6 - 61.0) / (rows - 1));
    for (var r = 0; r < rows; r++) {
      var by = 61.0 + r * rs;
      var firstDay = r * 7 - o + 1; // date of Monday (may be <1)
      var dd = new Date(Y, m, firstDay);
      AIA.text(String(isoWeek(dd.getFullYear(), dd.getMonth(), dd.getDate())), {x: 132.7, y: by, style: "Week Number", parent: gr});
      if (r < rows - 1) AIA.line(122.5, by + 4.6, 289.4, by + 4.6, {stroke: "swatch:Rule Grey", sw: 0.5, name: "Row rule", parent: gr});
    }
    for (var d = 1; d <= n; d++) {
      var c = (o + d - 1) % 7, rr = Math.floor((o + d - 1) / 7);
      AIA.text(String(d), {x: c0 + c * st, y: 61.0 + rr * rs, style: (c >= 5 ? "Date Weekend" : "Date"), parent: gr});
    }
    var py = m === 0 ? Y - 1 : Y, pm = m === 0 ? 11 : m - 1;
    var ny = m === 11 ? Y + 1 : Y, nm = m === 11 ? 0 : m + 1;
    var mg = AIA.group("Mini calendars", pg);
    mini(py, pm, 120.9, 11.2, mg, "Previous month");
    mini(ny, nm, 213.7, 11.2, mg, "Next month");
    AIA.line(200.8, 140.8, 200.8, 194.8, {stroke: "swatch:Rule Grey", sw: 0.5, name: "Mini separator", parent: mg});
    report.push(MONTHS[m] + ": off " + o + " days " + n + " rows " + rows);
  });
}
return report;
