#target illustrator
var OUT_DIR = "bench/results/m2/A/";
var PT_PER_MM = 72 / 25.4;
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
    var target = new File(OUT_DIR + "M2-A.ai");
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    for (var i = app.documents.length - 1; i >= 0; i--)
        try { if (app.documents[i].fullName.fsName === target.fsName) { app.documents[i].close(SaveOptions.DONOTSAVECHANGES); return "RETRY"; } } catch (e) {}

    // Reference page: 1140 x 1274 px (image x 36..1176, y 8..1282)
    var PX_W = 1140, PX_H = 1274, OX = 36, OY = 8;
    var W = 210 * PT_PER_MM, S = W / PX_W, H = PX_H * S;
    var p = new DocumentPreset();
    p.colorMode = DocumentColorSpace.CMYK; p.units = RulerUnits.Millimeters;
    p.rasterResolution = DocumentRasterResolution.HighResolution;
    p.width = W; p.height = H; p.title = "M2-A";
    var doc = app.documents.addDocument("Print", p);
    cleanDefaults(doc);
    var ab = doc.artboards[0]; ab.name = "Calendar_2027_01";
    var R = ab.artboardRect, L0 = R[0], T0 = R[1];
    function X(px) { return L0 + (px - OX) * S; }
    function Y(px) { return T0 - (py0(px)) * S; }
    function py0(px) { return px - OY; }
    function F(px) { return px * S; } // font size from px

    // 1. swatches
    var NAVY = addGlobalSwatch(doc, "Navy", [100, 85, 30, 30]);
    var RED = addGlobalSwatch(doc, "Weekend Red", [5, 100, 95, 5]);
    var GREY_T = addGlobalSwatch(doc, "Week Grey", [0, 0, 0, 55]);
    var GREY_R = addGlobalSwatch(doc, "Rule Grey", [0, 0, 0, 35]);
    var BLACK = addGlobalSwatch(doc, "Text Black", [0, 0, 0, 100]);

    // 2. paragraph styles (sizes kept here, never read back)
    var STY = {
        "Month Title":   { font: "Arial-BoldMT", size: F(122.5), col: NAVY,   just: Justification.LEFT },
        "Year Title":    { font: "Arial-BoldMT", size: F(109), col: NAVY,   just: Justification.RIGHT },
        "Week Label":    { font: "Arial-BoldMT", size: F(27.5),  col: NAVY,   just: Justification.CENTER },
        "Weekday":       { font: "Arial-BoldMT", size: F(37),  col: BLACK,  just: Justification.CENTER },
        "Weekend Day":   { font: "Arial-BoldMT", size: F(37),  col: RED,    just: Justification.CENTER },
        "Week Number":   { font: "ArialMT",      size: F(45),  col: GREY_T, just: Justification.CENTER },
        "Date":          { font: "ArialMT",      size: F(63),  col: BLACK,  just: Justification.CENTER },
        "Date Weekend":  { font: "ArialMT",      size: F(63),  col: RED,    just: Justification.CENTER },
        "Mini Title":    { font: "Arial-BoldMT", size: F(42),  col: NAVY,   just: Justification.LEFT },
        "Mini Weekday":  { font: "Arial-BoldMT", size: F(27),  col: BLACK,  just: Justification.CENTER },
        "Mini Weekend":  { font: "Arial-BoldMT", size: F(27),  col: RED,    just: Justification.CENTER },
        "Mini Date":     { font: "ArialMT",      size: F(31.5),  col: BLACK,  just: Justification.CENTER },
        "Mini Date Weekend": { font: "Arial-BoldMT", size: F(31.5), col: RED, just: Justification.CENTER }
    };
    for (var k in STY) {
        var d = STY[k], ps = doc.paragraphStyles.add(k);
        ps.characterAttributes.textFont = app.textFonts.getByName(d.font);
        ps.characterAttributes.size = d.size;
        ps.characterAttributes.fillColor = spotColor(d.col);
        ps.paragraphAttributes.justification = d.just;
    }

    function txt(parent, s, xpx, ypx, style, name) {
        var t = parent.textFrames.pointText([X(xpx), Y(ypx)]); t.contents = String(s);
        doc.paragraphStyles.getByName(style).applyTo(t.textRange, true);
        if (name) t.name = name; return t;
    }
    function line(parent, x1, y1, x2, y2, wpx, colour, name) {
        var pa = parent.pathItems.add();
        pa.setEntirePath([[X(x1), Y(y1)], [X(x2), Y(y2)]]); pa.filled = false; pa.stroked = true;
        pa.strokeWidth = F(wpx); pa.strokeColor = spotColor(colour); pa.strokeCap = StrokeCap.BUTTENDCAP;
        if (name) pa.name = name; return pa;
    }

    // calendar maths (weeks start Monday)
    function dow(y, m, d) { return (new Date(y, m, d).getDay() + 6) % 7; } // 0=Mon
    function daysIn(y, m) { return new Date(y, m + 1, 0).getDate(); }
    function isoWeek(y, m, d) {
        var dt = new Date(Date.UTC(y, m, d)); var wd = (dt.getUTCDay() + 6) % 7;
        dt.setUTCDate(dt.getUTCDate() - wd + 3);
        var fy = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
        return 1 + Math.round(((dt - fy) / 86400000 - 3 + ((fy.getUTCDay() + 6) % 7)) / 7);
    }
    var MONTHS = ["\u0421\u0456\u0447\u0435\u043d\u044c","\u041b\u044e\u0442\u0438\u0439","\u0411\u0435\u0440\u0435\u0437\u0435\u043d\u044c","\u041a\u0432\u0456\u0442\u0435\u043d\u044c","\u0422\u0440\u0430\u0432\u0435\u043d\u044c","\u0427\u0435\u0440\u0432\u0435\u043d\u044c","\u041b\u0438\u043f\u0435\u043d\u044c","\u0421\u0435\u0440\u043f\u0435\u043d\u044c","\u0412\u0435\u0440\u0435\u0441\u0435\u043d\u044c","\u0416\u043e\u0432\u0442\u0435\u043d\u044c","\u041b\u0438\u0441\u0442\u043e\u043f\u0430\u0434","\u0413\u0440\u0443\u0434\u0435\u043d\u044c"];
    var MONTHS_NOM = MONTHS;
    var WD = ["\u041f\u043d","\u0412\u0442","\u0421\u0440","\u0427\u0442","\u041f\u0442","\u0421\u0431","\u041d\u0434"];

    var YEAR = 2027, MON = 0;
    var layer = doc.layers[0]; layer.name = "Calendar";

    // Header
    var gH = layer.groupItems.add(); gH.name = "Header";
    txt(gH, MONTHS[MON], 142, 181, "Month Title", "Month");
    txt(gH, YEAR, 1117, 181, "Year Title", "Year");
    line(gH, 121, 216, 1118, 216, 3.5, NAVY, "Header rule");

    // Main grid
    var gM = layer.groupItems.add(); gM.name = "Main grid";
    var COLS = [318, 444, 570, 695, 820, 945, 1070], WKX = 175;
    var gWH = gM.groupItems.add(); gWH.name = "Weekday header";
    txt(gWH, "\u0422\u0438\u0436\u0434\u0435\u043d\u044c", WKX, 279, "Week Label", "Week label");
    for (var c = 0; c < 7; c++) txt(gWH, WD[c], COLS[c], 280, c >= 5 ? "Weekend Day" : "Weekday", WD[c]);
    var gWN = gM.groupItems.add(); gWN.name = "Week numbers";
    var gD = gM.groupItems.add(); gD.name = "Dates";
    var gR = gM.groupItems.add(); gR.name = "Row rules";
    var first = dow(YEAR, MON, 1), nd = daysIn(YEAR, MON), rows = Math.ceil((first + nd) / 7);
    var ROW0 = 378, ROWH = 97.5;
    for (var r = 0; r < rows; r++) {
        var by = ROW0 + r * ROWH;
        var dayInRow = Math.max(1, r * 7 - first + 1);
        txt(gWN, isoWeek(YEAR, MON, dayInRow), WKX, by - 5, "Week Number", "Week " + isoWeek(YEAR, MON, dayInRow));
        if (r > 0) line(gR, 112, by - 72, 1128, by - 72, 2, GREY_R, "Rule " + r);
    }
    for (var dd = 1; dd <= nd; dd++) {
        var idx = first + dd - 1, col = idx % 7, row = Math.floor(idx / 7);
        txt(gD, dd, COLS[col], ROW0 + row * ROWH, col >= 5 ? "Date Weekend" : "Date", "Date " + dd);
    }

    // Mini calendars
    function mini(name, y, m, titleX, ruleX1, ruleX2, cols) {
        var g = layer.groupItems.add(); g.name = name;
        txt(g, MONTHS_NOM[m] + " " + y, titleX, 887, "Mini Title", "Title");
        line(g, ruleX1, 910, ruleX2, 910, 2.5, NAVY, "Title rule");
        var gh = g.groupItems.add(); gh.name = "Weekdays";
        for (var c = 0; c < 7; c++) txt(gh, WD[c], cols[c], 951, c >= 5 ? "Mini Weekend" : "Mini Weekday", WD[c]);
        var gd = g.groupItems.add(); gd.name = "Dates";
        var f = dow(y, m, 1), n = daysIn(y, m);
        for (var d = 1; d <= n; d++) {
            var i = f + d - 1, cc = i % 7, rr = Math.floor(i / 7);
            txt(gd, d, cols[cc], 1005 + rr * 44.8, cc >= 5 ? "Mini Date Weekend" : "Mini Date", "Date " + d);
        }
        return g;
    }
    var pm = MON === 0 ? 11 : MON - 1, py = MON === 0 ? YEAR - 1 : YEAR;
    var nm = MON === 11 ? 0 : MON + 1, ny = MON === 11 ? YEAR + 1 : YEAR;
    var gR2 = mini("Mini " + MONTHS[nm] + " " + ny, ny, nm, 654, 636, 1117, [671, 739, 808, 876, 945, 1013, 1082]);
    var gL = mini("Mini " + MONTHS[pm] + " " + py, py, pm, 90, 72, 540, [106, 172, 239, 305, 372, 439, 506]);
    var gDiv = layer.groupItems.add(); gDiv.name = "Divider";
    line(gDiv, 588, 862, 588, 1206, 2, GREY_R, "Vertical divider");

    var o = new IllustratorSaveOptions(); o.pdfCompatible = true; o.embedICCProfile = true; o.compressed = true;
    doc.saveAs(target, o);

    var png = new File(OUT_DIR + "M2-A.png");
    var eo = new ExportOptionsPNG24(); eo.artBoardClipping = true; eo.antiAliasing = true; eo.transparency = false;
    eo.horizontalScale = eo.verticalScale = PX_W / W * 100;
    doc.exportFile(png, ExportType.PNG24, eo);
    return "ok " + target.fsName + " S=" + S + " W=" + W + " H=" + H + " ratio=" + (W / H);
})();
