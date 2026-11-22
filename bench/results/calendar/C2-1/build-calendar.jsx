// Calendar 2027 builder (re-runnable). Session units: mm, origin artboard 0 top-left.
var doc = AIA.doc();
var MONTHS = ["Січень","Лютий","Березень","Квітень","Травень","Червень","Липень","Серпень","Вересень","Жовтень","Листопад","Грудень"];
var WD = ["Пн","Вт","Ср","Чт","Пт","Сб","Нд"];

// ---- swatches
AIA.swatch("Navy", "cmyk(100,85,25,25)");
AIA.swatch("Red", "cmyk(5,100,100,5)");
AIA.swatch("Text", "cmyk(0,0,0,90)");
AIA.swatch("Grey Week", "cmyk(0,0,0,50)");
AIA.swatch("Grey Rule", "cmyk(0,0,0,30)");
AIA.swatch("Photo Placeholder", "cmyk(15,8,5,0)");

// ---- paragraph styles
AIA.pstyle("Month Title", {font:"MontserratRoman-SemiBold", size:56, tracking:-40, color:"swatch:Navy", align:"left"});
AIA.pstyle("Year", {font:"MontserratRoman-SemiBold", size:54, tracking:-60, color:"swatch:Navy", align:"right"});
AIA.pstyle("Week Label", {font:"MontserratRoman-Bold", size:11, color:"swatch:Navy", align:"center"});
AIA.pstyle("Weekday", {font:"MontserratRoman-SemiBold", size:18, color:"swatch:Text", align:"center"});
AIA.pstyle("Weekday Weekend", {font:"MontserratRoman-SemiBold", size:18, color:"swatch:Red", align:"center"});
AIA.pstyle("Week Number", {font:"MontserratRoman-Regular", size:24, color:"swatch:Grey Week", align:"center"});
AIA.pstyle("Date", {font:"MontserratRoman-Medium", size:32, color:"swatch:Text", align:"center"});
AIA.pstyle("Date Weekend", {font:"MontserratRoman-Medium", size:32, color:"swatch:Red", align:"center"});
AIA.pstyle("Mini Title", {font:"MontserratRoman-Bold", size:19, tracking:-10, color:"swatch:Navy", align:"left"});
AIA.pstyle("Mini Weekday", {font:"MontserratRoman-SemiBold", size:12, color:"swatch:Text", align:"center"});
AIA.pstyle("Mini Weekday Weekend", {font:"MontserratRoman-SemiBold", size:12, color:"swatch:Red", align:"center"});
AIA.pstyle("Mini Date", {font:"MontserratRoman-Medium", size:16, color:"swatch:Text", align:"center"});
AIA.pstyle("Mini Date Weekend", {font:"MontserratRoman-Medium", size:16, color:"swatch:Red", align:"center"});

// ---- date helpers
function daysIn(y, m) { return 32 - new Date(y, m, 32).getDate(); }
function dowMon(y, m, d) { return (new Date(y, m, d).getDay() + 6) % 7; }
function isoWeek(y, m, d) {
    var t = Date.UTC(y, m, d);
    var dow = (new Date(t).getUTCDay() + 6) % 7;
    var thu = t + (3 - dow) * 86400000;
    var ty = new Date(thu).getUTCFullYear();
    return 1 + Math.floor((thu - Date.UTC(ty, 0, 1)) / (7 * 86400000));
}

// ---- layers
try { doc.layers.getByName("Photo area (placeholder)").locked = false; } catch (e0) {}
var photoLayer = AIA.fresh("Photo area (placeholder)");
var calLayer = AIA.fresh("Calendar");

var abs = doc.artboards;
var r0 = abs[0].artboardRect;
function mm(pt) { return pt / 2.834645669; }

