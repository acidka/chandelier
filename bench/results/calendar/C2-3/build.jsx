// Calendar 2027 builder. args[0] = optional single artboard index (else all 12)
var doc = AIA.doc();
var MONTHS = ["Січень","Лютий","Березень","Квітень","Травень","Червень","Липень","Серпень","Вересень","Жовтень","Листопад","Грудень"];
var WD = ["Пн","Вт","Ср","Чт","Пт","Сб","Нд"];

AIA.swatch("Navy", "cmyk(100,90,30,25)");
AIA.swatch("Red", "cmyk(0,100,100,10)");
AIA.swatch("Ink", "cmyk(0,0,0,95)");
AIA.swatch("Week Grey", "cmyk(0,0,0,50)");
AIA.swatch("Rule Grey", "cmyk(0,0,0,25)");
AIA.swatch("Photo Grey", "cmyk(15,10,5,0)");

var F = { b: "MontserratRoman-Bold", sb: "MontserratRoman-SemiBold", m: "MontserratRoman-Medium", r: "MontserratRoman-Regular" };
AIA.pstyle("Month Title", { font: F.b, size: 60, color: "swatch:Navy", align: "left" });
AIA.pstyle("Year", { font: F.sb, size: 52, color: "swatch:Navy", align: "right" });
AIA.pstyle("Week Label", { font: F.b, size: 12, color: "swatch:Navy", align: "center" });
AIA.pstyle("Weekday", { font: F.sb, size: 16, color: "swatch:Ink", align: "center" });
AIA.pstyle("Weekday Weekend", { font: F.sb, size: 16, color: "swatch:Red", align: "center" });
AIA.pstyle("Week Number", { font: F.r, size: 22, color: "swatch:Week Grey", align: "center" });
AIA.pstyle("Date", { font: F.m, size: 32, color: "swatch:Ink", align: "center" });
AIA.pstyle("Date Weekend", { font: F.m, size: 32, color: "swatch:Red", align: "center" });
AIA.pstyle("Mini Title", { font: F.b, size: 20, color: "swatch:Navy", align: "left" });
AIA.pstyle("Mini Weekday", { font: F.sb, size: 12, color: "swatch:Ink", align: "center" });
AIA.pstyle("Mini Weekday Weekend", { font: F.sb, size: 12, color: "swatch:Red", align: "center" });
AIA.pstyle("Mini Date", { font: F.r, size: 14.5, color: "swatch:Ink", align: "center" });
AIA.pstyle("Mini Date Weekend", { font: F.sb, size: 14.5, color: "swatch:Red", align: "center" });

function daysIn(y, m) { return new Date(y, m + 1, 0).getDate(); }
function firstDow(y, m) { return (new Date(y, m, 1).getDay() + 6) % 7; } // 0 = Monday
function isoWeek(y, m, d) {
    var dt = new Date(y, m, d, 12);
    var dow = (dt.getDay() + 6) % 7;
    var thu = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - dow + 3, 12);
    var jan1 = new Date(thu.getFullYear(), 0, 1, 12);
    return Math.floor(Math.round((thu - jan1) / 86400000) / 7) + 1;
}

var photoLayer = AIA.fresh("Photo Area");
var calLayer = AIA.fresh("Calendar");

function mini(parent, name, y, m, x0, ox, oy, ruleL, ruleR) {
    var g = AIA.group(name, parent);
    AIA.text(MONTHS[m] + " " + y, { x: ox + x0 - 1.5, y: oy + 144.4, style: "Mini Title", parent: g, name: "Mini Title" });
    AIA.line(ox + ruleL, oy + 148.6, ox + ruleR, oy + 148.6, { stroke: "swatch:Navy", sw: 1, name: "Mini Rule", parent: g });
    var i, step = 11.1;
    for (i = 0; i < 7; i++) {
        AIA.text(WD[i], { x: ox + x0 + i * step, y: oy + 155.2, style: (i >= 5 ? "Mini Weekday Weekend" : "Mini Weekday"), parent: g });
    }
    var off = firstDow(y, m), n = daysIn(y, m), d, cell, row, col;
    for (d = 1; d <= n; d++) {
        cell = off + d - 1; row = Math.floor(cell / 7); col = cell % 7;
        AIA.text(String(d), { x: ox + x0 + col * step, y: oy + 164.1 + row * 7.45, style: (col >= 5 ? "Mini Date Weekend" : "Mini Date"), parent: g });
    }
    return g;
}

