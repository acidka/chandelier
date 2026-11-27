// Regression tests for bugs #19, #22, #24 (docs/bugs.md, found in the reply-mode runs 2026-11-27). The Illustrator-side
// fixes (#16, #17, #18, #20, #21, #23, #25, #26) are checked live in test/live-bugs-1127.mjs.
import { describe, it, expect } from 'vitest';
import { loadRuntime } from './shim.mjs';
import { frameNote, callFrames } from '../../src/server.js';
import { defaultSettings } from '../../src/settings.js';
import { expandGrid, create_text } from '../../src/tools/text.js';
import { project } from '../../src/tools/brief.js';

describe('#22 frame note names the frame of each step', () => {
  const s = defaultSettings('mac');
  it('batch steps with artboard are named, as ranges', () => {
    const own = callFrames('batch', { steps: [{ tool: 'a', artboard: 3 }, { tool: 'b', artboard: 3 }, { tool: 'c', artboard: 3 }, { tool: 'd' }, { tool: 'e', artboard: 1 }] });
    expect(own).toEqual([[0, 3], [1, 3], [2, 3], [4, 1]]);
    expect(frameNote({ ...s, artboard: 0, units: 'mm' }, own)).toBe('frame (mm): steps 0-2: artboard 3; step 4: artboard 1; other steps: artboard 0 (session configure, shared by every agent on this server)');
    expect(frameNote(s, own)).toMatch(/other steps: the active artboard$/);
  });
  it('preview of an artboard is in that artboard; image previews and plain calls say nothing new', () => {
    expect(frameNote({ ...s, artboard: 0 }, callFrames('preview', { artboard: 2 }))).toBe('frame: artboard 2, pt');
    expect(callFrames('preview', { artboard: 2, image: 'x.png' })).toEqual([]);
    expect(frameNote(s, callFrames('transform_items', { refs: 'x' }))).toBeNull();
    expect(frameNote({ ...s, artboard: 1 }, [])).toMatch(/^frame: artboard 1, pt \(session configure/);
  });
});

describe('#24 grid cells can be named, issues list a few items', () => {
  it('a name pattern names each grid cell', () => {
    const items = expandGrid({ x: 0, y: 0, cols: 2, dx: 10, dy: 10, cells: ['a', '', 'c', { text: 'd', name: 'Own' }] }, 'Day {row}-{col} #{n}');
    expect(items.map((i) => i.name)).toEqual(['Day 1-1 #1', 'Day 2-1 #2', 'Own']);
    const st = create_text.step!({ grid: { x: 0, y: 0, cols: 1, dx: 0, dy: 10, cells: ['x', 'y'] }, name: 'Cell {n}', size: 9 } as any, {} as any) as any;
    expect(st.args.name).toBeUndefined();
    expect(st.args.items.map((i: any) => i.name)).toEqual(['Cell 1', 'Cell 2']);
    const plain = create_text.step!({ grid: { x: 0, y: 0, cols: 1, dx: 0, dy: 10, cells: ['x'] }, name: 'Same' } as any, {} as any) as any;
    expect(plain.args.name).toBe('Same');
  });
  it('the brief document_info reply keeps issueItems', () => {
    const data = { name: 'D', colorSpace: 'CMYK', units: 'pt', artboards: [{}], counts: { all: 1 }, issues: { unnamedText: 1 }, issueItems: { unnamedText: [{ uuid: '7', text: 'Mon' }] }, layers: [] };
    expect(project('document_info', data, {}, defaultSettings('mac'))).toMatchObject({ issues: { unnamedText: 1 }, issueItems: { unnamedText: [{ uuid: '7' }] } });
  });
});

describe('#19 differences skip what the render does not show', () => {
  it('items_at leaves out hidden items, items in hidden groups and on hidden or non-printing layers', () => {
    const { doc, items, dispatch } = loadRuntime();
    const base = doc.layers[0] as any;
    base.visible = true; base.printable = true;
    const path = (uuid: string, parent: any, hidden = false) => ({ typename: 'PathItem', uuid, name: 'p' + uuid, hidden, visibleBounds: [0, 100, 100, 0], parent });
    const off = { typename: 'Layer', name: 'Off', visible: false, printable: true, layers: [], pageItems: [] as any[] };
    const np = { typename: 'Layer', name: 'NP', visible: true, printable: false, layers: [], pageItems: [] as any[] };
    const group: any = { typename: 'GroupItem', uuid: 'g', name: 'G', hidden: true, parent: base, pageItems: [] };
    group.pageItems.push(path('4', group));
    items.push(path('1', base) as any, path('5', base, true) as any, group);
    off.pageItems.push(path('2', off)); np.pageItems.push(path('3', np));
    (doc.layers as any).push(off, np);
    const env = dispatch({ cmd: 'items_at', args: { rects: [[0, 100, 100, 0]] } });
    expect(env.ok).toBe(true);
    expect(env.data[0].map((o: any) => o.uuid)).toEqual(['1']);
  });
});
