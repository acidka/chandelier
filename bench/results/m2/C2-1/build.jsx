// Builder for M2-C2-1: Ukrainian wall calendar January 2027
// Reference pixel coords -> points: X(px)=(px-36)/2, Y(py)=(py-8)/2
function X(p) { return (p - 36) / 2; }
function Y(p) { return (p - 8) / 2; }
function S(p) { return p / 2; }

AIA.swatch("Navy", "cmyk(100,85,30,30)");
AIA.swatch("Red", "cmyk(10,100,95,2)");
AIA.swatch("Black", "cmyk(0,0,0,100)");
AIA.swatch("Grey Text", "cmyk(0,0,0,60)");
AIA.swatch("Grey Rule", "cmyk(0,0,0,35)");

var BOLD = "Arial Bold", REG = "Arial";
var dayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

// ---------- Main month ----------
AIA.layer("Main month");
var gTitle = AIA.group("Title");
AIA.text("Січень", {x: X(141), y: Y(182), font: BOLD, size: 63, color: "swatch:Navy", name: "Month title", parent: gTitle});
AIA.text("2027", {x: X(1117), y: Y(182), font: BOLD, size: 55.5, color: "swatch:Navy", align: "right", name: "Year", parent: gTitle});
AIA.line(X(121), Y(216), X(1117), Y(216), {stroke: "swatch:Navy", sw: 1.5, name: "Title rule", parent: gTitle});

var colX = [318, 444, 570, 695, 821, 946, 1071];
var gHead = AIA.group("Weekday header");
AIA.text("Тиждень", {x: X(176), y: Y(280), font: BOLD, size: 12.5, color: "swatch:Navy", align: "center", name: "Week label", parent: gHead});
for (var i = 0; i < 7; i++) {
  AIA.text(dayNames[i], {x: X(colX[i]), y: Y(281), font: BOLD, size: 16.5, color: i >= 5 ? "swatch:Red" : "swatch:Black", align: "center", name: "Head " + dayNames[i], parent: gHead});
}

var rowBase = [378, 476, 572, 669, 767];
var weeks = [53, 1, 2, 3, 4];
var gWeeks = AIA.group("Week numbers");
var gDays = AIA.group("Days");
var gRules = AIA.group("Row rules");
// Jan 1 2027 = Friday (col 4)
var d = 1;
for (var r = 0; r < 5; r++) {
  AIA.text(String(weeks[r]), {x: X(175), y: Y(rowBase[r] - 5), font: REG, size: 22.5, color: "swatch:Grey Text", align: "center", name: "Week " + weeks[r], parent: gWeeks});
  for (var c = (r == 0 ? 4 : 0); c < 7 && d <= 31; c++) {
    AIA.text(String(d), {x: X(colX[c]), y: Y(rowBase[r]), font: REG, size: 31.5, color: c >= 5 ? "swatch:Red" : "swatch:Black", align: "center", name: "Jan " + d, parent: gDays});
    d++;
  }
}
var ruleY = [404, 501, 599, 696];
for (var k = 0; k < 4; k++) {
  AIA.line(X(112), Y(ruleY[k]), X(1128), Y(ruleY[k]), {stroke: "swatch:Grey Rule", sw: 1, name: "Rule " + (k + 1), parent: gRules});
}

// ---------- Mini months ----------
AIA.layer("Mini months");
function mini(name, title, titleX, ruleX1, ruleX2, cols, startCol, days) {
  var g = AIA.group(name);
  AIA.text(title, {x: X(titleX), y: Y(887), font: BOLD, size: 21.5, color: "swatch:Navy", name: name + " title", parent: g});
  AIA.line(X(ruleX1), Y(910), X(ruleX2), Y(910), {stroke: "swatch:Navy", sw: 1, name: name + " rule", parent: g});
  var gh = AIA.group(name + " header", g);
  for (var i = 0; i < 7; i++) {
    AIA.text(dayNames[i], {x: X(cols[i]), y: Y(951), font: BOLD, size: 12.5, color: i >= 5 ? "swatch:Red" : "swatch:Black", align: "center", name: dayNames[i], parent: gh});
  }
  var gd = AIA.group(name + " days", g);
  var base = [1005, 1050, 1095, 1140, 1184];
  var c = startCol, r = 0;
  for (var dd = 1; dd <= days; dd++) {
    var we = c >= 5;
    AIA.text(String(dd), {x: X(cols[c]), y: Y(base[r]), font: we ? BOLD : REG, size: 15.5, color: we ? "swatch:Red" : "swatch:Black", align: "center", name: String(dd), parent: gd});
    c++;
    if (c == 7) { c = 0; r++; }
  }
  return g;
}
// Dec 1 2026 = Tuesday (col 1); Feb 1 2027 = Monday (col 0), 28 days
mini("December 2026", "Грудень 2026", 90, 72, 540, [106, 172, 238, 305, 371, 439, 506], 1, 31);
mini("February 2027", "Лютий 2027", 653, 636, 1117, [671, 739, 808, 876, 945, 1013, 1082], 0, 28);
AIA.line(X(588), Y(862), X(588), Y(1206), {stroke: "swatch:Grey Rule", sw: 1, name: "Divider"});

// remove default empty layers
var doc = AIA.doc();
for (var L = doc.layers.length - 1; L >= 0; L--) {
  if (doc.layers[L].pageItems.length == 0 && doc.layers.length > 1) doc.layers[L].remove();
}
return "ok";
