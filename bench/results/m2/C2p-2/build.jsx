// Builder for M2-C2p-2: January 2027 calendar (Ukrainian). Coordinates measured in reference-image px.
// Page px box in reference: x 36..1176, y 8..1282; scale S = 0.5 pt/px.
var S = 0.5;
function X(px) { return (px - 36) * S; }
function Y(py) { return (py - 8) * S; }

var lay = AIA.fresh("Calendar");

AIA.swatch("Navy", "cmyk(100,85,30,25)");
AIA.swatch("Red", "cmyk(5,100,90,5)");
AIA.swatch("Black", "cmyk(0,0,0,100)");
AIA.swatch("WeekGrey", "cmyk(0,0,0,55)");
AIA.swatch("RuleGrey", "cmyk(0,0,0,35)");

var B = "Arial Bold", R = "Arial";
AIA.pstyle("Month Title", {font: B, size: 64, color: "swatch:Navy", align: "left"});
AIA.pstyle("Year", {font: B, size: 58, color: "swatch:Navy", align: "right"});
AIA.pstyle("Week Label", {font: B, size: 12.5, color: "swatch:Navy", align: "center"});
AIA.pstyle("Day Name", {font: B, size: 17, color: "swatch:Black", align: "center"});
AIA.pstyle("Day Name Weekend", {font: B, size: 17, color: "swatch:Red", align: "center"});
AIA.pstyle("Week Number", {font: R, size: 23, color: "swatch:WeekGrey", align: "center"});
AIA.pstyle("Date", {font: R, size: 32, color: "swatch:Black", align: "center"});
AIA.pstyle("Date Weekend", {font: R, size: 32, color: "swatch:Red", align: "center"});
AIA.pstyle("Mini Title", {font: B, size: 21, color: "swatch:Navy", align: "left"});
AIA.pstyle("Mini Day Name", {font: B, size: 12, color: "swatch:Black", align: "center"});
AIA.pstyle("Mini Day Name Weekend", {font: B, size: 12, color: "swatch:Red", align: "center"});
AIA.pstyle("Mini Date", {font: R, size: 15, color: "swatch:Black", align: "center"});
AIA.pstyle("Mini Date Weekend", {font: B, size: 15, color: "swatch:Red", align: "center"});

var DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

// ---- Header
var gH = AIA.group("Header", lay);
AIA.text("Січень", {x: X(140), y: Y(182), style: "Month Title", name: "Month", parent: gH});
AIA.text("2027", {x: X(1117), y: Y(182), style: "Year", name: "Year", parent: gH});
AIA.line(X(120), Y(216), X(1118), Y(216), {stroke: "swatch:Navy", sw: 1.5, name: "Title Rule", parent: gH});

// ---- Main grid
var gM = AIA.group("January Grid", lay);
var cols = [318, 444, 570, 695, 820, 945, 1070];
var gD = AIA.group("Day Names", gM);
AIA.text("Тиждень", {x: X(176), y: Y(279), style: "Week Label", name: "Week Label", parent: gD});
var i, r, c;
for (i = 0; i < 7; i++) {
  AIA.text(DAYS[i], {x: X(cols[i]), y: Y(281), style: (i >= 5 ? "Day Name Weekend" : "Day Name"), name: DAYS[i], parent: gD});
}
var gR = AIA.group("Rules", gM);
var rules = [404, 501, 598, 696];
for (i = 0; i < rules.length; i++) {
  AIA.line(X(112), Y(rules[i]), X(1128), Y(rules[i]), {stroke: "swatch:RuleGrey", sw: 1, name: "Row Rule " + (i + 1), parent: gR});
}
var weeks = [53, 1, 2, 3, 4];
var base = [379, 476, 572, 669, 766];
var gW = AIA.group("Week Numbers", gM);
var gT = AIA.group("Dates", gM);
var startCol = 4; // Jan 1 2027 = Friday
for (r = 0; r < 5; r++) {
  AIA.text(String(weeks[r]), {x: X(176), y: Y(base[r] - 6), style: "Week Number", name: "Week " + weeks[r], parent: gW});
}
for (var d = 1; d <= 31; d++) {
  var pos = startCol + d - 1;
  r = Math.floor(pos / 7); c = pos % 7;
  AIA.text(String(d), {x: X(cols[c]), y: Y(base[r]), style: (c >= 5 ? "Date Weekend" : "Date"), name: "Jan " + d, parent: gT});
}

// ---- Mini months
function mini(name, title, tx, rx1, rx2, mcols, start, ndays) {
  var g = AIA.group(name, lay);
  AIA.text(title, {x: X(tx), y: Y(888), style: "Mini Title", name: "Title", parent: g});
  AIA.line(X(rx1), Y(910), X(rx2), Y(910), {stroke: "swatch:Navy", sw: 1, name: "Title Rule", parent: g});
  var k;
  for (k = 0; k < 7; k++) {
    AIA.text(DAYS[k], {x: X(mcols[k]), y: Y(951), style: (k >= 5 ? "Mini Day Name Weekend" : "Mini Day Name"), name: DAYS[k], parent: g});
  }
  var gd = AIA.group("Dates", g);
  for (k = 1; k <= ndays; k++) {
    var p = start + k - 1, rr = Math.floor(p / 7), cc = p % 7;
    AIA.text(String(k), {x: X(mcols[cc]), y: Y(1005 + rr * 45), style: (cc >= 5 ? "Mini Date Weekend" : "Mini Date"), name: String(k), parent: gd});
  }
  return g;
}
mini("December 2026", "Грудень 2026", 90, 72, 540, [106, 172, 238, 305, 372, 439, 506], 1, 31);
mini("February 2027", "Лютий 2027", 654, 636, 1116, [670, 739, 808, 876, 945, 1013, 1081], 0, 28);
AIA.line(X(588), Y(862), X(588), Y(1206), {stroke: "swatch:RuleGrey", sw: 1, name: "Mini Divider", parent: lay});

return {items: lay.pageItems.length};