var only = (arguments.length > 0 && arguments[0] !== null && arguments[0] !== undefined) ? arguments[0] : -1;
var mi, abs = doc.artboards, made = 0;
for (mi = 0; mi < 12; mi++) {
    if (only >= 0 && mi !== only) continue;
    var ox = (mi % 4) * 323, oy = Math.floor(mi / 4) * 236;
    var Y = 2027;
    // photo area (bleeds off left, top, bottom)
    AIA.rect(ox - 3, oy - 3, 116, 216, { fill: "swatch:Photo Grey", stroke: "none", name: "Photo " + MONTHS[mi], parent: photoLayer });

    var page = AIA.group(abs[mi].name, calLayer);
    var head = AIA.group("Header", page);
    AIA.text(MONTHS[mi], { x: ox + 121.5, y: oy + 28.5, style: "Month Title", parent: head, name: "Month" });
    AIA.text(String(Y), { x: ox + 289, y: oy + 28.5, style: "Year", parent: head, name: "Year" });
    AIA.line(ox + 122.5, oy + 34.5, ox + 289.5, oy + 34.5, { stroke: "swatch:Navy", sw: 1.75, name: "Title Rule", parent: head });

    var grid = AIA.group("Grid", page);
    var c0 = 157.2, cs = 20.3, wx = 132.7, i;
    AIA.text("Тиждень", { x: ox + wx, y: oy + 45, style: "Week Label", parent: grid, name: "Week Label" });
    for (i = 0; i < 7; i++) {
        AIA.text(WD[i], { x: ox + c0 + i * cs, y: oy + 45, style: (i >= 5 ? "Weekday Weekend" : "Weekday"), parent: grid });
    }
    var off = firstDow(Y, mi), n = daysIn(Y, mi);
    var rows = Math.ceil((off + n) / 7);
    var pitch = rows > 5 ? 12.9 : 16.1, b0 = 61.2, capH = 8;
    var r, d, cell, col;
    for (r = 0; r < rows; r++) {
        var by = oy + b0 + r * pitch;
        var firstDay = r * 7 - off + 1; if (firstDay < 1) firstDay = 1;
        AIA.text(String(isoWeek(Y, mi, firstDay)), { x: ox + wx, y: by, style: "Week Number", parent: grid, name: "Week" });
        if (r < rows - 1) {
            var ry = by + (pitch - capH) / 2;
            AIA.line(ox + 122.5, ry, ox + 289.5, ry, { stroke: "swatch:Rule Grey", sw: 0.75, name: "Row Rule", parent: grid });
        }
    }
    for (d = 1; d <= n; d++) {
        cell = off + d - 1; r = Math.floor(cell / 7); col = cell % 7;
        AIA.text(String(d), { x: ox + c0 + col * cs, y: oy + b0 + r * pitch, style: (col >= 5 ? "Date Weekend" : "Date"), parent: grid });
    }

    var pm = mi - 1, py = Y, nm = mi + 1, ny = Y;
    if (pm < 0) { pm = 11; py = Y - 1; }
    if (nm > 11) { nm = 0; ny = Y + 1; }
    mini(page, "Mini Previous", py, pm, 120.9, ox, oy, 116, 193);
    mini(page, "Mini Next", ny, nm, 214.3, ox, oy, 209, 288);
    AIA.line(ox + 200.8, oy + 140.8, ox + 200.8, oy + 200, { stroke: "swatch:Rule Grey", sw: 0.75, name: "Mini Separator", parent: page });
    made++;
}
return { made: made };
