// Builder for M2-C2v2-2: January 2027 calendar (Ukrainian). Coordinates measured in reference image px,
// page = image x 36..1176, y 8..1282; scale 0.5 pt/px.
function X(px) { return (px - 36) * 0.5; }
function Y(py) { return (py - 8) * 0.5; }

AIA.swatch("Navy", "cmyk(100,85,30,30)");
AIA.swatch("Red", "cmyk(10,100,95,5)");
AIA.swatch("Grey Text", "cmyk(0,0,0,55)");
AIA.swatch("Grey Rule", "cmyk(0,0,0,30)");
AIA.swatch("Text Black", "cmyk(0,0,0,100)");

var REG = "Arial", BOLD = "Arial Bold";
var dayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

var L = AIA.layer("Calendar");
var doc = AIA.doc();
// remove default empty layers other than Calendar
for (var li = doc.layers.length - 1; li >= 0; li--) {
  if (doc.layers[li].name != "Calendar" && doc.layers[li].pageItems.length == 0) doc.layers[li].remove();
}

// ---------- Header ----------
var gHead = AIA.group("Header", L);
AIA.text("Січень", {x: X(142), y: Y(182), font: BOLD, size: 63, color: "swatch:Navy", name: "Month title", parent: gHead});
AIA.text("2027", {x: X(1116), y: Y(182), font: BOLD, size: 57, color: "swatch:Navy", align: "right", name: "Year", parent: gHead});
AIA.line(X(121), Y(216), X(1118), Y(216), {stroke: "swatch:Navy", sw: 1.5, name: "Title rule", parent: gHead});

// ---------- Main month ----------
var gMain = AIA.group("January 2027", L);
var colX = [318, 444, 570, 695, 821, 946, 1071];
var gMH = AIA.group("Weekday headers", gMain);
AIA.text("Тиждень", {x: X(176), y: Y(280), font: BOLD, size: 12.5, color: "swatch:Navy", align: "center", name: "Week label", parent: gMH});
for (var i = 0; i < 7; i++) {
  AIA.text(dayNames[i], {x: X(colX[i]), y: Y(281), font: BOLD, size: 17.5, color: (i >= 5 ? "swatch:Red" : "swatch:Text Black"), align: "center", name: "Hdr " + dayNames[i], parent: gMH});
}
var rowsB = [380, 477, 574, 671, 768];
var weeks = [53, 1, 2, 3, 4];
var gWk = AIA.group("Week numbers", gMain);
var gDays = AIA.group("Days", gMain);
var day = 1, startCol = 4; // Jan 1 2027 = Friday
for (var r = 0; r < 5; r++) {
  AIA.text(String(weeks[r]), {x: X(175), y: Y(rowsB[r] - 8), font: REG, size: 21.5, color: "swatch:Grey Text", align: "center", name: "Week " + weeks[r], parent: gWk});
  for (var c = (r == 0 ? startCol : 0); c < 7 && day <= 31; c++) {
    AIA.text(String(day), {x: X(colX[c]), y: Y(rowsB[r]), font: REG, size: 33, color: (c >= 5 ? "swatch:Red" : "swatch:Text Black"), align: "center", name: "Jan " + day, parent: gDays});
    day++;
  }
}
var gRules = AIA.group("Row rules", gMain);
var ruleY = [404, 501, 599, 696];
for (var k = 0; k < ruleY.length; k++) {
  AIA.line(X(112), Y(ruleY[k]), X(1128), Y(ruleY[k]), {stroke: "swatch:Grey Rule", sw: 1, name: "Row rule " + (k + 1), parent: gRules});
}

// ---------- Mini months ----------
function mini(name, title, titleX, ruleX1, ruleX2, cols, startCol, nDays, prefix) {
  var g = AIA.group(name, L);
  AIA.text(title, {x: X(titleX), y: Y(886), font: BOLD, size: 21, color: "swatch:Navy", name: "Mini title", parent: g});
  AIA.line(X(ruleX1), Y(910), X(ruleX2), Y(910), {stroke: "swatch:Navy", sw: 1.25, name: "Mini rule", parent: g});
  var gh = AIA.group("Weekday headers", g);
  for (var i = 0; i < 7; i++) {
    AIA.text(dayNames[i], {x: X(cols[i]), y: Y(950), font: BOLD, size: 12.5, color: (i >= 5 ? "swatch:Red" : "swatch:Text Black"), align: "center", name: "Hdr " + dayNames[i], parent: gh});
  }
  var gd = AIA.group("Days", g);
  var rb = [1004, 1049, 1094, 1139, 1183];
  var d = 1, r = 0, c = startCol;
  while (d <= nDays) {
    var we = c >= 5;
    AIA.text(String(d), {x: X(cols[c]), y: Y(rb[r]), font: (we ? BOLD : REG), size: 13.5, color: (we ? "swatch:Red" : "swatch:Text Black"), align: "center", name: prefix + " " + d, parent: gd});
    d++; c++;
    if (c == 7) { c = 0; r++; }
  }
  return g;
}
mini("December 2026", "Грудень 2026", 91, 72, 540, [106, 172, 238, 305, 371, 439, 506], 1, 31, "Dec");
mini("February 2027", "Лютий 2027", 654, 636, 1117, [671, 739, 807, 876, 945, 1013, 1081], 0, 28, "Feb");
AIA.line(X(589), Y(862), X(589), Y(1206), {stroke: "swatch:Grey Rule", sw: 1, name: "Mini divider", parent: L});
return "ok";
