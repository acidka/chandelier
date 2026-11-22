#!/usr/bin/env node
// Live suite for the phase 3 print tools (bleed, export, preflight). Works only in documents it creates or in
// temporary copies; never saves over an original.
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect, assert } from './live-lib.mjs';

const dir = mkdtempSync(join(tmpdir(), 'aia-live-print-'));
const { call, done } = await connect('live-print');
const docs = [];
// documents new {units} also sets the session units; this suite measures in pt, so switch back
const newDoc = async (args) => { const r = await call('documents', { action: 'new', ...args }, { check: (v) => { docs.push(v.name); } }); if (args.units) await call('configure', { units: 'pt' }); return r; };
const track = (v) => { if (v?.name) docs.push(v.name); };

try {
  // ── bleed: set on new documents, read back from XMP and from the saved file ──
  await newDoc({ width: 100, height: 50, units: 'mm', bleed: 3, title: 'aia-print-bleed' });
  await call('document_info', { checks: false }, { check: (v) => assert(Math.abs(v.bleed.left - 8.504) < 0.01 && v.bleed.source === 'xmp', 'bleed from xmp ' + JSON.stringify(v.bleed)) });
  await call('documents', { action: 'save', path: join(dir, 'bleed.ai') }, { check: (v) => { docs.pop(); track(v); } });
  await call('run_script', { code: 'AIA.metaSet("bleed", null); AIA.doc().save(); return 1;' });
  await call('document_info', { checks: false }, { check: (v) => assert(Math.abs(v.bleed.left - 8.504) < 0.01 && v.bleed.source === 'file', 'bleed read from the .ai file ' + JSON.stringify(v.bleed)) });

  // ── export: PDF/X-4 with bleed (phase 3 exit criterion) ──
  const near = (a, b) => Math.abs(a - b) < 0.02;
  const checkBoxes = (v, b, sizes) => {
    for (const f of v.files) {
      assert(f.pdfx === 'PDF/X-4', 'PDF/X-4: ' + f.pdfx);
      f.boxes.forEach((p, k) => {
        const [w, h] = sizes[f.artboards[k]];
        assert(near(p.media[2], w + 2 * b) && near(p.media[3], h + 2 * b), `page ${k} media ${p.media}`);
        assert(near(p.trim[0] - p.media[0], b) && near(p.trim[1] - p.media[1], b) && near(p.trim[2], w) && near(p.trim[3], h), `page ${k} trim ${p.trim}`);
        assert(p.bleed.join() === p.media.join(), `page ${k} bleed box = media`);
      });
    }
  };
  await newDoc({ width: 210, height: 297, units: 'mm', artboards: 3, columns: 3, bleed: 3, title: 'aia-print-pdf' });
  await call('artboards', { action: 'update', index: 2, w: 283.465, h: 141.732 });
  await call('create_shape', { x: -10, y: -10, w: 2000, h: 2000, fill: 'cmyk(0,30,90,0)', name: 'Bg' });
  const sizes = [[595.276, 841.89], [595.276, 841.89], [283.465, 141.732]];
  await call('export', { format: 'pdf', artboards: 'all', path: join(dir, 'x4-3mm.pdf') }, { check: (v) => { assert(v.files.length === 1 && v.files[0].pages === 3, '1 file, 3 pages'); checkBoxes(v, 8.504, sizes); } });
  await call('export', { format: 'pdf', artboards: [0, 2], bleed: 9, path: join(dir, 'x4-0125in.pdf') }, { check: (v) => { assert(v.files[0].pages === 2, 'subset merged into one file'); checkBoxes(v, 9, sizes); } });
  await call('export', { format: 'pdf', artboards: 'all', pages: 'per_artboard', bleed: 0, path: dir }, { check: (v) => { assert(v.files.length === 3 && v.files.every((f) => existsSync(f.path)), '3 files'); checkBoxes(v, 0, sizes); } });
  await call('document_info', { checks: false }, { check: (v) => assert(v.name === 'aia-print-pdf' && Math.abs(v.artboards[2].rect[2] - 283.465) < 0.01, 'document not rebound, artboards restored ' + v.name + ' ' + JSON.stringify(v.artboards[2])) });
  // ── raster / svg ──
  await call('export', { format: 'png', artboards: [2], dpi: 144, background: 'transparent', path: join(dir, 'ab2.png') }, { check: (v) => assert(v.files[0].bytes > 0, 'png') });
  await call('export', { format: 'jpg', artboards: [0, 1], scale: 0.5, path: join(dir, 'jpg') }, { check: (v) => assert(v.files.length === 2 && v.files.every((f) => f.path.endsWith('.jpg')), 'jpg per artboard') });
  await call('export', { format: 'svg', path: join(dir, 'a.svg') }, { check: (v) => assert(readFileSync(v.files[0].path, 'utf8').includes('<svg'), 'svg') });
  await call('export', { format: 'webp', path: join(dir, 'a.webp') }, { check: (v) => assert(v.files[0].bytes > 0, 'webp') });
  await call('export', { format: 'png', refs: 'name:Bg', dpi: 36, path: join(dir, 'items.png') }, { check: (v) => assert(v.files[0].px.join() === '1000,1000', 'items png at 36 dpi ' + v.files[0].px) });
  await call('documents', { action: 'list' }, { check: (v) => assert(v.some((d) => d.name === 'aia-print-pdf'), 'still open under its own name (no rebinding)') });
  await call('create_text', { text: 'Variable', x: 20, y: 40, font: 'AcuminConcept-Bold', size: 20 });
  await call('export', { format: 'pdf', path: join(dir, 'vf.pdf') }, { check: (v) => assert(v.warnings && /Variable fonts/.test(v.warnings[0]), 'variable font warning (B10)') });

  // ── preflight: planted problems ──
  await newDoc({ width: 300, height: 200, title: 'aia-print-preflight' });
  await call('swatches', { action: 'add', name: 'Brand', color: 'cmyk(80,0,20,0)' });
  await call('swatches', { action: 'add', name: 'Pantone X', kind: 'spot', color: 'cmyk(0,50,100,0)' });
  await call('create_shape', { items: [
    { x: 40, y: 10, w: 20, h: 20, fill: 'swatch:Brand', name: 'Global' },
    { x: 70, y: 10, w: 20, h: 20, fill: 'swatch:Pantone X', name: 'Spot' },
    { x: 100, y: 10, w: 20, h: 20, fill: 'cmyk(0,0,0,0)', name: 'WhiteOP' },
    { shape: 'line', x1: 10, y1: 60, x2: 100, y2: 60, stroke_width: 0.1, name: 'Hair' },
    { x: 500, y: 500, w: 10, h: 10, fill: 'gray(50)', name: 'Off' },
    { x: -5, y: 150, w: 50, h: 60, fill: 'gray(20)', name: 'Edge' },
  ] });
  await call('run_script', { code: 'AIA.find("WhiteOP").fillOverprint = true; var r = AIA.find("Global"); var c = new SpotColor(); for (var i = 0; i < AIA.doc().spots.length; i++) if (AIA.doc().spots[i].colorType === ColorModel.REGISTRATION) c.spot = AIA.doc().spots[i]; c.tint = 100; AIA.rect(130, 10, 10, 10, {name: "Reg"}).fillColor = c; AIA.find("Reg").filled = true; return 1;' });
  await call('create_text', { items: [
    { text: 'Tiny', x: 10, y: 90, size: 4, name: 'Tiny' },
    { text: 'This text does not fit into the box at all, really not', x: 150, y: 50, w: 40, h: 12, size: 10, name: 'Over' },
  ] });
  await call('run_script', { code: 'var t = AIA.doc().activeLayer.textFrames.pointText(AIA.P(200, 150)); t.contents = "x"; t.textRange.characterAttributes.size = 12; t.textRange.characterAttributes.textFont = app.textFonts.getByName("MyriadPro-Regular"); return 1;' });
  const png = join(dir, 'low.png');
  await call('export', { format: 'png', artboards: [0], scale: 0.1, path: png });
  await call('place', { path: png, x: 200, y: 100, w: 90, name: 'LowRes' });
  const gone = join(dir, 'gone.png');
  await call('export', { format: 'png', artboards: [0], scale: 0.1, path: gone });
  await call('place', { path: gone, x: 200, y: 160, w: 20, name: 'Broken' });
  (await import('node:fs')).rmSync(gone);
  // RGB images (vector fills are converted to CMYK on assignment in a CMYK document)
  await call('place', { path: png, x: 40, y: 120, w: 20, layer: 'Notes', name: 'RGBonNotes' });
  await call('layers', { action: 'update', name: 'Notes', printable: false });
  await call('preflight', {}, { check: (v) => {
    const c = v.checks, has = (k, n) => assert(c[k] && c[k].count >= (n ?? 1), 'expected ' + k + ' in ' + Object.keys(c));
    has('rgb_in_cmyk'); assert(c.rgb_in_cmyk.items.some((i) => i.name === 'LowRes') && c.rgb_in_cmyk.items.every((i) => i.name !== 'RGBonNotes'), 'linked RGB found; non-printing layer skipped (A3)');
    assert(v.skipped_non_printing === 1, 'skipped 1');
    has('white_overprint'); has('registration_color'); has('hairline'); has('off_artboard'); has('small_text'); has('overset_text'); has('default_text'); has('low_res'); has('broken_link'); has('no_bleed');
    assert(c.spot_color.count === 1 && /Pantone X/.test(c.spot_color.items[0].detail), 'only the real spot ink (A2): ' + JSON.stringify(c.spot_color));
    assert(v.inks.spot.join() === 'Pantone X', 'spot ink used');
    assert(!v.ok && v.summary.errors >= 4, 'errors counted');
  } });
  await call('preflight', { ignore: ['live_text', 'no_bleed', 'small_text'] }, { check: (v) => assert(!v.checks.live_text && !v.checks.no_bleed && !v.checks.small_text, 'ignore (A4)') });

  // ── phase 3 exit: preflight on (a copy of) a real production file: no false spot-colour or non-printing warnings ──
  // set CHANDELIER_PRICELIST=/path/to/file.ai to run it (only a copy is opened)
  const PRICE = process.env.CHANDELIER_PRICELIST;
  if (PRICE && existsSync(PRICE)) {
    const copy = join(dir, 'pricelist-copy.ai');
    (await import('node:fs')).copyFileSync(PRICE, copy);
    await call('documents', { action: 'open', path: copy }, { check: (v) => track(v) });
    await call('preflight', {}, { check: (v) => {
      assert(!v.checks.spot_color && v.inks.spot_defined.length === 0, 'no false spot colours (global process swatches are not spots)');
      assert(v.skipped_non_printing === 10, 'Guides + Instructions layers skipped: ' + v.skipped_non_printing);
      assert(v.summary.errors === 0, 'no errors');
      assert(v.checks.live_text.items.length === 0, 'live text = one info line');
    } });
  } else console.log('skip: price-list file not found');

  // ── crop marks ──
  await newDoc({ width: 100, height: 50, units: 'mm', artboards: 2, bleed: 3, title: 'aia-print-marks' });
  await call('configure', { units: 'mm' });
  await call('artboards', { action: 'crop_marks', all: true }, { check: (v) => assert(v.marks === 16 && v.offset === 3 && v.length === 5, 'marks ' + JSON.stringify(v)) });
  await call('find_items', { layer: 'Crop Marks', type: 'path', fields: ['stroke', 'sw', 'box'], limit: 1 }, { check: (v) => assert(v.total === 16 && /swatch:/.test(v.items[0].stroke) && v.items[0].sw === 0.25, 'registration hairlines ' + JSON.stringify(v.items[0])) });
  await call('preflight', { ignore: ['live_text'] }, { check: (v) => assert(v.checks.registration_color.count === 16, 'marks are registration-coloured (expected warning)') });
  await call('configure', { units: 'pt' });
} finally {
  for (const d of docs.reverse()) await call('documents', { action: 'close', name: d, discard: true });
}
process.exit(await done('· files in ' + dir) ? 1 : 0);