function mini(parent, x0, dx, dy, y, m) {
    while (m < 0) { m += 12; y -= 1; }
    while (m > 11) { m -= 12; y += 1; }
    var g = AIA.group("Mini " + MONTHS[m] + " " + y, parent);
    AIA.text(MONTHS[m] + " " + y, {x: dx + x0 + 2.4, y: dy + 144.8, style: "Mini Title", name: "mini title", parent: g});
    AIA.line(dx + x0, dy + 148.6, dx + x0 + 77.5, dy + 148.6, {stroke: "swatch:Navy", sw: 1, name: "mini rule", parent: g});
    var cx0 = dx + x0 + 4.9, pitch = 11.15, i;
    for (i = 0; i < 7; i++) {
        AIA.text(WD[i], {x: cx0 + i * pitch, y: dy + 155.4, style: (i >= 5 ? "Mini Weekday Weekend" : "Mini Weekday"), name: "mini weekday " + WD[i], parent: g});
    }
    var off = dowMon(y, m, 1), n = daysIn(y, m), d, cell, col, row;
    for (d = 1; d <= n; d++) {
        cell = off + d - 1; col = cell % 7; row = Math.floor(cell / 7);
        AIA.text(String(d), {x: cx0 + col * pitch, y: dy + 164.3 + row * 7.45, style: (col >= 5 ? "Mini Date Weekend" : "Mini Date"), name: "mini date " + d, parent: g});
    }
    return g;
}

var Y = 2027, k, out = [];
for (k = 0; k < 12; k++) {
    var r = abs[k].artboardRect;
    var dx = mm(r[0] - r0[0]), dy = mm(r0[1] - r[1]);
    var page = AIA.group(abs[k].name, calLayer);

    // photo placeholder (non-printing layer)
    AIA.rect(dx - 3, dy - 3, 115, 216, {fill: "swatch:Photo Placeholder", stroke: "none", name: "photo area " + abs[k].name, parent: photoLayer});

    // header
    var hg = AIA.group("Header", page);
    AIA.text(MONTHS[k], {x: dx + 127.5, y: dy + 28.9, style: "Month Title", name: "month title", parent: hg});
    AIA.text(String(Y), {x: dx + 287.5, y: dy + 28.9, style: "Year", name: "year", parent: hg});
    AIA.line(dx + 125.5, dy + 34.7, dx + 288, dy + 34.7, {stroke: "swatch:Navy", sw: 1.75, name: "title rule", parent: hg});

    // grid
    var gg = AIA.group("Grid", page);
    var wx = dx + 132.7, cx = dx + 156.3, cp = 20.55, i;
    AIA.text("Тиждень", {x: wx, y: dy + 44.4, style: "Week Label", name: "week label", parent: gg});
    for (i = 0; i < 7; i++) {
        AIA.text(WD[i], {x: cx + i * cp, y: dy + 45.2, style: (i >= 5 ? "Weekday Weekend" : "Weekday"), name: "weekday " + WD[i], parent: gg});
    }
    var off = dowMon(Y, k, 1), n = daysIn(Y, k);
    var rows = Math.ceil((off + n) / 7);
    var rp = rows > 5 ? 13.4 : 16.07;
    var row, d, col, cell;
    for (row = 0; row < rows; row++) {
        // first date in this row (or first of month) gives the ISO week
        var first = row * 7 - off + 1; if (first < 1) first = 1;
        AIA.text(String(isoWeek(Y, k, first)), {x: wx, y: dy + 60.8 + row * rp, style: "Week Number", name: "week " + (row + 1), parent: gg});
        if (row < rows - 1) {
            AIA.line(dx + 122.5, dy + 61.4 + row * rp + 4, dx + 288.5, dy + 61.4 + row * rp + 4, {stroke: "swatch:Grey Rule", sw: 0.75, name: "row rule " + (row + 1), parent: gg});
        }
    }
    for (d = 1; d <= n; d++) {
        cell = off + d - 1; col = cell % 7; row = Math.floor(cell / 7);
        AIA.text(String(d), {x: cx + col * cp, y: dy + 61.4 + row * rp, style: (col >= 5 ? "Date Weekend" : "Date"), name: "date " + d, parent: gg});
    }

    // minis
    var mg = AIA.group("Mini calendars", page);
    mini(mg, 116, dx, dy, Y, k - 1);
    mini(mg, 209.2, dx, dy, Y, k + 1);
    AIA.line(dx + 201.75, dy + 140.6, dx + 201.75, dy + 196, {stroke: "swatch:Grey Rule", sw: 0.75, name: "mini divider", parent: mg});
    out.push(abs[k].name + ":" + rows);
}
photoLayer.move(doc, ElementPlacement.PLACEATEND);
photoLayer.printable = false;
photoLayer.locked = true;
var li;
for (li = doc.layers.length - 1; li >= 0; li--) {
    if (doc.layers[li].pageItems.length === 0 && doc.layers[li].layers.length === 0) doc.layers[li].remove();
}
return out;
