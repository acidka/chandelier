// Builder for M2-C2v2-1: Ukrainian wall calendar page, January 2027.
// Reference image measured in px; page = 1138x1274 px from (37,8); 0.4 pt/px.
var S = 0.4;
function X(px) { return (px - 37) * S; }
function Y(py) { return (py - 8) * S; }

AIA.swatch("Navy", "cmyk(100,85,35,35)");
AIA.swatch("Red", "cmyk(10,100,90,5)");
AIA.swatch("Week Grey", "gray(55)");
AIA.swatch("Rule Grey", "gray(32)");
AIA.swatch("Black", "gray(100)");

var B = "Arial Bold", R = "Arial";
var lay = AIA.layer("Calendar");

function txt(s, x, y, o, parent) {
  o.x = x; o.y = y; o.parent = parent;
  if (!o.name) { o.name = s; }
  return AIA.text(s, o);
}

// ---- Header
var gH = AIA.group("Header", lay);
txt("Січень", X(140), Y(182), {font: B, size: 50, color: "swatch:Navy", name: "Month title"}, gH);
txt("2027", X(1116), Y(182), {font: B, size: 46, color: "swatch:Navy", align: "right", name: "Year"}, gH);
AIA.line(X(120), Y(216), X(1118), Y(216), {stroke: "swatch:Navy", sw: 1.2, name: "Header rule", parent: gH});

// ---- Main January grid
var gM = AIA.group("January 2027", lay);
var cols = [318, 444, 570, 695, 820, 946, 1071];
var days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
var gDH = AIA.group("Weekday headers", gM);
txt("Тиждень", X(176), Y(279), {font: B, size: 10.5, color: "swatch:Navy", align: "center", name: "Week label"}, gDH);
var i, j;
for (i = 0; i < 7; i++) {
  txt(days[i], X(cols[i]), Y(280), {font: B, size: 15, color: (i >= 5 ? "swatch:Red" : "swatch:Black"), align: "center"}, gDH);
}
var rowsY = [377, 475, 572, 670, 767];
var weeks = ["53", "1", "2", "3", "4"];
var gW = AIA.group("Week numbers", gM);
for (i = 0; i < 5; i++) {
  txt(weeks[i], X(176), Y(rowsY[i] - 4), {font: R, size: 18, color: "swatch:Week Grey", align: "center", name: "Week " + weeks[i]}, gW);
}
var gD = AIA.group("Dates", gM);
var start = 4; // Jan 1 2027 = Friday (col 4)
for (var d = 1; d <= 31; d++) {
  var pos = start + d - 1;
  var r = Math.floor(pos / 7), c = pos % 7;
  txt(String(d), X(cols[c]), Y(rowsY[r]), {font: R, size: 25, color: (c >= 5 ? "swatch:Red" : "swatch:Black"), align: "center", name: "Jan " + d}, gD);
}
var gR = AIA.group("Row rules", gM);
var rules = [404, 501, 599, 696];
for (i = 0; i < 4; i++) {
  AIA.line(X(112), Y(rules[i]), X(1128), Y(rules[i]), {stroke: "swatch:Rule Grey", sw: 0.8, name: "Row rule " + (i + 1), parent: gR});
}

// ---- Mini months
function mini(name, title, tx, rx1, rx2, ccols, startCol, ndays) {
  var g = AIA.group(name, lay);
  txt(title, X(tx), Y(887), {font: B, size: 17, color: "swatch:Navy", name: name + " title"}, g);
  AIA.line(X(rx1), Y(910), X(rx2), Y(910), {stroke: "swatch:Navy", sw: 0.8, name: name + " rule", parent: g});
  var gh = AIA.group(name + " weekdays", g);
  for (var k = 0; k < 7; k++) {
    txt(days[k], X(ccols[k]), Y(950), {font: B, size: 10, color: (k >= 5 ? "swatch:Red" : "swatch:Black"), align: "center"}, gh);
  }
  var gd = AIA.group(name + " dates", g);
  var ry = [1005, 1050, 1095, 1139, 1184];
  for (var dd = 1; dd <= ndays; dd++) {
    var p = startCol + dd - 1;
    var rr = Math.floor(p / 7), cc = p % 7;
    txt(String(dd), X(ccols[cc]), Y(ry[rr]), {font: (cc >= 5 ? B : R), size: 12.5, color: (cc >= 5 ? "swatch:Red" : "swatch:Black"), align: "center", name: name + " " + dd}, gd);
  }
  return g;
}
mini("December 2026", "Грудень 2026", 90, 72, 540, [106, 172, 239, 305, 372, 439, 506], 1, 31);
mini("February 2027", "Лютий 2027", 653, 636, 1117, [671, 739, 808, 876, 945, 1013, 1082], 0, 28);
AIA.line(X(588), Y(862), X(588), Y(1205), {stroke: "swatch:Rule Grey", sw: 0.8, name: "Mini months divider"});
return "ok";
