#!/usr/bin/env node
// Live suite for the phase 2 create/edit tools. Works only in documents it creates; closes them without saving.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect, assert } from './live-lib.mjs';

const dir = mkdtempSync(join(tmpdir(), 'aia-live-edit-'));
const { call, done } = await connect('live-edit');
const docs = [];
const newDoc = async (args) => call('documents', { action: 'new', ...args }, { check: (v) => { docs.push(v.name); } });

try {
  await newDoc({ width: 400, height: 300, title: 'aia-live-edit' });

  // ── create_shape ──
  await call('create_shape', { x: 10, y: 10, w: 100, h: 50, fill: 'cmyk(0,100,100,0)', name: 'R1', layer: 'Shapes' },
    { check: (v) => assert(v.count === 1 && v.items[0].name === 'R1' && v.items[0].box.join() === '10,10,100,50', 'rect box') });
  await call('create_shape', { shape: 'line', x1: 10, y1: 100, x2: 390, y2: 100, stroke_width: 2, name: 'L1' },
    { check: (v) => assert(v.items[0].box.join() === '10,99,380,2', 'line box: butt caps, 2 pt stroke') });
  await call('create_shape', { fill: 'cmyk(100,0,0,0)', w: 20, h: 20, items: [{ x: 10, y: 150, name: 'S0' }, { shape: 'ellipse', x: 40, y: 150, name: 'S1' }, { shape: 'star', x: 70, y: 150, name: 'S2' }] },
    { check: (v) => assert(v.count === 3, '3 items') });
  await call('create_shape', { w: 5, h: 5, items: [{ x: 1, y: 1, name: 'ATOM' }, { x: 2 }] }, { expectError: true });
  await call('run_script', { code: 'var g = AIA.rect(0, 280, 400, 1, {name: "Guide"}); g.guides = true; return 1;' });
  await call('find_items', { guides: true, fields: ['name'] }, { check: (v) => assert(v.total === 1 && v.items[0].name === 'Guide', 'guides filter') });
  await call('find_items', { name: 'ATOM', count_only: true }, { check: (v) => assert(v.total === 0, 'failed multi-create left nothing') });

  // ── create_path ──
  const tri = [[200, 150], { a: [250, 150], in: [240, 130], out: [260, 170] }, [225, 200]];
  await call('create_path', { points: tri, closed: true, fill: 'cmyk(0,50,100,0)', name: 'Tri' }, { check: (v) => assert(v.items[0].type === 'path', 'path') });
  await call('get_items', { refs: 'name:Tri', points: true }, { check: (v) => {
    const p = v.items[0].path;
    assert(p.length === 3 && v.items[0].closed, '3 closed points');
    assert(JSON.stringify(p[1]) === JSON.stringify({ a: [250, 150], in: [240, 130], out: [260, 170] }), 'handles round-trip: ' + JSON.stringify(p[1]));
  } });
  await call('create_path', { d: 'M0 0h40v40h-40z M10 10h20v20h-20z', x: 300, y: 150, fill: 'gray(80)', name: 'Ring' },
    { check: (v) => assert(v.items[0].type === 'compound' && v.items[0].box.join() === '300,150,40,40', 'compound with hole') });
  await call('create_path', { d: 'M0 0a10 10 0 0120 0a10 10 0 01-20 0z', x: 300, y: 220, scale: 2, name: 'Circle' },
    { check: (v) => { const b = v.items[0].box; assert(Math.abs(b[2] - 40) < 0.01 && Math.abs(b[3] - 40) < 0.01 && Math.abs(b[1] - 200) < 0.01, 'arc circle 40x40 from y 200: ' + b); } });
  await call('create_path', { d: 'M0 0 L' }, { expectError: true });

  // ── create_text / edit_text ──
  await call('create_text', { text: 'Січень 2027', x: 20, y: 60, font: 'Arial Bold', size: 24, fill: 'cmyk(100,85,30,25)', name: 'Title', layer: 'Text' },
    { check: (v) => assert(v.items[0].name === 'Title', 'title') });
  await call('get_items', { refs: 'name:Title' }, { check: (v) => { const t = v.items[0]; assert(t.anchor.join() === '20,60' && t.runs[0].font === 'Arial-BoldMT' && t.runs[0].size === 24, 'baseline at y, font'); } });
  await call('create_text', { text: 'Top', x: 200, y: 20, y_ref: 'top', size: 10, name: 'TopRef' }, { check: (v) => assert(Math.abs(v.items[0].box[1] - 20) < 0.01, 'top at y') });
  await call('create_text', { text: 'This is area text that will not fit into such a tiny box at all', x: 20, y: 200, w: 60, h: 20, size: 12, name: 'Area' },
    { check: (v) => assert(v.overset && v.overset.length === 1, 'overset reported') });
  await call('create_text', { text: 'Bad', x: 1, y: 1, font: 'NoSuchFont-XYZ', name: 'BADTEXT' }, { expectError: true });
  await call('find_items', { name: 'BADTEXT', count_only: true }, { check: (v) => assert(v.total === 0, 'no orphan frame (A8)') });
  await call('create_shape', { shape: 'ellipse', x: 250, y: 200, w: 80, h: 80, name: 'Orbit' });
  await call('create_text', { text: 'around the circle', on_path: 'name:Orbit', keep_path: true, size: 9, name: 'OnPath' }, { check: (v) => assert(v.count === 1, 'path text') });
  await call('create_text', { size: 8, align: 'center', items: [{ text: '1', x: 30, y: 250 }, { text: '2', x: 50, y: 250 }, { text: '3', x: 70, y: 250, fill: 'cmyk(0,100,100,0)' }] }, { check: (v) => assert(v.count === 3, '3 texts') });
  await call('edit_text', { refs: 'name:Title', ranges: [{ match: '2027', fill: 'cmyk(0,100,100,0)', size: 18 }] }, { check: (v) => assert(v.edits === 1, 'range styled') });
  await call('get_items', { refs: 'name:Title' }, { check: (v) => { const r = v.items[0].runs; assert(r.length === 2 && r[1].text === '2027' && r[1].size === 18 && r[1].fill === 'cmyk(0,100,100,0)', 'runs ' + JSON.stringify(r)); } });
  await call('edit_text', { replace: { find: 'Січень', with: 'Лютий' } }, { check: (v) => assert(v.edits === 1, 'replace in document') });
  await call('get_items', { refs: 'name:Title' }, { check: (v) => assert(v.items[0].contents === 'Лютий 2027' && v.items[0].runs[0].font === 'Arial-BoldMT', 'replaced, styling kept') });
  await call('edit_text', { refs: 'name:Title', align: 'right', ranges: [{ start: 0, end: 1, underline: true }, { start: -4, caps: 'all' }] }, { check: (v) => assert(v.edits === 3, '3 edits') });

  // ── modify_items / delete_items ──
  await call('modify_items', { refs: 'name:R1', x: 50, y: 20, w: 200, fill: 'gray(30)', stroke: 'cmyk(0,100,0,0)', stroke_width: 4, opacity: 80 },
    { check: (v) => assert(v.items[0].box.join() === '48,18,204,54', 'moved+resized (visible box incl. 4 pt stroke): ' + v.items[0].box) });
  await call('get_items', { refs: 'name:R1' }, { check: (v) => assert(v.items[0].geo.join() === '50,20,200,50' && v.items[0].sw === 4 && v.items[0].opacity === 80, 'geo ' + v.items[0].geo) });
  await call('modify_items', { refs: 'name:R1', w: 100, keep_ratio: true, anchor: 'center' }, { check: (v) => assert(Math.abs(v.items[0].box[2] - 104) < 0.01, 'ratio') });
  await call('modify_items', { fill: 'cmyk(0,0,100,0)', items: [{ ref: 'name:S0', x: 0 }, { ref: 'name:S1', x: 30, fill: 'cmyk(0,100,0,0)' }] },
    { check: (v) => assert(v.count === 2 && v.items[0].box[0] === 0, 'per-item') });
  await call('modify_items', { refs: 'name:S2', locked: true });
  await call('modify_items', { refs: 'name:S2', x: 5 }, { expectError: true });
  await call('delete_items', { refs: ['name:S0', 'name:S2'] }, { check: (v) => assert(v.deleted === 1 && v.skipped_locked.length === 1, 'locked skipped') });
  await call('delete_items', { refs: 'name:S2', force: true }, { check: (v) => assert(v.deleted === 1, 'force') });

  // ── transform_items / duplicate_items ──
  await newDoc({ width: 200, height: 100, artboards: 3, columns: 3, title: 'aia-live-transform' });
  let T;
  await call('create_shape', { x: 10, y: 10, w: 40, h: 20, fill: 'gray(50)', name: 'T' }, { check: (v) => { T = v.items[0].uuid; } });
  await call('transform_items', { refs: T, dx: 10, dy: 5 }, { check: (v) => assert(v.items[0].box.join() === '20,15,40,20', 'move ' + v.items[0].box) });
  await call('transform_items', { refs: T, rotate: 90 }, { check: (v) => { const b = v.items[0].box.map(Math.round); assert(b.join() === '30,5,20,40', 'rotate about centre ' + b); } });
  await call('transform_items', { refs: T, rotate: -90, scale: 50, origin: 'top_left' }, { check: (v) => { const b = v.items[0].box.map((n) => Math.round(n * 100) / 100); assert(b[2] === 20 && b[3] === 10, 'scale 50% ' + b); } });
  await call('modify_items', { refs: T, x: 0, y: 0, w: 10, h: 10 });
  await call('transform_items', { refs: T, rotate: 90, origin: [50, 50] }, { check: (v) => { const b = v.items[0].box.map(Math.round); assert(b.join() === '90,0,10,10', 'rotate about a point (clockwise, y down) ' + b); } });
  await call('transform_items', { refs: T, dx: 15, copies: 3 }, { check: (v) => assert(v.count === 3 && Math.round(v.items[2].box[0]) === 135, 'step and repeat') });
  await call('transform_items', { refs: T, reflect: 'horizontal' }, { check: (v) => assert(Math.round(v.items[0].box[0]) === 90, 'reflect in place') });
  await call('modify_items', { refs: T, name: 'T0' });
  await call('duplicate_items', { refs: T, to_artboards: 'all', name_suffix: '@{artboard}' }, { check: (v) => assert(v.count === 2 && v.items[1].name === 'T0@2', 'to artboards') });
  await call('find_items', { name: 'T0@*', fields: ['name', 'artboard', 'box'] }, { check: (v) => assert(v.total === 2 && v.items.every((i) => i.name === 'T0@' + i.artboard), 'same relative position on each artboard') });
  await call('duplicate_items', { refs: T, rows: 2, cols: 3, gap_x: 2, gap_y: 2, layer: 'Grid' }, { check: (v) => assert(v.count === 5, 'grid 2x3 minus original') });

  // ── arrange_items / align_items ──
  await newDoc({ width: 300, height: 200, title: 'aia-live-arrange' });
  await call('create_shape', { w: 20, h: 20, fill: 'gray(40)', items: [{ x: 10, y: 10, name: 'A1' }, { x: 50, y: 30, name: 'A2' }, { x: 120, y: 5, w: 40, name: 'A3' }] });
  await call('arrange_items', { action: 'group', refs: 'name:A*', name: 'G' }, { check: (v) => assert(v.items[0].type === 'group', 'group') });
  await call('get_tree', { root: 'name:G' }, { check: (v) => assert(v.tree[0].children.map((c) => c.name).join() === 'A3,A2,A1', 'stacking kept: ' + v.tree[0].children.map((c) => c.name)) });
  await call('align_items', { refs: 'name:A*', vertical: 'top' }, { check: (v) => assert(v.items.every((i) => i.box[1] === 5), 'top aligned') });
  await call('align_items', { refs: 'name:A*', distribute: 'horizontal', spacing: 10 }, { check: (v) => {
    const xs = v.items.map((i) => i.box).sort((p, q) => p[0] - q[0]); assert(Math.round(xs[1][0] - (xs[0][0] + xs[0][2])) === 10, 'fixed spacing ' + JSON.stringify(xs)); } });
  await call('align_items', { refs: 'name:G', horizontal: 'center', vertical: 'middle', to: 'artboard' }, { check: (v) => { const b = v.items[0].box; assert(Math.abs(b[0] + b[2] / 2 - 150) < 0.6 && Math.abs(b[1] + b[3] / 2 - 100) < 0.6, 'centred on artboard ' + b); } });
  await call('arrange_items', { action: 'back', refs: 'name:A3' });
  await call('get_tree', { root: 'name:G' }, { check: (v) => assert(v.tree[0].children[2].name === 'A3', 'A3 to back') });
  await call('arrange_items', { action: 'ungroup', refs: 'name:G' }, { check: (v) => assert(v.count === 3, 'ungrouped') });
  await call('create_shape', { shape: 'ellipse', x: 0, y: 0, w: 60, h: 60, name: 'Mask' });
  await call('arrange_items', { action: 'clip', refs: ['name:A1', 'name:A2', 'name:Mask'], name: 'Clip' }, { check: (v) => assert(v.items[0].box.join() === '0,0,60,60', 'box of a clipping group = its mask ' + v.items[0].box) });
  await call('get_items', { refs: 'name:Clip' }, { check: (v) => assert(v.items[0].clipped === true, 'clipped group') });
  await call('create_shape', { w: 30, h: 30, items: [{ x: 200, y: 100, name: 'C1' }, { x: 210, y: 110, w: 10, h: 10, name: 'C2' }] });
  await call('arrange_items', { action: 'compound', refs: ['name:C1', 'name:C2'], name: 'CP' }, { check: (v) => assert(v.items[0].type === 'compound', 'compound') });
  await call('arrange_items', { action: 'move_into', refs: 'name:CP', target: 'layer:Top' });
  await call('find_items', { name: 'CP', fields: ['layer'] }, { check: (v) => assert(v.items[0].layer === 'Top', 'moved into new layer') });

  // ── path_ops ──
  await newDoc({ width: 300, height: 200, title: 'aia-live-pathops' });
  await call('create_shape', { fill: 'cmyk(0,100,0,0)', items: [{ x: 10, y: 10, w: 60, h: 60, name: 'P1' }, { shape: 'ellipse', x: 40, y: 40, w: 60, h: 60, name: 'P2' }] });
  await call('path_ops', { op: 'unite', refs: ['name:P1', 'name:P2'], name: 'U' }, { check: (v) => assert(v.count === 1 && v.items[0].box.join() === '10,10,90,90' && v.items[0].type === 'path', 'unite ' + JSON.stringify(v.items)) });
  await call('create_shape', { fill: 'gray(50)', items: [{ x: 150, y: 10, w: 60, h: 60, name: 'Q1' }, { shape: 'ellipse', x: 180, y: 40, w: 60, h: 60, name: 'Q2' }] });
  await call('path_ops', { op: 'minus_front', refs: ['name:Q1', 'name:Q2'], name: 'M' }, { check: (v) => assert(v.count === 1 && v.items[0].box.join() === '150,10,60,60', 'minus front') });
  await call('create_shape', { shape: 'line', x1: 10, y1: 150, x2: 100, y2: 150, stroke_width: 10, name: 'Ln' });
  await call('path_ops', { op: 'outline_stroke', refs: 'name:Ln' }, { check: (v) => assert(v.items[0].box.join() === '10,145,90,10', 'outline stroke ' + v.items[0].box) });
  await call('create_shape', { x: 150, y: 120, w: 40, h: 40, fill: 'gray(20)', name: 'O' });
  await call('path_ops', { op: 'offset', refs: 'name:O', distance: 5, keep_original: true, name: 'O+5' }, { check: (v) => assert(v.items[0].box.join() === '145,115,50,50', 'offset ' + v.items[0].box) });
  await call('create_text', { text: 'Outline', x: 220, y: 150, size: 20, name: 'TX' });
  await call('path_ops', { op: 'outline_text', refs: 'name:TX' }, { check: (v) => assert(v.items[0].type === 'group' && v.items[0].name === 'TX', 'text outlines') });

  // ── layers / artboards ──
  await newDoc({ width: 200, height: 100, title: 'aia-live-structure' });
  await call('layers', { action: 'add', name: 'Back', position: 'bottom', color: '#ff0000' });
  await call('layers', { action: 'add', name: 'Guides', printable: false, locked: true });
  await call('layers', { action: 'add', name: 'Inner', parent: 'Back' });
  await call('layers', { action: 'list' }, { check: (v) => {
    const names = v.layers.map((l) => l.name);
    assert(names[0] === 'Guides' && names[names.length - 1] === 'Back', 'order ' + names);
    assert(v.layers[0].printable === false && v.layers[0].locked, 'flags');
    assert(v.layers.find((l) => l.name === 'Back').sublayers[0].name === 'Inner', 'sublayer');
  } });
  await call('create_shape', { x: 10, y: 10, w: 20, h: 20, layer: 'Back/Inner', name: 'InInner' });
  await call('find_items', { layer: 'Back', fields: ['name', 'layer'] }, { check: (v) => assert(v.items[0].layer === 'Inner', 'sublayer by path; layer filter includes sublayers') });
  await call('layers', { action: 'remove', name: 'Back' }, { expectError: true });
  await call('layers', { action: 'update', name: 'Guides', new_name: 'Notes', visible: false, position: 'below:Back' }, { check: (v) => assert(v.name === 'Notes' && v.locked && v.visible === false, 'locked layer renamed, stays locked') });
  await call('artboards', { action: 'add', w: 100, h: 50, name: 'Small' }, { check: (v) => assert(v.rect.join() === '220,0,100,50' && v.name === 'Small', 'add right of last ' + v.rect) });
  await call('artboards', { action: 'update', index: 1, rect: [0, 150, 120, 60] }, { check: (v) => assert(v.rect.join() === '0,150,120,60', 'rect round trip (A7)') });
  await call('create_shape', { x: 10, y: 160, w: 10, h: 10, name: 'OnSmall', layer: 'Art' });
  await call('artboards', { action: 'grid_layout', columns: 2, spacing: 10 }, { check: (v) => assert(v.artboards[1].rect.join() === '210,0,120,60' && v.items_moved >= 1, 'grid ' + JSON.stringify(v)) });
  await call('find_items', { name: 'OnSmall', fields: ['box'] }, { check: (v) => assert(v.items[0].box.join() === '219.5,9.5,11,11', 'art moved with its artboard ' + v.items[0].box) });
  await call('artboards', { action: 'fit_to_art', index: 1, refs: 'name:OnSmall', pad: 5 }, { check: (v) => assert(v.rect.join() === '214.5,4.5,21,21', 'fit (visible bounds + pad) ' + v.rect) });
  await call('artboards', { action: 'remove', index: 1 }, { check: (v) => assert(v.artboards === 1, 'removed') });

  // ── swatches / fonts ──
  await newDoc({ width: 200, height: 100, title: 'aia-live-swatches' });
  await call('swatches', { action: 'clean_defaults' }, { check: (v) => assert(v.removed > 10, 'defaults removed ' + v.removed) });
  await call('swatches', { action: 'add', name: 'Navy', color: 'cmyk(100,85,30,25)', group: 'Brand' }, { check: (v) => assert(v.kind === 'global' && v.group === 'Brand', 'global in group') });
  await call('swatches', { action: 'add', name: 'Gold', kind: 'spot', color: 'cmyk(0,20,60,20)' }, { check: (v) => assert(v.kind === 'spot', 'spot') });
  await call('swatches', { action: 'add', name: 'Fade', kind: 'gradient', stops: [{ color: 'swatch:Navy' }, { color: 'cmyk(0,0,0,0)', at: 100 }] }, { check: (v) => assert(v.stops.length === 2, 'gradient') });
  await call('create_shape', { x: 10, y: 10, w: 50, h: 50, fill: 'gradient:Fade@90', name: 'GR' });
  await call('create_shape', { x: 70, y: 10, w: 50, h: 50, fill: 'swatch:Navy', name: 'NV' });
  await call('swatches', { action: 'update', name: 'Navy', color: 'cmyk(100,60,0,40)' });
  await call('get_items', { refs: ['name:NV', 'name:GR'] }, { check: (v) => assert(v.items[0].fill === 'swatch:Navy' && v.items[1].fill.startsWith('gradient:Fade'), 'fills ' + v.items.map((i) => i.fill)) });
  await call('swatches', { action: 'list' }, { check: (v) => { const k = v.swatches.map((s) => s.kind).sort().join(); assert(v.swatches.find((s) => s.name === 'Navy').color === 'cmyk(100,60,0,40)', 'global updated'); assert(/global/.test(k) && /spot/.test(k) && /registration/.test(k), 'kinds ' + k); } });
  await call('swatches', { action: 'remove', name: 'Gold' }, { check: (v) => assert(v.removed === 1, 'removed') });
  await call('fonts', { query: 'arial bold', limit: 5 }, { check: (v) => assert(v.fonts.some((f) => f.name === 'Arial-BoldMT'), 'font search') });
  await call('fonts', { resolve: 'Arial Bold Italic' }, { check: (v) => assert(v.name === 'Arial-BoldItalicMT', 'resolve ' + v.name) });

  // ── styles ──
  await newDoc({ width: 300, height: 200, title: 'aia-live-styles' });
  await call('swatches', { action: 'add', name: 'Ink', color: 'cmyk(0,0,0,90)' });
  await call('styles', { action: 'create', name: 'H1', font: 'Arial Bold', size: 28, fill: 'swatch:Ink', align: 'center', space_after: 6 }, { check: (v) => assert(v.spec.size === 28 && v.spec.align === 'center', 'spec stored') });
  await call('styles', { action: 'create', kind: 'character', name: 'Accent', fill: 'cmyk(0,100,100,0)', underline: true });
  await call('create_text', { text: 'Heading accent', x: 150, y: 50, name: 'Hd' });
  await call('styles', { action: 'apply', name: 'H1', refs: 'name:Hd' }, { check: (v) => assert(v.applied === 1, 'applied') });
  await call('styles', { action: 'apply', kind: 'character', name: 'Accent', refs: 'name:Hd', match: 'accent' });
  await call('get_items', { refs: 'name:Hd' }, { check: (v) => { const t = v.items[0]; assert(t.paragraph_style === 'H1' && t.align === 'center' && t.runs[0].size === 28 && t.runs[0].font === 'Arial-BoldMT', 'paragraph style look'); assert(t.runs.some((r) => r.text === 'accent' && r.fill === 'cmyk(0,100,0,0)'.replace('0,100,0,0', '0,100,100,0')), 'character style on match ' + JSON.stringify(t.runs)); } });
  await call('styles', { action: 'update', name: 'H1', size: 32 });
  await call('get_items', { refs: 'name:Hd' }, { check: (v) => assert(v.items[0].runs[0].size === 32, 'style update flows to text') });
  await call('styles', { action: 'list', kind: 'paragraph' }, { check: (v) => assert(v.paragraph.find((s) => s.name === 'H1').spec.size === 32, 'list with merged spec') });
  await call('create_text', { text: 'Body', x: 10, y: 120, paragraph_style: 'H1', name: 'Body' }, { check: (v) => assert(v.count === 1, 'create_text with style') });
  await call('styles', { action: 'remove', kind: 'character', name: 'Accent' });

  // ── place / menu_command / history ──
  await newDoc({ width: 300, height: 200, title: 'aia-live-place' });
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"><rect width="100" height="60" fill="#ff0000"/><circle cx="50" cy="30" r="20" fill="#0000ff"/></svg>';
  await call('place', { svg, x: 10, y: 10, w: 50, name: 'Icon' }, { check: (v) => assert(v.how === 'editable' && v.box.join() === '10,10,50,30', 'svg markup editable, fitted ' + v.box) });
  await call('get_tree', { root: 'name:Icon' }, { check: (v) => assert(v.tree[0].count >= 2, 'editable paths inside') });
  const png = join(dir, 'p.png');
  await call('preview', { region: [0, 0, 60, 40], max_px: 60, save_to: png });
  await call('place', { path: png, x: 100, y: 10, h: 40, name: 'Img' }, { check: (v) => assert(v.how === 'linked' && Math.round(v.box[3]) === 40, 'png linked, fitted to h') });
  await call('place', { path: png, x: 200, y: 10, embed: true, name: 'Emb' }, { check: (v) => assert(v.how === 'embedded' && v.type === 'raster', 'embedded ' + JSON.stringify(v)) });
  await call('place', { path: join(dir, 'nope.png') }, { expectError: true });
  await call('create_shape', { x: 10, y: 100, w: 20, h: 20, name: 'H1' });
  await call('create_shape', { x: 40, y: 100, w: 20, h: 20, name: 'H2' });
  await call('history', { action: 'undo' }, { check: (v) => assert(v.done === 1, 'undo') });
  await call('find_items', { name: 'H*', count_only: true, type: 'path' }, { check: (v) => assert(v.total === 1, 'last call undone') });
  await call('history', { action: 'redo' });
  await call('find_items', { name: 'H*', count_only: true, type: 'path' }, { check: (v) => assert(v.total === 2, 'redone') });
  await call('menu_command', { command: 'group', refs: ['name:H1', 'name:H2'] }, { check: (v) => assert(v.count === 1 && v.items[0].type === 'group', 'menu group') });

  // ── phase 4 fixes from agent feedback ──
  await newDoc({ width: 300, height: 200, title: 'aia-live-feedback' });
  await call('document_info', { checks: false }, { check: (v) => assert(v.bleed.source === 'xmp' && v.bleed.left === 0, 'new document reports bleed 0 from xmp') });
  await call('layers', { action: 'update', name: 'Layer 1', new_name: 'Base' }, { check: (v) => assert(v.name === 'Base', 'Layer 1 finds the localised default layer') });
  await call('layers', { action: 'update', name: '@active', locked: false }, { check: (v) => assert(v.name === 'Base', '@active') });
  await call('swatches', { action: 'add', name: 'P', kind: 'process', color: 'cmyk(0,0,0,40)' });
  await call('swatches', { action: 'add', name: 'P', kind: 'process', color: 'cmyk(0,0,0,60)' }, { check: (v) => assert(v.color === 'cmyk(0,0,0,60)', 'add updates an existing swatch') });
  await call('styles', { action: 'create', name: 'Day', font: 'Arial', size: 10 });
  await call('create_text', { paragraph_style: 'Day', align: 'center', grid: { x: 20, y: 30, cols: 7, dx: 20, dy: 15, cells: ['', '', 1, 2, 3, 4, 5, 6, 7, 8], col_props: { '5': { fill: 'cmyk(0,100,100,0)' }, '6': { fill: 'cmyk(0,100,100,0)' } } } },
    { check: (v) => assert(v.count === 8, 'grid made 8 cells') });
  await call('find_items', { type: 'text', fill: 'cmyk(0,100,100,0)', fields: ['text'] }, { check: (v) => assert(v.items.map((i) => i.text).sort().join() === '4,5', 'weekend columns red: ' + v.items.map((i) => i.text)) });
  await call('create_text', { text: 'Loose', x: 200, y: 150 });
  await call('document_info', {}, { check: (v) => {
    assert(v.fonts.ArialMT === 8 && v.fonts['MyriadPro-Regular'] === 1, 'fonts count text frames, not characters: ' + JSON.stringify(v.fonts));
    assert(v.issues.unstyledText === 1, 'one frame without a paragraph style: ' + JSON.stringify(v.issues));
  } });
  const builder = 'var L = AIA.fresh("Built"); for (var i = 0; i < arguments[0]; i++) AIA.rect(10 + i * 12, 150, 10, 10, {fill: "gray(50)", parent: L}); return L.pageItems.length;';
  await call('run_script', { code: builder, args: [5] }, { check: (v) => assert(v.result === 5, 'first build') });
  await call('run_script', { code: builder, args: [3] }, { check: (v) => assert(v.result === 3, 're-run replaces (AIA.fresh), not adds: ' + v.result) });
  const shot = join(dir, 'ref.png');
  await call('preview', { save_to: shot, max_px: 300 });
  await call('preview', { reference: shot, max_px: 300 }, { check: (_v, r) => { const v = JSON.parse(r.content.find((c) => c.type === 'text').text); assert(v.rmse < 0.01 && v.content_box.shift.join() === '0,0', 'self-comparison: same image ' + v.rmse); } });
  await call('preview', { width: 333 }, { check: (_v, r) => { const v = JSON.parse(r.content.find((c) => c.type === 'text').text); assert(v.px[0] === 333, 'exact width ' + v.px); } });
} finally {
  for (const d of docs.reverse()) await call('documents', { action: 'close', name: d, discard: true });
}
process.exit(await done('· files in ' + dir) ? 1 : 0);
