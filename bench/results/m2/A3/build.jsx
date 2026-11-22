#target illustrator
// Builds M2-A3.ai: January 2027 Ukrainian wall-calendar page (with Dec 2026 / Feb 2027 minis),
// recreated from bench/scenarios/design-from-image.jpg. Saves .ai, exports PNG preview, closes the doc.
// Run: ./run.sh build.jsx
var KEEP = (typeof arguments !== "undefined" && arguments.length && String(arguments[0]) === "keep");
var DIR = "bench/results/m2/A3/";

function cmyk(a) { var c = new CMYKColor(); c.cyan = a[0]; c.magenta = a[1]; c.yellow = a[2]; c.black = a[3]; return c; }
function addGlobalSwatch(doc, name, arr) {
    var err;
    for (var k = 0; k < 3; k++) {
        var s = doc.spots.add(); s.colorType = ColorModel.PROCESS; s.color = cmyk(arr);
        try { s.name = name; return s; } catch (e) { err = e; try { s.remove(); } catch (e2) {} }
    }
    throw new Error("Cannot name swatch " + name + ": " + err.message);
}
function spotColor(spot, tint) { var c = new SpotColor(); c.spot = spot; c.tint = (tint === undefined) ? 100 : tint; return c; }
function cleanDefaults(doc) {
    var i;
    for (i = doc.swatchGroups.length - 1; i >= 1; i--) try { doc.swatchGroups[i].remove(); } catch (e) {}
    for (i = doc.spots.length - 1; i >= 0; i--) try {
        if (i < doc.spots.length && doc.spots[i].colorType !== ColorModel.REGISTRATION) doc.spots[i].remove(); } catch (e) {}
    for (i = doc.swatches.length - 1; i >= 0; i--) try {
        if (i >= doc.swatches.length) continue;
        var t = doc.swatches[i].color.typename;
        if (t === "NoColor") continue;
        if (t === "SpotColor" && doc.swatches[i].color.spot.colorType === ColorModel.REGISTRATION) continue;
        doc.swatches[i].remove(); } catch (e) {}
    for (i = doc.symbols.length - 1; i >= 0; i--) try { doc.symbols[i].remove(); } catch (e) {}
    for (i = doc.graphicStyles.length - 1; i >= 1; i--) try { doc.graphicStyles[i].remove(); } catch (e) {}
    for (i = doc.brushes.length - 1; i >= 0; i--) try { doc.brushes[i].remove(); } catch (e) {}
}

