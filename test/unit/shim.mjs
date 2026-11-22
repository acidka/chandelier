// A tiny fake of Illustrator's scripting DOM in a Node vm, enough to run the runtime (src/runtime/*.jsx) for unit tests.
// Used directly by tests (loadRuntime) and by fake-illustrator.mjs (a bridge that evaluates code in this vm).
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

export function makeContext(opts = {}) {
  const color = (typename) => function () { this.typename = typename; };
  const artboards = (opts.artboards ?? [[0, 842, 595, 0]]).map((r, i) => ({ artboardRect: r, name: 'AB' + i }));
  let active = opts.active ?? 0;
  const items = opts.items ?? [];
  let nextUuid = 100;
  const layer = { typename: 'Layer', name: 'Layer 1' };
  const mkItem = (typename, b) => {
    const it = { typename, uuid: String(nextUuid++), name: '', visibleBounds: b, parent: layer, removed: false,
      remove() { this.removed = true; const k = items.indexOf(this); if (k >= 0) items.splice(k, 1); } };
    items.push(it);
    return it;
  };
  layer.pageItems = items;
  layer.layers = [];
  layer.pathItems = { rectangle: (t, l, w, h) => mkItem('PathItem', [l, t, l + w, t - h]) };
  const doc = {
    typename: 'Document', name: 'Fake', documentColorSpace: opts.cmyk === false ? 'RGB' : 'CMYK', selection: [],
    pageItems: items, activeLayer: layer,
    artboards: Object.assign(artboards, { getActiveArtboardIndex: () => active, setActiveArtboardIndex: (i) => { active = i; } }),
    getPageItemFromUuid: (u) => { const it = items.find((x) => x.uuid === u); if (!it) throw new Error('no'); return it; },
    layers: Object.assign([layer], { getByName: (n) => { const l = [layer, ...items.map((x) => x.parent)].find((p) => p?.typename === 'Layer' && p.name === n); if (!l) throw new Error('no'); return l; } }),
  };
  const ctx = {
    app: { documents: Object.assign([doc], { length: 1 }), activeDocument: doc, version: '29.1.0', locale: 'en_US', userInteractionLevel: 'DISPLAYALERTS' },
    DocumentColorSpace: { CMYK: 'CMYK', RGB: 'RGB' },
    UserInteractionLevel: { DONTDISPLAYALERTS: 'DONTDISPLAYALERTS' },
    CMYKColor: color('CMYKColor'), RGBColor: color('RGBColor'), GrayColor: color('GrayColor'), NoColor: color('NoColor'), SpotColor: color('SpotColor'),
  };
  ctx.$ = { global: ctx, sleep: () => {} };
  vm.createContext(ctx);
  return { ctx, doc, items };
}

export function loadRuntime(opts = {}) {
  const { ctx, doc, items } = makeContext(opts);
  const dir = new URL('../../src/runtime/', import.meta.url);
  const mods = readdirSync(dir).filter((f) => f.endsWith('.jsx') && f !== 'core.jsx').sort();
  const src = ['core.jsx', ...mods].map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
  vm.runInContext(src.replace('__AIA_VERSION__', 'test'), ctx);
  const A = ctx.$.global.AIA;
  // Values must be built inside the vm realm (instanceof Array would fail across realms).
  const v = (x) => vm.runInContext('(' + JSON.stringify(x) + ')', ctx);
  return { A, ctx, doc, items, v, dispatch: (req) => JSON.parse(A.dispatch(v(req)).slice(1)) };
}
