import { describe, it, expect } from 'vitest';
import { loadRuntime } from './shim.mjs';

describe('runtime JSON', () => {
  const { A, v } = loadRuntime();
  it('serialises ASCII-only, rounds numbers, drops undefined', () => {
    expect(A.json(v({ s: 'Січень "q"\n', n: 1.23456, a: [1, null, true] })))
      .toBe('{"s":"\\u0421\\u0456\\u0447\\u0435\\u043d\\u044c \\"q\\"\\u000a","n":1.235,"a":[1,null,true]}');
    expect(A.json({ u: undefined, inf: Infinity })).toBe('{"inf":null}');
  });
  it('parses JSON and rejects code', () => {
    expect(A.parse('{"a":[1,2,{"b":"x\\u0410"}],"c":null}')).toEqual({ a: [1, 2, { b: 'xА' }], c: null });
    expect(() => A.parse('{"a":alert(1)}')).toThrow(/not valid JSON/);
  });
});

describe('runtime colours', () => {
  const { A } = loadRuntime();
  it.each(['cmyk(100,85,30,25)', 'cmyk(0,0,0,60)', '#1e2a44', 'none'])('round-trips %s', (s) => {
    expect(A.colorStr(A.color(s))).toBe(s);
  });
  it('gray(k) is K in a CMYK document', () => {
    expect(A.colorStr(A.color('gray(60)'))).toBe('cmyk(0,0,0,60)');
  });
  it('explains unknown colours', () => {
    expect(() => A.color('blue')).toThrow(/Unknown colour "blue"/);
  });
});

describe('runtime coordinates and units', () => {
  // artboard 0 at document (0, 842) top-left; artboard 1 to the right at x = 700
  const { A } = loadRuntime({ artboards: [[0, 842, 595, 0], [700, 842, 1295, 0]] });
  it('artboard origin, y down, pt', () => {
    A.S = { units: 'pt', origin: 'artboard', artboard: null };
    expect(A.P(10, 20)).toEqual([10, 822]);
    expect(A.rectOut([10, 822, 110, 772])).toEqual([10, 20, 100, 50]);
    expect(A.rectIn([10, 20, 100, 50])).toEqual([10, 822, 110, 772]);
  });
  it('mm and a chosen artboard', () => {
    A.S = { units: 'mm', origin: 'artboard', artboard: 1 };
    const p = A.P(10, 10);
    expect(p[0]).toBeCloseTo(700 + 28.346, 2);
    expect(p[1]).toBeCloseTo(842 - 28.346, 2);
    expect(A.fromDoc(p[0], p[1])).toEqual([10, 10]);
  });
  it('document origin is Illustrator coordinates', () => {
    A.S = { units: 'pt', origin: 'document', artboard: null };
    expect(A.P(10, 20)).toEqual([10, 20]);
    expect(A.rectOut([10, 822, 110, 772])).toEqual([10, 822, 100, 50]);
  });
  it('rejects a missing artboard', () => {
    A.S = { units: 'pt', origin: 'artboard', artboard: 5 };
    expect(() => A.P(0, 0)).toThrow(/Artboard 5 does not exist/);
  });
});

describe('runtime glob', () => {
  const { A } = loadRuntime();
  it.each([
    ['Header', 'Header', true], ['Head*', 'Header', true], ['*er', 'Header', true], ['H?ader', 'Header', true],
    ['*a*e*', 'Header', true], ['Head', 'Header', false], ['Січ*', 'Січень', true], ['*', '', true],
  ])('%s ~ %s = %s', (p, s, want) => expect(A.glob(p, s)).toBe(want));
});

