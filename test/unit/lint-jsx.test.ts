import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
// @ts-expect-error plain JS module
import { lint } from '../../scripts/lint-jsx.mjs';

describe('ES3 lint', () => {
  it('passes the runtime', () => {
    for (const f of readdirSync('src/runtime')) if (f.endsWith('.jsx')) expect(lint(readFileSync('src/runtime/' + f, 'utf8'), f)).toEqual([]);
  });
  it.each([
    ['let x = 1;', 'not ES3'],
    ['var f = (a) => a;', 'not ES3'],
    ['var o = {a: 1,};', 'not ES3'],
    ['var s = `t`;', 'not ES3'],
    ['[1,2].forEach(function(){});', 'ES5+ array method'],
    ['var o = JSON.parse("1");', 'no JSON'],
    ['var k = Object.keys({});', 'ES5+ Object'],
    ['var s = " a ".trim();', 'trim'],
    ['var v = a ? 1 : b ? 2 : 3;', 'nested ?:'],
    ['var o = {in: 1};', 'reserved word "in"'],
    ['var x = o.default;', 'reserved word "default"'],
    ['if (o.reflect) f();', 'built-in .reflect'],
    ['var s = "Слой";', 'non-ASCII'],
  ])('flags %s', (src, msg) => {
    const p = lint(src);
    expect(p.length).toBeGreaterThan(0);
    expect(p.map((x: { msg: string }) => x.msg).join(' ')).toContain(msg);
  });
  it('allows bracketed nested ?: and String#indexOf', () => {
    expect(lint('var v = a ? 1 : (b ? 2 : 3); var i = "abc".indexOf("b"); var o = {"in": 1}; var y = o["in"];')).toEqual([]);
  });
});
