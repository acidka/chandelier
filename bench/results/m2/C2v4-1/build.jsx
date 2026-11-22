// Builder for the January 2027 calendar (reference px -> pt: (px-37)/2, (py-8)/2)
function X(px) { return (px - 37) / 2; }
function Y(py) { return (py - 8) / 2; }

AIA.swatch("Navy", "cmyk(100,85,35,30)");
AIA.swatch("Red", "cmyk(10,100,95,0)");
AIA.swatch("Black", "cmyk(0,0,0,100)");
AIA.swatch("Week Grey", "cmyk(0,0,0,55)");
AIA.swatch("Rule Grey", "cmyk(0,0,0,35)");

var B = "Arial Bold", R = "Arial";
AIA.pstyle("Title", {font: B, size: 63, color: "swatch:Navy", align: "left"});
AIA.pstyle("Year", {font: B, size: 56, color: "swatch:Navy", align: "right"});
AIA.pstyle("Week Head", {font: B, size: 12, color: "swatch:Navy", align: "center"});
AIA.pstyle("Day Head", {font: B, size: 17, color: "swatch:Black", align: "center"});
AIA.pstyle("Day Head Weekend", {font: B, size: 17, color: "swatch:Red", align: "center"});
AIA.pstyle("Week Number", {font: R, size: 22, color: "swatch:Week Grey", align: "center"});
AIA.pstyle("Day", {font: R, size: 30, color: "swatch:Black", align: "center"});
AIA.pstyle("Day Weekend", {font: R, size: 30, color: "swatch:Red", align: "center"});
AIA.pstyle("Mini Title", {font: B, size: 20, color: "swatch:Navy", align: "left"});
AIA.pstyle("Mini Head", {font: B, size: 12, color: "swatch:Black", align: "center"});
AIA.pstyle("Mini Head Weekend", {font: B, size: 12, color: "swatch:Red", align: "center"});
AIA.pstyle("Mini Day", {font: R, size: 13.5, color: "swatch:Black", align: "center"});
AIA.pstyle("Mini Day Weekend", {font: B, size: 13.5, color: "swatch:Red", align: "center"});

var lay = AIA.fresh("Calendar");
var names = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

// Header
var gH = AIA.group("Header", lay);
AIA.text("Січень", {x: X(140), y: Y(182), style: "Title", name: "Month Title", parent: gH});
AIA.text("2027", {x: X(1116), y: Y(182), style: "Year", align: "right", name: "Year", parent: gH});
AIA.line(X(121), Y(216), X(1117), Y(216), {stroke: "swatch:Navy", sw: 1.5, name: "Title Rule", parent: gH});

// Main month
var gM = AIA.group("January 2027", lay);
var cols = [318, 444, 570, 695, 820, 946, 1071];
var gHd = AIA.group("Day Names", gM);
AIA.text("Тиждень", {x: X(176), y: Y(279), style: "Week Head", align: "center", name: "Week Label", parent: gHd});
var i, r, c;
for (i = 0; i < 7; i++) {
  AIA.text(names[i], {x: X(cols[i]), y: Y(281), style: (i >= 5 ? "Day Head Weekend" : "Day Head"), align: "center", name: names[i], parent: gHd});
}
var weeks = ["53", "1", "2", "3", "4"];
var base = [378, 475, 572, 669, 766];
var gW = AIA.group("Week Numbers", gM);
var gD = AIA.group("Dates", gM);
var d = 1;
for (r = 0; r < 5; r++) {
  AIA.text(weeks[r], {x: X(175), y: Y(base[r] - 6), style: "Week Number", align: "center", name: "Week " + weeks[r], parent: gW});
  for (c = (r === 0 ? 4 : 0); c < 7 && d <= 31; c++) {
    AIA.text(String(d), {x: X(cols[c]), y: Y(base[r]), style: (c >= 5 ? "Day Weekend" : "Day"), align: "center", name: "Jan " + d, parent: gD});
    d++;
  }
}
var gR = AIA.group("Row Rules", gM);
var rules = [404, 501, 599, 696];
for (i = 0; i < 4; i++) {
  AIA.line(X(112), Y(rules[i]), X(1128), Y(rules[i]), {stroke: "swatch:Rule Grey", sw: 0.75, name: "Row Rule " + (i + 1), parent: gR});
}

// Mini months
function mini(title, left, rRight, colsM, startCol, days, label) {
  var g = AIA.group(label, lay);
  AIA.text(title, {x: X(left), y: Y(887), style: "Mini Title", name: "Mini Title", parent: g});
  AIA.line(X(rRight[0]), Y(910), X(rRight[1]), Y(910), {stroke: "swatch:Navy", sw: 1, name: "Mini Rule", parent: g});
  var gh = AIA.group("Day Names", g);
  var k;
  for (k = 0; k < 7; k++) {
    AIA.text(names[k], {x: X(colsM[k]), y: Y(950), style: (k >= 5 ? "Mini Head Weekend" : "Mini Head"), align: "center", name: names[k], parent: gh});
  }
  var gd = AIA.group("Dates", g);
  var dd = 1, row = 0, col = startCol;
  var rowsB = [1004, 1049, 1094, 1138, 1183];
  while (dd <= days) {
    AIA.text(String(dd), {x: X(colsM[col]), y: Y(rowsB[row]), style: (col >= 5 ? "Mini Day Weekend" : "Mini Day"), align: "center", name: label + " " + dd, parent: gd});
    dd++; col++;
    if (col > 6) { col = 0; row++; }
  }
}
mini("Грудень 2026", 91, [72, 540], [106, 172, 239, 305, 372, 439, 506], 1, 31, "December 2026");
mini("Лютий 2027", 654, [636, 1117], [671, 739, 808, 876, 945, 1013, 1081], 0, 28, "February 2027");
AIA.line(X(588), Y(862), X(588), Y(1206), {stroke: "swatch:Rule Grey", sw: 0.75, name: "Mini Divider", parent: lay});
return "ok";