describe('runtime references', () => {
  const layer: any = { typename: 'Layer', name: 'Grid', layers: [] };
  const items = [
    { typename: 'PathItem', uuid: '11', name: 'Box A', visibleBounds: [0, 842, 100, 742], parent: layer },
    { typename: 'PathItem', uuid: '12', name: 'Box B', visibleBounds: [800, 842, 900, 742], parent: layer },
    { typename: 'TextFrame', uuid: '13', name: 'Title', visibleBounds: [10, 800, 200, 780], parent: layer },
  ];
  (layer as any).pageItems = items;
  const { A, v, doc } = loadRuntime({ items, artboards: [[0, 842, 595, 0], [700, 842, 1295, 0]] });
  doc.layers[0] = layer;
  const ids = (r: any[]) => r.map((x) => x.uuid);
  it('uuid, name glob, layer, artboard', () => {
    expect(ids(A.refs('12'))).toEqual(['12']);
    expect(ids(A.refs('name:Box*'))).toEqual(['11', '12']);
    expect(ids(A.refs('layer:Grid'))).toEqual(['11', '12', '13']);
    expect(ids(A.refs('artboard:1'))).toEqual(['12']);
    expect(ids(A.refs(v(['11', 'name:Title'])))).toEqual(['11', '13']);
  });
  it('step references resolve to items of earlier results', () => {
    A.steps = v([{ uuid: '13' }, { items: [{ uuid: '11' }, { uuid: '12' }] }]);
    expect(ids(A.refs('@1'))).toEqual(['11', '12']);
    expect(() => A.refs('@5')).toThrow(/Unknown step reference/);
  });
  it('a step reference sees every item, not only the 100 a result lists', () => {
    const items = Array.from({ length: 150 }, (_, i) => ({ uuid: String(500 + i), typename: 'PathItem' }));
    A.cmd.__many = () => A.outList(v(items)); // v(): arrays from the runtime's own realm
    A.cmd.__count = (a: any) => ({ n: A.refs(a.refs).length });
    const r = A.cmd.batch(v({ steps: [{ cmd: '__many' }, { cmd: '__count', args: { refs: '@0' } }] }));
    expect(r.results[0].data.items).toHaveLength(100);
    expect(r.results[0].data.more).toMatch(/50 more/);
    expect(r.results[1].data.n).toBe(150);
    delete A.cmd.__many; delete A.cmd.__count;
  });
  it('errors teach the syntax', () => {
    expect(() => A.refs('99')).toThrow(/No item with uuid 99/);
    expect(() => A.refs('foo')).toThrow(/Unknown reference "foo". Use a uuid/);
    expect(() => A.refs('name:Nope')).toThrow(/No item named/);
  });
});

describe('runtime dispatch', () => {
  it('returns an envelope, applies settings, restores the interaction level', () => {
    const { dispatch, ctx } = loadRuntime();
    expect(dispatch({ cmd: 'ping' })).toMatchObject({ ok: true, data: { v: 'test' }, doc: 'Fake' });
    expect(ctx.app.userInteractionLevel).toBe('DISPLAYALERTS');
    expect(dispatch({ cmd: 'script', args: { code: 'return AIA.S.units;' }, settings: { units: 'mm' } }).data).toBe('mm');
  });
  it('reports script errors with the line in the agent\'s code', () => {
    const { dispatch } = loadRuntime();
    const env = dispatch({ cmd: 'script', args: { code: 'var a = 1;\nthrow new Error("boom");' } });
    expect(env.ok).toBe(false);
    expect(env.error).toBe('boom');
  });
  it('collects warnings and unknown commands fail cleanly', () => {
    const { dispatch } = loadRuntime();
    expect(dispatch({ cmd: 'script', args: { code: 'AIA.warn("careful"); return 1;' } })).toMatchObject({ ok: true, data: 1, warnings: ['careful'] });
    expect(dispatch({ cmd: 'nope' })).toMatchObject({ ok: false, error: 'Unknown runtime command "nope".' });
  });
});

describe('runtime MRAP retry (B3)', () => {
  const { A } = loadRuntime();
  const mrap = () => Object.assign(new Error('MRAP'), { number: 1346458189 });
  it('retries a transient MRAP and counts it', () => {
    let n = 0;
    const before = A.mrapRetries;
    expect(A.retry(() => { if (n++ < 2) throw mrap(); return 'ok'; })).toBe('ok');
    expect(A.mrapRetries - before).toBe(2);
  });
  it('gives up after n tries and rethrows other errors at once', () => {
    let n = 0;
    expect(() => A.retry(() => { n++; throw mrap(); })).toThrow(/MRAP/);
    expect(n).toBe(3);
    n = 0;
    expect(() => A.retry(() => { n++; throw new Error('boom'); })).toThrow(/boom/);
    expect(n).toBe(1);
  });
  it('a final MRAP failure is counted and explained', () => {
    const before = A.mrapFailed;
    expect(A.errorInfo(mrap()).error).toMatch(/transient/);
    expect(A.mrapFailed - before).toBe(1);
  });
});
