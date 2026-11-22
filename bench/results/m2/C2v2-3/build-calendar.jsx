// Builder: January 2027 calendar page (body of run_script; coordinates in reference-image px, converted to pt)
function X(px) { return (px - 36) / 2; }
function Y(py) { return (py - 8) / 2; }
AIA.swatch("Navy", "cmyk(100,85,30,30)");
AIA.swatch("Red", "cmyk(8,100,95,1)");
AIA.swatch("Black", "cmyk(0,0,0,100)");
AIA.swatch("Grey Text", "cmyk(0,0,0,55)");
AIA.swatch("Grey Rule", "cmyk(0,0,0,35)");
var doc = AIA.doc();
var lay = AIA.layer("Calendar");
// remove default empty layer(s)
for (var i = doc.layers.length - 1; i >= 0; i--) {
  if (doc.layers[i].name !== "Calendar" && doc.layers[i].pageItems.length === 0) { doc.layers[i].remove(); }
}
var B = "Arial Bold", R = "Arial";
var cols = [318, 444, 570, 695, 820, 946, 1071];
var dn = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

// ---- Header
var gH = AIA.group("Header", lay);
AIA.text("Січень", {x: X(140), y: Y(183), font: B, size: 63, color: "swatch:Navy", name: "Month title", parent: gH});
AIA.text("2027", {x: X(1117), y: Y(183), font: B, size: 58, color: "swatch:Navy", align: "right", name: "Year", parent: gH});
AIA.line(X(121), Y(216), X(1117), Y(216), {stroke: "swatch:Navy", sw: 1.5, name: "Title rule", parent: gH});

// ---- Main grid
var gM = AIA.group("January grid", lay);
var gWH = AIA.group("Weekday header", gM);
AIA.text("Тиждень", {x: X(176), y: Y(279), font: B, size: 12, color: "swatch:Navy", align: "center", name: "Week label", parent: gWH});
for (var c = 0; c < 7; c++) {
  AIA.text(dn[c], {x: X(cols[c]), y: Y(280), font: B, size: 16, color: (c >= 5 ? "swatch:Red" : "swatch:Black"), align: "center", name: "Day " + dn[c], parent: gWH});
}
var rowsB = [378, 476, 572, 669, 767];
var weeks = ["53", "1", "2", "3", "4"];
var gWk = AIA.group("Week numbers", gM);
var gD = AIA.group("Dates", gM);
var gR = AIA.group("Row rules", gM);
var d = 1;
for (var r = 0; r < 5; r++) {
  AIA.text(weeks[r], {x: X(175), y: Y(rowsB[r] - 4), font: R, size: 21, color: "swatch:Grey Text", align: "center", name: "Week " + weeks[r], parent: gWk});
  for (c = (r === 0 ? 4 : 0); c < 7 && d <= 31; c++) {
    AIA.text(String(d), {x: X(cols[c]), y: Y(rowsB[r]), font: R, size: 29, color: (c >= 5 ? "swatch:Red" : "swatch:Black"), align: "center", name: "Jan " + d, parent: gD});
    d++;
  }
}
var ry = [405, 502, 599, 696];
for (r = 0; r < 4; r++) AIA.line(X(112), Y(ry[r]), X(1128), Y(ry[r]), {stroke: "swatch:Grey Rule", sw: 1, name: "Row rule " + (r + 1), parent: gR});

// ---- Mini months
function mini(name, title, tx, rx1, rx2, mcols, startCol, days) {
  var g = AIA.group(name, lay);
  AIA.text(title, {x: X(tx), y: Y(888), font: B, size: 21, color: "swatch:Navy", name: name + " title", parent: g});
  AIA.line(X(rx1), Y(910), X(rx2), Y(910), {stroke: "swatch:Navy", sw: 1, name: name + " rule", parent: g});
  var gh = AIA.group("Weekday header", g);
  for (var k = 0; k < 7; k++) AIA.text(dn[k], {x: X(mcols[k]), y: Y(950), font: B, size: 12, color: (k >= 5 ? "swatch:Red" : "swatch:Black"), align: "center", name: "Day " + dn[k], parent: gh});
  var gd = AIA.group("Dates", g);
  var col = startCol, row = 0;
  for (var n = 1; n <= days; n++) {
    var we = col >= 5;
    AIA.text(String(n), {x: X(mcols[col]), y: Y(1004 + 45 * row), font: (we ? B : R), size: 14.5, color: (we ? "swatch:Red" : "swatch:Black"), align: "center", name: name + " " + n, parent: gd});
    col++; if (col > 6) { col = 0; row++; }
  }
  return g;
}
mini("December 2026", "Грудень 2026", 90, 72, 540, [106, 172, 239, 305, 372, 439, 506], 1, 31);
mini("February 2027", "Лютий 2027", 654, 636, 1117, [671, 739, 807, 876, 944, 1013, 1081], 0, 28);
AIA.line(X(588), Y(862), X(588), Y(1206), {stroke: "swatch:Grey Rule", sw: 1, name: "Mini divider", parent: lay});
return "ok";
