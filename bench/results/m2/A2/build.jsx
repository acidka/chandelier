#target illustrator
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
function isoWeek(d) { // d = Date (local)
    var t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var dow = (t.getDay() + 6) % 7; t.setDate(t.getDate() - dow + 3);
    var y1 = new Date(t.getFullYear(), 0, 4);
    var d1 = (y1.getDay() + 6) % 7; y1.setDate(y1.getDate() - d1 + 3);
    return 1 + Math.round((t - y1) / (7 * 864e5));
}
function daysIn(y, m) { return new Date(y, m + 1, 0).getDate(); }
function firstDow(y, m) { return (new Date(y, m, 1).getDay() + 6) % 7; } // Mon=0

var MONTHS = ["\u0421\u0456\u0447\u0435\u043d\u044c","\u041b\u044e\u0442\u0438\u0439","\u0411\u0435\u0440\u0435\u0437\u0435\u043d\u044c","\u041a\u0432\u0456\u0442\u0435\u043d\u044c","\u0422\u0440\u0430\u0432\u0435\u043d\u044c","\u0427\u0435\u0440\u0432\u0435\u043d\u044c","\u041b\u0438\u043f\u0435\u043d\u044c","\u0421\u0435\u0440\u043f\u0435\u043d\u044c","\u0412\u0435\u0440\u0435\u0441\u0435\u043d\u044c","\u0416\u043e\u0432\u0442\u0435\u043d\u044c","\u041b\u0438\u0441\u0442\u043e\u043f\u0430\u0434","\u0413\u0440\u0443\u0434\u0435\u043d\u044c"];
var DAYS = ["\u041f\u043d","\u0412\u0442","\u0421\u0440","\u0427\u0442","\u041f\u0442","\u0421\u0431","\u041d\u0434"];

