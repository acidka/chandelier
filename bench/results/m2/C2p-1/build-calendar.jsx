// Builder for M2-C2p-1: Ukrainian wall calendar page, January 2027 + Dec 2026 / Feb 2027.
// Coordinates measured in reference pixels (page box x 36..1176, y 8..1283), scale 0.5 pt/px.
var S = 0.5;
function X(px) { return (px - 36) * S; }
function Y(py) { return (py - 8) * S; }

AIA.swatch("Navy", "cmyk(100,85,30,30)");
AIA.swatch("Red", "cmyk(10,100,95,2)");
AIA.swatch("Black", "cmyk(0,0,0,100)");
AIA.swatch("WeekGrey", "cmyk(0,0,0,55)");
AIA.swatch("RuleGrey", "cmyk(0,0,0,35)");

AIA.pstyle("Month Title", { font: "Arial Bold", size: 62, color: "swatch:Navy", align: "left" });
AIA.pstyle("Year Title", { font: "Arial Bold", size: 55, color: "swatch:Navy", align: "right" });
AIA.pstyle("Week Label", { font: "Arial Bold", size: 14, color: "swatch:Navy", align: "center" });
AIA.pstyle("Day Head", { font: "Arial Bold", size: 18.5, color: "swatch:Black", align: "center" });
AIA.pstyle("Day Head Weekend", { font: "Arial Bold", size: 18.5, color: "swatch:Red", align: "center" });
AIA.pstyle("Week Number", { font: "Arial", size: 22, color: "swatch:WeekGrey", align: "center" });
AIA.pstyle("Day", { font: "Arial", size: 31, color: "swatch:Black", align: "center" });
AIA.pstyle("Day Weekend", { font: "Arial", size: 31, color: "swatch:Red", align: "center" });
AIA.pstyle("Mini Title", { font: "Arial Bold", size: 21, color: "swatch:Navy", align: "left" });
AIA.pstyle("Mini Head", { font: "Arial Bold", size: 13, color: "swatch:Black", align: "center" });
AIA.pstyle("Mini Head Weekend", { font: "Arial Bold", size: 13, color: "swatch:Red", align: "center" });
AIA.pstyle("Mini Day", { font: "Arial", size: 14.5, color: "swatch:Black", align: "center" });
AIA.pstyle("Mini Day Weekend", { font: "Arial Bold", size: 14.5, color: "swatch:Red", align: "center" });

var heads = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

var L = AIA.fresh("Calendar");

// ---- Header
var gH = AIA.group("Header", L);
AIA.text("Січень", { x: X(140), y: Y(183), style: "Month Title", name: "Month", parent: gH });
AIA.text("2027", { x: X(1117), y: Y(183), style: "Year Title", name: "Year", parent: gH });
AIA.line(X(121), Y(216), X(1118), Y(216), { stroke: "swatch:Navy", sw: 1.6, name: "Title Rule", parent: gH });

// ---- January grid
var gJ = AIA.group("January 2027", L);
var cols = [318, 444, 570, 695, 821, 946, 1071];
var gHead = AIA.group("Weekday Headings", gJ);
AIA.text("Тиждень", { x: X(176), y: Y(279), style: "Week Label", name: "Week Label", parent: gHead });
var i, r, c;
for (i = 0; i < 7; i++) {
  AIA.text(heads[i], { x: X(cols[i]), y: Y(280), style: (i >= 5 ? "Day Head Weekend" : "Day Head"), name: heads[i], parent: gHead });
}
var gWeeks = AIA.group("Week Numbers", gJ);
var gDays = AIA.group("Days", gJ);
var weeks = ["53", "1", "2", "3", "4"];
var rowBase = [377, 475, 572, 669, 766];
var first = 4; // Jan 1 2027 = Friday (index 4, Monday = 0)
for (r = 0; r < 5; r++) {
  AIA.text(weeks[r], { x: X(176), y: Y(rowBase[r] - 4), style: "Week Number", name: "Week " + weeks[r], parent: gWeeks });
}
for (var d = 1; d <= 31; d++) {
  var k = first + d - 1;
  r = Math.floor(k / 7); c = k % 7;
  AIA.text(String(d), { x: X(cols[c]), y: Y(rowBase[r]), style: (c >= 5 ? "Day Weekend" : "Day"), name: "Jan " + d, parent: gDays });
}
var gRules = AIA.group("Row Rules", gJ);
var ry = [404, 502, 599, 696];
for (r = 0; r < ry.length; r++) {
  AIA.line(X(113), Y(ry[r]), X(1128), Y(ry[r]), { stroke: "swatch:RuleGrey", sw: 1, name: "Row Rule " + (r + 1), parent: gRules });
}

// ---- Mini months
function mini(name, title, titleX, ruleX1, ruleX2, mcols, firstIdx, days) {
  var g = AIA.group(name, L);
  AIA.text(title, { x: X(titleX), y: Y(887), style: "Mini Title", name: "Title", parent: g });
  AIA.line(X(ruleX1), Y(910), X(ruleX2), Y(910), { stroke: "swatch:Navy", sw: 1.1, name: "Rule", parent: g });
  var gh = AIA.group("Weekday Headings", g);
  var j;
  for (j = 0; j < 7; j++) {
    AIA.text(heads[j], { x: X(mcols[j]), y: Y(950), style: (j >= 5 ? "Mini Head Weekend" : "Mini Head"), name: heads[j], parent: gh });
  }
  var gd = AIA.group("Days", g);
  for (j = 1; j <= days; j++) {
    var kk = firstIdx + j - 1;
    var rr = Math.floor(kk / 7), cc = kk % 7;
    AIA.text(String(j), { x: X(mcols[cc]), y: Y(1004 + rr * 44.9), style: (cc >= 5 ? "Mini Day Weekend" : "Mini Day"), name: "Day " + j, parent: gd });
  }
  return g;
}
// Dec 2026 starts Tuesday (index 1); Feb 2027 starts Monday (index 0), 28 days
mini("December 2026", "Грудень 2026", 90, 72, 540, [106, 172, 238, 305, 372, 439, 506], 1, 31);
mini("February 2027", "Лютий 2027", 654, 636, 1117, [671, 739, 808, 876, 945, 1013, 1082], 0, 28);
AIA.line(X(588), Y(862), X(588), Y(1206), { stroke: "swatch:RuleGrey", sw: 1, name: "Divider", parent: L });

return "ok";
