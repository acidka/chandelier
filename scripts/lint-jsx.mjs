#!/usr/bin/env node
// ES3 lint for ExtendScript files (Illustrator's engine is ES3 + a few extensions).
//   node scripts/lint-jsx.mjs [files...]   (default: src/runtime, src/recipes and src/cep/host *.jsx)
// Checks: reserved words as property names; parses as ES3 (no let/const/arrows/template strings/trailing commas…), no ES5+ library calls
// (Array#map/forEach/filter/indexOf…, JSON, Object.keys, String#trim), and nested ?: must be bracketed (quirk B9).
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'acorn';

const FORBIDDEN = [
  [/\.(forEach|map|filter|reduce|reduceRight|some|every|find|findIndex|includes)\s*\(/, 'ES5+ array method'],
  [/\bJSON\s*\./, 'no JSON object in ExtendScript (use AIA.json / AIA.parse)'],
  [/\bObject\.(keys|create|defineProperty|assign|entries|values)\b/, 'ES5+ Object method'],
  [/\bArray\.isArray\b/, 'ES5 Array.isArray (use instanceof Array)'],
  [/\.trim\s*\(\s*\)/, 'ES5 String#trim'],
  [/\.(startsWith|endsWith|padStart|padEnd|repeat)\s*\(/, 'ES2015 String method'],
];
// ES3 forbids reserved words as unquoted property names ({in: 1}, o.default); acorn doesn't check this.
const RESERVED = new Set(('break case catch continue default delete do else finally for function if in instanceof new return switch this throw try typeof var void while with ' +
  'abstract boolean byte char class const debugger double enum export extends final float goto implements import int interface long native package private protected public short static super synchronized throws transient volatile null true false').split(' '));
// Every ExtendScript object has these built-in members, so `if (opts.reflect)` is always true (quirk C13).
const BUILTIN_MEMBERS = /\.(reflect|watch|unwatch|toSource)\b(?!\s*\()/;
// Array#indexOf can't be told apart from String#indexOf statically: we only flag obvious array literals.
const ARRAY_INDEXOF = /\]\s*\.indexOf\s*\(/;

function walk(node, visit, parent) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => walk(c, visit, node));
    else if (v && typeof v.type === 'string') walk(v, visit, node);
  }
}

export function lint(src, file = '<input>') {
  const problems = [];
  let ast;
  try {
    ast = parse(src, { ecmaVersion: 3, allowReserved: false, preserveParens: true, locations: true, allowReturnOutsideFunction: true });
  } catch (e) {
    return [{ file, line: e.loc?.line, msg: 'not ES3: ' + e.message }];
  }
  const lines = src.split('\n');
  lines.forEach((l, i) => {
    if (/[^\x00-\x7e]/.test(l)) problems.push({ file, line: i + 1, msg: 'non-ASCII character: write it as \\uXXXX (runtime files stay ASCII)' });
    const code = l.replace(/\/\/.*$/, '').replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, '""');
    for (const [re, msg] of FORBIDDEN) if (re.test(code)) problems.push({ file, line: i + 1, msg });
    if (ARRAY_INDEXOF.test(code)) problems.push({ file, line: i + 1, msg: 'Array#indexOf is ES5' });
    if (BUILTIN_MEMBERS.test(code)) problems.push({ file, line: i + 1, msg: 'ExtendScript objects have built-in .reflect/.watch/.toSource: use another option name (C13)' });
  });
  walk(ast, (n) => {
    if (n.type === 'Property' && n.key.type === 'Identifier' && RESERVED.has(n.key.name)) problems.push({ file, line: n.key.loc.start.line, msg: `reserved word "${n.key.name}" as a property name: quote it` });
    if (n.type === 'MemberExpression' && !n.computed && RESERVED.has(n.property.name)) problems.push({ file, line: n.property.loc.start.line, msg: `reserved word "${n.property.name}" after a dot: use ["${n.property.name}"]` });
    if (n.type !== 'ConditionalExpression') return;
    for (const part of [n.consequent, n.alternate]) {
      if (part.type === 'ConditionalExpression') problems.push({ file, line: part.loc.start.line, msg: 'nested ?: must be in brackets (quirk B9)' });
    }
  });
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2);
  if (!files.length) for (const dir of ['src/runtime', 'src/recipes', 'src/cep/host']) for (const f of readdirSync(dir).sort()) if (f.endsWith('.jsx')) files.push(dir + '/' + f);
  let bad = 0;
  for (const f of files) for (const p of lint(readFileSync(f, 'utf8'), f)) { bad++; console.log(`${p.file}:${p.line ?? '?'}  ${p.msg}`); }
  if (bad) { console.log(`${bad} problem(s)`); process.exit(1); }
  console.log(`ES3 lint: ${files.length} file(s) ok`);
}
