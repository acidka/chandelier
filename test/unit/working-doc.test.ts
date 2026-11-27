import { describe, it, expect } from 'vitest';
import { loadRuntime } from './shim.mjs';
import { Runtime } from '../../src/runtime.js';

// two saved documents with the same name (two runs.ai in different folders) and the user's window switching
function twoDocs() {
  const r = loadRuntime();
  const mk = (dir: string) => ({ ...r.doc, name: 'runs.ai', saved: true, path: { fsName: dir }, fullName: { fsName: dir + '/runs.ai' } });
  const a = mk('/suite/06'), b = mk('/suite/09');
  r.ctx.app.documents = Object.assign([a, b], { length: 2 });
  r.ctx.app.activeDocument = a;
  return { ...r, a, b };
}

describe('working document (runtime)', () => {
  it('reports the active document by its path, so two files of one name are told apart', () => {
    const { dispatch } = twoDocs();
    expect(dispatch({ cmd: 'ping', args: {} }).docKey).toBe('/suite/06/runs.ai');
  });
  it('the user switched windows between calls: the call goes back to the working document and says so', () => {
    const { dispatch, ctx, a, b } = twoDocs();
    ctx.app.activeDocument = b; // the user clicked the other runs.ai
    const env = dispatch({ cmd: 'ping', args: {}, doc: '/suite/06/runs.ai' });
    expect(ctx.app.activeDocument).toBe(a);
    expect(env.docKey).toBe('/suite/06/runs.ai');
    expect(env.warnings[0]).toMatch(/^Illustrator showed "runs.ai" \(switched since the last call\); went back to "runs.ai"/);
  });
  it('the working document is still in front: nothing changes, no warning', () => {
    const { dispatch, ctx, a } = twoDocs();
    const env = dispatch({ cmd: 'ping', args: {}, doc: '/suite/06/runs.ai' });
    expect(ctx.app.activeDocument).toBe(a);
    expect(env.warnings).toBeUndefined();
  });
  it('the working document was closed: works in the active one and says so', () => {
    const { dispatch, ctx, b } = twoDocs();
    ctx.app.documents = Object.assign([b], { length: 1 }); ctx.app.activeDocument = b;
    const env = dispatch({ cmd: 'ping', args: {}, doc: '/suite/06/runs.ai' });
    expect(ctx.app.activeDocument).toBe(b);
    expect(env.warnings[0]).toMatch(/worked in \(\/suite\/06\/runs\.ai\) is closed; working in the active one/);
  });
  it('an unsaved document is known by its name', () => {
    const { dispatch, ctx, a } = twoDocs();
    const u = { ...a, name: 'Untitled-1', path: { fsName: '' }, fullName: { fsName: 'Untitled-1' } };
    ctx.app.documents = Object.assign([u], { length: 1 }); ctx.app.activeDocument = u;
    expect(dispatch({ cmd: 'ping', args: {} }).docKey).toBe('name:Untitled-1');
  });
});

describe('working document (server)', () => {
  it('remembers the active document after each call and sends it with the next; ping neither sends nor moves it', async () => {
    const sent: string[] = [];
    let key = '/suite/06/runs.ai';
    const T: any = { js: async (src: string) => { sent.push(src); return { ok: true, result: '\u0001' + JSON.stringify({ ok: true, data: {}, doc: 'runs.ai', docKey: key }) }; } };
    const rt = new Runtime(T);
    await rt.cmd('document_info');
    expect(rt.doc).toBe('/suite/06/runs.ai');
    expect(sent[0]).not.toMatch(/"doc":/);
    await rt.cmd('find_items');
    expect(sent[1]).toMatch(/"doc":"\/suite\/06\/runs\.ai"/);
    key = '/suite/09/runs.ai'; // the agent opened another document: it becomes the working one
    await rt.cmd('documents', { action: 'open' });
    expect(rt.doc).toBe('/suite/09/runs.ai');
    await rt.cmd('ping');
    expect(sent[3]).not.toMatch(/"doc":/);
    const env = await rt.cmd('find_items');
    expect(env).not.toHaveProperty('docKey');
  });
});
