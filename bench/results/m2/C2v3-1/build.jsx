// Builder for M2-C2v3-1 calendar. Coordinates measured in reference-image px
// relative to the white page; S converts to pt (page 1140 px = 570 pt).
var S = 0.5;
function p(v) { return v * S; }

AIA.swatch("Navy", "cmyk(100,85,30,25)");
AIA.swatch("Red", "cmyk(10,100,95,5)");
AIA.swatch("Black", "cmyk(0,0,0,100)");
AIA.swatch("WeekGrey", "cmyk(0,0,0,55)");
AIA.swatch("RuleGrey", "cmyk(0,0,0,30)");

AIA.pstyle("Title Month", {font: "Arial-BoldMT", size: 63, color: "swatch:Navy", align: "left"});
AIA.pstyle("Title Year", {font: "Arial-BoldMT", size: 55, color: "swatch:Navy", align: "right"});
AIA.pstyle("Week Label", {font: "Arial-BoldMT", size: 13.5, color: "swatch:Navy", align: "center"});
AIA.pstyle("Day Head", {font: "Arial-BoldMT", size: 17.5, color: "swatch:Black", align: "center"});
AIA.pstyle("Day Head Weekend", {font: "Arial-BoldMT", size: 17.5, color: "swatch:Red", align: "center"});
AIA.pstyle("Week Number", {font: "ArialMT", size: 22, color: "swatch:WeekGrey", align: "center"});
AIA.pstyle("Date", {font: "ArialMT", size: 31, color: "swatch:Black", align: "center"});
AIA.pstyle("Date Weekend", {font: "ArialMT", size: 31, color: "swatch:Red", align: "center"});
AIA.pstyle("Mini Title", {font: "Arial-BoldMT", size: 21, color: "swatch:Navy", align: "left"});
AIA.pstyle("Mini Head", {font: "Arial-BoldMT", size: 13, color: "swatch:Black", align: "center"});
AIA.pstyle("Mini Head Weekend", {font: "Arial-BoldMT", size: 13, color: "swatch:Red", align: "center"});
AIA.pstyle("Mini Date", {font: "ArialMT", size: 14.5, color: "swatch:Black", align: "center"});
AIA.pstyle("Mini Date Weekend", {font: "Arial-BoldMT", size: 14.5, color: "swatch:Red", align: "center"});

var L = AIA.fresh("Calendar");
var DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

function t(str, x, y, style, name, parent) {
    return AIA.text(str, {x: p(x), y: p(y), style: style, name: name, parent: parent});
}

// ---- Header
var gH = AIA.group("Header", L);
t("Січень", 104, 174, "Title Month", "Month", gH);
t("2027", 1080, 174, "Title Year", "Year", gH);
AIA.line(p(84), p(208), p(1082), p(208), {stroke: "swatch:Navy", sw: 1.5, name: "Header Rule", parent: gH});

// ---- Main January grid
var gM = AIA.group("January 2027", L);
var colX = [282, 408, 534, 659, 784, 909, 1034];
var gHead = AIA.group("Weekday Header", gM);
t("Тиждень", 140, 271, "Week Label", "Week Label", gHead);
var i, r, c;
for (i = 0; i < 7; i++) {
    t(DAYS[i], colX[i], 273, (i >= 5 ? "Day Head Weekend" : "Day Head"), DAYS[i], gHead);
}
var weeks = [53, 1, 2, 3, 4];
var rowY = [370, 466, 562, 659, 757];
var gW = AIA.group("Week Numbers", gM);
var gD = AIA.group("Dates", gM);
for (r = 0; r < 5; r++) {
    t(String(weeks[r]), 140, rowY[r] - 4, "Week Number", "Week " + weeks[r], gW);
}
// Jan 1 2027 = Friday (column 4)
var day = 1;
for (r = 0; r < 5; r++) {
    for (c = (r === 0 ? 4 : 0); c < 7 && day <= 31; c++) {
        t(String(day), colX[c], rowY[r], (c >= 5 ? "Date Weekend" : "Date"), "Jan " + day, gD);
        day++;
    }
}
var gR = AIA.group("Row Rules", gM);
var ruleY = [396, 493, 590, 687];
for (i = 0; i < 4; i++) {
    AIA.line(p(76), p(ruleY[i]), p(1092), p(ruleY[i]), {stroke: "swatch:RuleGrey", sw: 1, name: "Row Rule " + (i + 1), parent: gR});
}

// ---- Mini months
function mini(name, title, titleX, ruleX1, ruleX2, cols, startCol, nDays) {
    var g = AIA.group(name, L);
    t(title, titleX, 880, "Mini Title", "Title", g);
    AIA.line(p(ruleX1), p(902), p(ruleX2), p(902), {stroke: "swatch:Navy", sw: 1, name: "Title Rule", parent: g});
    var gh = AIA.group("Weekday Header", g);
    var k;
    for (k = 0; k < 7; k++) {
        t(DAYS[k], cols[k], 942, (k >= 5 ? "Mini Head Weekend" : "Mini Head"), DAYS[k], gh);
    }
    var gd = AIA.group("Dates", g);
    var ys = [997, 1042, 1087, 1132, 1177];
    var d = 1, row = 0, col = startCol;
    while (d <= nDays) {
        t(String(d), cols[col], ys[row], (col >= 5 ? "Mini Date Weekend" : "Mini Date"), "Day " + d, gd);
        d++; col++;
        if (col > 6) { col = 0; row++; }
    }
    return g;
}
// Dec 2026 starts Tuesday (col 1); Feb 2027 starts Monday (col 0), 28 days
mini("December 2026", "Грудень 2026", 54, 36, 504,
    [70, 136, 202, 269, 335, 402, 469], 1, 31);
mini("February 2027", "Лютий 2027", 618, 600, 1080,
    [634, 702, 771, 840, 908, 977, 1045], 0, 28);
AIA.line(p(552), p(854), p(552), p(1198), {stroke: "swatch:RuleGrey", sw: 1, name: "Mini Divider", parent: L});

return "ok";