(function () {
    var DIR = "bench/results/m2/A2/";
    var target = new File(DIR + "M2-A2.ai");
    var YEAR = 2027, MONTH = 0;
    app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
    for (var i = app.documents.length - 1; i >= 0; i--)
        try { if (app.documents[i].fullName.fsName === target.fsName) { app.documents[i].close(SaveOptions.DONOTSAVECHANGES); return "RETRY"; } } catch (e) {}

    // reference page in image px: x 36..1176, y 8..1283 (1140 x 1275, ratio 0.894)
    var PX_L = 36, PX_T = 8, PX_W = 1140, PX_H = 1275;
    var W = 210 * PT_PER_MM, S = W / PX_W, H = PX_H * S;
    var p = new DocumentPreset();
    p.colorMode = DocumentColorSpace.CMYK; p.units = RulerUnits.Millimeters;
    p.rasterResolution = DocumentRasterResolution.HighResolution;
    p.width = W; p.height = H; p.title = "M2-A2";
    var doc = app.documents.addDocument("Print", p);
    cleanDefaults(doc);
    var ab = doc.artboards[0]; ab.name = "\u0421\u0456\u0447\u0435\u043d\u044c 2027";
    var R = ab.artboardRect, AL = R[0], AT = R[1];
    function X(px) { return AL + (px - PX_L) * S; }
    function Y(py) { return AT - (py - PX_T) * S; }
    function F(px) { return px * S; }

    var NAVY = addGlobalSwatch(doc, "Navy", [100, 85, 30, 35]);
    var RED = addGlobalSwatch(doc, "Weekend Red", [5, 100, 90, 5]);
    var GREY = addGlobalSwatch(doc, "Week Grey", [0, 0, 0, 50]);
    var RULE = addGlobalSwatch(doc, "Rule Grey", [0, 0, 0, 35]);
    var BLACK = addGlobalSwatch(doc, "Text Black", [0, 0, 0, 100]);

    // sizes in image px (converted with S)
    var ST = {
        "Title Month":  ["Arial-BoldMT", 123, NAVY, Justification.LEFT],
        "Title Year":   ["Arial-BoldMT", 108, NAVY, Justification.RIGHT],
        "Week Label":   ["Arial-BoldMT", 24, NAVY, Justification.CENTER],
        "Day Head":     ["Arial-BoldMT", 32, BLACK, Justification.CENTER],
        "Day Head WE":  ["Arial-BoldMT", 32, RED, Justification.CENTER],
        "Week Num":     ["ArialMT", 42, GREY, Justification.CENTER],
        "Day":          ["ArialMT", 62, BLACK, Justification.CENTER],
        "Day WE":       ["ArialMT", 62, RED, Justification.CENTER],
        "Mini Title":   ["Arial-BoldMT", 40, NAVY, Justification.LEFT],
        "Mini Head":    ["Arial-BoldMT", 24, BLACK, Justification.CENTER],
        "Mini Head WE": ["Arial-BoldMT", 24, RED, Justification.CENTER],
        "Mini Day":     ["ArialMT", 28, BLACK, Justification.CENTER],
        "Mini Day WE":  ["Arial-BoldMT", 28, RED, Justification.CENTER]
    };
    for (var k in ST) {
        var ps = doc.paragraphStyles.add(k), ca = ps.characterAttributes;
        ca.textFont = app.textFonts.getByName(ST[k][0]); ca.size = F(ST[k][1]);
        ca.fillColor = spotColor(ST[k][2]); ca.autoLeading = true;
        ps.paragraphAttributes.justification = ST[k][3];
    }
    function txt(parent, s, xpx, ypx, style, name) {
        var t = parent.textFrames.pointText([X(xpx), Y(ypx)]); t.contents = String(s);
        doc.paragraphStyles.getByName(style).applyTo(t.textRange, true);
        t.name = name || String(s); return t;
    }
    function line(parent, x1, y1, x2, y2, wpx, sw, name) {
        var q = parent.pathItems.add(); q.setEntirePath([[X(x1), Y(y1)], [X(x2), Y(y2)]]);
        q.filled = false; q.stroked = true; q.strokeWidth = F(wpx); q.strokeColor = spotColor(sw);
        q.strokeCap = StrokeCap.BUTTENDCAP; q.name = name; return q;
    }

    var lay = doc.layers[0]; lay.name = "Calendar";

    // Header
    var gH = lay.groupItems.add(); gH.name = "Header";
    txt(gH, MONTHS[MONTH], 142, 183, "Title Month", "Month title");
    txt(gH, YEAR, 1117, 183, "Title Year", "Year");
    line(gH, 121, 216, 1117, 216, 3.5, NAVY, "Header rule");

    // Main grid
    var gM = lay.groupItems.add(); gM.name = "Main grid";
    var COLS = [318, 444, 570, 695, 820, 946, 1071], WKX = 176;
    var gHd = gM.groupItems.add(); gHd.name = "Weekday headers";
    txt(gHd, "\u0422\u0438\u0436\u0434\u0435\u043d\u044c", WKX, 278, "Week Label", "Week label");
    for (var c = 0; c < 7; c++) txt(gHd, DAYS[c], COLS[c], 281, c >= 5 ? "Day Head WE" : "Day Head");
    var off = firstDow(YEAR, MONTH), nd = daysIn(YEAR, MONTH), rows = Math.ceil((off + nd) / 7);
    var ROW0 = 378, RSTEP = 97.5;
    var gW = gM.groupItems.add(); gW.name = "Week numbers";
    var gD = gM.groupItems.add(); gD.name = "Days";
    var gR = gM.groupItems.add(); gR.name = "Row rules";
    for (var r = 0; r < rows; r++) {
        var monday = new Date(YEAR, MONTH, 1 - off + 7 * r);
        txt(gW, isoWeek(monday), WKX, ROW0 + r * RSTEP - 4, "Week Num", "Week " + isoWeek(monday));
        if (r > 0) line(gR, 112, ROW0 + r * RSTEP - 72, 1128, ROW0 + r * RSTEP - 72, 2, RULE, "Row rule " + r);
    }
    for (var d = 1; d <= nd; d++) {
        var idx = off + d - 1, cc = idx % 7, rr = Math.floor(idx / 7);
        txt(gD, d, COLS[cc], ROW0 + rr * RSTEP, cc >= 5 ? "Day WE" : "Day", "Day " + d);
    }

    // Mini calendars
    function mini(y, m, left, cols, ruleL, ruleR, gname) {
        var g = lay.groupItems.add(); g.name = gname;
        txt(g, MONTHS[m] + " " + y, left, 887, "Mini Title", "Mini title");
        line(g, ruleL, 910, ruleR, 910, 2.5, NAVY, "Mini rule");
        var gh = g.groupItems.add(); gh.name = "Weekday headers";
        for (var c = 0; c < 7; c++) txt(gh, DAYS[c], cols[c], 950, c >= 5 ? "Mini Head WE" : "Mini Head");
        var gd = g.groupItems.add(); gd.name = "Days";
        var o = firstDow(y, m), n = daysIn(y, m);
        for (var d = 1; d <= n; d++) {
            var i = o + d - 1, cc = i % 7, rr = Math.floor(i / 7);
            txt(gd, d, cols[cc], 1005 + rr * 45, cc >= 5 ? "Mini Day WE" : "Mini Day", "Day " + d);
        }
        return g;
    }
    var pm = MONTH === 0 ? 11 : MONTH - 1, py = MONTH === 0 ? YEAR - 1 : YEAR;
    var nm = MONTH === 11 ? 0 : MONTH + 1, ny = MONTH === 11 ? YEAR + 1 : YEAR;
    mini(py, pm, 90, [106, 172, 239, 305, 372, 439, 506], 72, 540, "Mini previous month");
    mini(ny, nm, 654, [671, 739, 808, 876, 945, 1013, 1082], 636, 1117, "Mini next month");
    var gV = lay.groupItems.add(); gV.name = "Divider";
    line(gV, 588, 862, 588, 1206, 2, RULE, "Vertical divider");

    var o2 = new IllustratorSaveOptions(); o2.pdfCompatible = true; o2.embedICCProfile = true; o2.compressed = true;
    doc.saveAs(target, o2);

    var png = new File(DIR + "M2-A2.png");
    var eo = new ExportOptionsPNG24(); eo.artBoardClipping = true; eo.antiAliasing = true; eo.transparency = false;
    eo.horizontalScale = eo.verticalScale = 100 * PX_W / W; // same pixel width as reference page
    doc.exportFile(png, ExportType.PNG24, eo);
    return "ok " + target.fsName + " W=" + W.toFixed(2) + " H=" + H.toFixed(2) + " ratio=" + (W / H).toFixed(4) + " rows=" + rows;
})();