(function () {
    var target = new File(DIR + "M2-A3.ai");
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    for (var i = app.documents.length - 1; i >= 0; i--)
        try { if (app.documents[i].fullName.fsName === target.fsName) { app.documents[i].close(SaveOptions.DONOTSAVECHANGES); return "RETRY"; } } catch (e) {}

    // Reference: white page spans x 36..1174, y 8..1281 px (1139 x 1274, ratio 0.894). 1 px = 0.5 pt.
    var S = 0.5, PX0 = 36, PY0 = 8;
    var W = 1139 * S, H = 1274 * S;
    var p = new DocumentPreset();
    p.colorMode = DocumentColorSpace.CMYK; p.units = RulerUnits.Millimeters;
    p.rasterResolution = DocumentRasterResolution.HighResolution;
    p.width = W; p.height = H;
    var doc = app.documents.addDocument("Print", p);
    cleanDefaults(doc);
    var ab = doc.artboards[0]; ab.name = "January 2027";
    var R = ab.artboardRect, L0 = R[0], T0 = R[1];
    function X(px) { return L0 + (px - PX0) * S; }
    function Y(py) { return T0 - (py - PY0) * S; }

    // 1. Swatches (one per colour role)
    var SW = {
        navy: addGlobalSwatch(doc, "Navy", [100, 85, 30, 35]),
        red: addGlobalSwatch(doc, "Weekend Red", [5, 100, 95, 5]),
        black: addGlobalSwatch(doc, "Text Black", [0, 0, 0, 100]),
        greyText: addGlobalSwatch(doc, "Week Grey", [0, 0, 0, 55]),
        greyRule: addGlobalSwatch(doc, "Rule Grey", [0, 0, 0, 40])
    };

    // 2. Paragraph styles (sizes kept in this table; never read back from styles)
    var BOLD = app.textFonts.getByName("Arial-BoldMT"), REG = app.textFonts.getByName("ArialMT");
    var ST = {
        "Month Title":     { f: BOLD, s: 123.5 * S, c: "navy",   j: Justification.LEFT },
        "Year":            { f: BOLD, s: 109 * S, c: "navy",     j: Justification.RIGHT },
        "Week Label":      { f: BOLD, s: 26 * S,  c: "navy",     j: Justification.CENTER, t: 40 },
        "Weekday":         { f: BOLD, s: 37 * S,  c: "black",    j: Justification.CENTER },
        "Weekday Weekend": { f: BOLD, s: 37 * S,  c: "red",      j: Justification.CENTER },
        "Week Number":     { f: REG,  s: 45 * S,  c: "greyText", j: Justification.CENTER },
        "Day":             { f: REG,  s: 63 * S,  c: "black",    j: Justification.CENTER },
        "Day Weekend":     { f: REG,  s: 63 * S,  c: "red",      j: Justification.CENTER },
        "Mini Title":      { f: BOLD, s: 40.5 * S, c: "navy",    j: Justification.LEFT, t: 30 },
        "Mini Weekday":    { f: BOLD, s: 28 * S, c: "black",   j: Justification.CENTER },
        "Mini Weekday Weekend": { f: BOLD, s: 28 * S, c: "red", j: Justification.CENTER },
        "Mini Day":        { f: REG,  s: 29.5 * S, c: "black",   j: Justification.CENTER },
        "Mini Day Weekend":{ f: BOLD, s: 29.5 * S, c: "red",     j: Justification.CENTER }
    };
    for (var nm in ST) {
        var d = ST[nm], ps = doc.paragraphStyles.add(nm);
        ps.characterAttributes.textFont = d.f; ps.characterAttributes.size = d.s;
        ps.characterAttributes.fillColor = spotColor(SW[d.c]);
        ps.characterAttributes.autoLeading = true;
        if (d.t) ps.characterAttributes.tracking = d.t;
        ps.paragraphAttributes.justification = d.j;
    }

    function txt(parent, s, xpx, ypx, style, name) {
        var t = parent.textFrames.pointText([X(xpx), Y(ypx)]);
        t.contents = String(s);
        doc.paragraphStyles.getByName(style).applyTo(t.textRange, true);
        t.name = name || String(s);
        return t;
    }
    function line(parent, x1, y1, x2, y2, wpx, sw, name) {
        var q = parent.pathItems.add();
        q.setEntirePath([[X(x1), Y(y1)], [X(x2), Y(y2)]]);
        q.filled = false; q.stroked = true; q.strokeWidth = wpx * S; q.strokeColor = spotColor(sw);
        q.strokeCap = StrokeCap.BUTTENDCAP; q.name = name; return q;
    }

    // Calendar data
    var WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
    var MONTHS = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
    function firstCol(y, m) { return (new Date(y, m, 1).getDay() + 6) % 7; }   // Monday = 0
    function daysIn(y, m) { return new Date(y, m + 1, 0).getDate(); }
    function isoWeek(y, m, d) {
        var t = new Date(Date.UTC(y, m, d)); var dn = (t.getUTCDay() + 6) % 7;
        t.setUTCDate(t.getUTCDate() - dn + 3);
        var fy = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
        return 1 + Math.round(((t - fy) / 86400000 - 3 + ((fy.getUTCDay() + 6) % 7)) / 7);
    }

    // 4. Layers & content
    var lyMain = doc.layers[0]; lyMain.name = "Main month";
    var lyMini = doc.layers.add(); lyMini.name = "Mini months";
    lyMini.move(lyMain, ElementPlacement.PLACEAFTER);

    var YEAR = 2027, MON = 0;
    // Header
    var gH = lyMain.groupItems.add(); gH.name = "Header";
    txt(gH, MONTHS[MON], 143 - 6, 181, "Month Title", "Month name");
    txt(gH, String(YEAR), 1114 + 6, 180, "Year", "Year");
    line(gH, 120, 217, 1118, 217, 4, SW.navy, "Header rule");

    // Weekday header row
    var COLS = [318, 443.5, 569, 694.5, 820, 945.5, 1071], WKX = 175;
    var gW = lyMain.groupItems.add(); gW.name = "Weekday header";
    txt(gW, "Тиждень", WKX, 278, "Week Label", "Week label");
    for (var c = 0; c < 7; c++) txt(gW, WD[c], COLS[c], 280, c >= 5 ? "Weekday Weekend" : "Weekday", WD[c]);

    // Day grid
    var ROW0 = 377, ROWH = 97.75;
    var fc = firstCol(YEAR, MON), nd = daysIn(YEAR, MON), rows = Math.ceil((fc + nd) / 7);
    var gWk = lyMain.groupItems.add(); gWk.name = "Week numbers";
    var gD = lyMain.groupItems.add(); gD.name = "Days";
    for (var r = 0; r < rows; r++) {
        var dFirst = Math.max(1, r * 7 - fc + 1);
        txt(gWk, isoWeek(YEAR, MON, dFirst), WKX, ROW0 + r * ROWH - 6, "Week Number", "Week " + isoWeek(YEAR, MON, dFirst));
    }
    for (var dd = 1; dd <= nd; dd++) {
        var cell = fc + dd - 1, cc = cell % 7, rr = Math.floor(cell / 7);
        txt(gD, dd, COLS[cc], ROW0 + rr * ROWH, cc >= 5 ? "Day Weekend" : "Day", "Day " + dd);
    }
    var gR = lyMain.groupItems.add(); gR.name = "Row rules";
    for (r = 1; r < rows; r++) line(gR, 112, 404 + (r - 1) * 97.4, 1127, 404 + (r - 1) * 97.4, 2, SW.greyRule, "Row rule " + r);

    // Mini months
    function mini(y, m, x0, x1, cols, name) {
        var g = lyMini.groupItems.add(); g.name = name;
        txt(g, MONTHS[m] + " " + y, x0 + 17, 886, "Mini Title", "Mini title");
        line(g, x0, 909.5, x1, 909.5, 3, SW.navy, "Mini rule");
        for (var c = 0; c < 7; c++) txt(g, WD[c], cols[c], 950, c >= 5 ? "Mini Weekday Weekend" : "Mini Weekday", WD[c]);
        var f = firstCol(y, m), n = daysIn(y, m);
        for (var d = 1; d <= n; d++) {
            var k = f + d - 1, ci = k % 7, ri = Math.floor(k / 7);
            txt(g, d, cols[ci], 1004 + ri * 44.75, ci >= 5 ? "Mini Day Weekend" : "Mini Day", "Day " + d);
        }
        return g;
    }
    var colsDec = [], colsFeb = [];
    for (c = 0; c < 7; c++) { colsDec.push(105.5 + c * 66.83); colsFeb.push(670.5 + c * 68.67); }
    var pm = MON === 0 ? 11 : MON - 1, py = MON === 0 ? YEAR - 1 : YEAR;
    var nm2 = MON === 11 ? 0 : MON + 1, ny = MON === 11 ? YEAR + 1 : YEAR;
    mini(py, pm, 72, 539, colsDec, "Previous month");
    mini(ny, nm2, 636, 1117, colsFeb, "Next month");
    var gDiv = lyMini.groupItems.add(); gDiv.name = "Divider";
    line(gDiv, 587.5, 862, 587.5, 1207, 2, SW.greyRule, "Mini divider");

    // Save
    var o = new IllustratorSaveOptions(); o.pdfCompatible = true; o.embedICCProfile = true; o.compressed = true;
    doc.saveAs(target, o);

    // PNG preview (2x => 1139 px wide, same as the reference page)
    var e = new ExportOptionsPNG24(); e.artBoardClipping = true; e.antiAliasing = true; e.transparency = false;
    e.horizontalScale = 200; e.verticalScale = 200;
    doc.exportFile(new File(DIR + "M2-A3.png"), ExportType.PNG24, e);

    var info = "ok " + target.fsName + " | AB " + ab.artboardRect.join(",") + " | frames " + doc.textFrames.length + " paths " + doc.pathItems.length;
    if (!KEEP) doc.close(SaveOptions.DONOTSAVECHANGES);
    return info;
})();
