import { z } from 'zod';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { ToolDef } from './types.js';
import { text, fail, J, ArgError } from './types.js';
import { clip } from './respond.js';
import { asset } from '../paths.js';

export const HELPERS = `Helpers (global AIA, always loaded; positions/sizes in session units, origin per configure — default pt, artboard top-left, y down):
  AIA.layer(name) → get/create layer and make it active (new items go to the active layer) · AIA.fresh(name): same, emptied first (re-runnable builders)
  AIA.group(name, parent?) → new GroupItem (parent = a Layer or GroupItem object)
  AIA.swatch(name, color) → global process swatch (create/update); then use colour "swatch:Name"
  AIA.pstyle(name, {font,size,color,leading,tracking,hscale,align}) → paragraph style (create/update)
  AIA.text(str, {x,y,font,size,color,align,style,leading,tracking,hscale,name,parent}) → point text; y = BASELINE; "\\n" = new line; align left|center|right (anchor at x)
  Options always come LAST as an object (parent goes there).
  AIA.rect(x,y,w,h,{fill,stroke,sw,name,parent}) · AIA.ellipse(x,y,w,h,{…}) · AIA.line(x1,y1,x2,y2,{stroke,sw,cap:"butt|round|square",dash,name,parent}) · AIA.path([[x,y],…],{closed,fill,stroke,…})
  AIA.font(name) → TextFont, fuzzy ("Arial Bold" → Arial-BoldMT) · AIA.box(item) → [x,y,w,h] · AIA.mm(v) → pt · AIA.doc() → active Document · AIA.find(name)
  AIA.refs(ref) → items for a uuid / "selection" / "name:X*" / "layer:X" / "artboard:N" · AIA.color(spec) → Color · AIA.colorStr(color) → spec
  AIA.at(k, fn) → run fn with coordinates from artboard k's top-left (multi-artboard builders)
  AIA.P(x,y) → document coordinates [x, y-up] for raw API calls · AIA.u(v) session units → pt · AIA.warn(msg)
Type sizes and stroke widths are pt. "gray(60)" = K60 in CMYK documents.`;

// Recipes (0.2.1): ready builders shipped in dist/recipes/<name>.jsx; the first two comment lines name and describe them.
const RECIPES = asset('recipes');
export function recipeList(): { name: string; does: string; args: string }[] {
  if (!existsSync(RECIPES)) return [];
  return readdirSync(RECIPES).filter((f) => f.endsWith('.jsx')).sort().map((f) => {
    const [l1 = '', l2 = ''] = readFileSync(join(RECIPES, f), 'utf8').split('\n');
    return { name: f.slice(0, -4), does: l1.replace(/^\/\/ recipe: [\w-]+ - /, ''), args: l2.replace(/^\/\/ args: /, '') };
  });
}

/** run_script {recipe: "help"}: every AIA.* helper with its arguments, the option keys its body reads and the comment
 * above it — read from the runtime itself, so it never goes stale (token use: a calendar builder read core.jsx through
 * the shell to learn AIA.text and AIA.pstyle options). */
export function helperReference(): string {
  const dir = asset('runtime'), out: string[] = [];
  const files = readdirSync(dir).filter((x) => x.endsWith('.jsx')).sort().map((f) => readFileSync(join(dir, f), 'utf8').split('\n'));
  // a function's body: from its line to the closing brace at its own indent
  const body = (lines: string[], i: number) => { const ind = lines[i].match(/^ */)![0].length, b: string[] = []; for (let k = i; k < lines.length; k++) { b.push(lines[k]); if (k > i && new RegExp(`^ {${ind}}\\};?\\s*$`).test(lines[k])) break; } return b; };
  // every function that takes options (o, opts, a): name → its body and the name of that argument
  const fns = new Map<string, { body: string[]; arg: string }>();
  for (const lines of files) lines.forEach((l, i) => {
    const m = l.match(/^\s*(?:function (\w+)|A\.(\w+) = function|var (\w+) = function)\s*\(([^)]*)\)/);
    if (!m) return;
    const arg = m[4].split(',').map((x) => x.trim()).find((x) => /^(o|opts|a|s)$/.test(x));
    if (arg) fns.set(m[1] ?? m[2] ?? m[3], { body: body(lines, i), arg });
  });
  // option keys a function reads, following the options object into the functions it is passed to
  const keysOf = (name: string, seen = new Set<string>()): Set<string> => {
    const f = fns.get(name), keys = new Set<string>();
    if (!f || seen.has(name)) return keys;
    seen.add(name);
    for (const l of f.body) {
      for (const km of l.matchAll(new RegExp(`\\b${f.arg}\\.([a-z_]\\w*)`, 'g'))) keys.add(km[1]);
      for (const cm of l.matchAll(new RegExp(`\\b(?:A\\.)?(\\w+)\\(([^()]*\\b${f.arg}\\b[^()]*)\\)`, 'g'))) if (cm[1] !== name) for (const k of keysOf(cm[1], seen)) keys.add(k);
    }
    return keys;
  };
  for (const lines of files) lines.forEach((l, i) => {
    const m = l.match(/^ {2}A\.([a-zA-Z]\w*) = function \(([^)]*)\)/);
    if (!m) return;
    const doc: string[] = [];
    for (let k = i - 1; k >= 0 && /^\s*\/\//.test(lines[k]); k--) doc.unshift(lines[k].replace(/^\s*\/\/\s?/, ''));
    const keys = keysOf(m[1]);
    out.push(`AIA.${m[1]}(${m[2]})${keys.size ? ` {${[...keys].join(', ')}}` : ''}${doc.length ? ' — ' + doc.join(' ') : ''}`);
  });
  return out.join('\n');
}

function codeOf(a: { code?: string; file?: string; recipe?: string }): string {
  let body = a.code;
  if (a.file) body = readFileSync(resolve(a.file), 'utf8').replace(/^\ufeff/, '');
  if (a.recipe) {
    const file = join(RECIPES, a.recipe + '.jsx');
    if (!/^[a-z0-9-]+$/.test(a.recipe) || !existsSync(file)) throw new ArgError(`No recipe "${a.recipe}". Recipes: ${recipeList().map((r) => r.name).join(', ')} (recipe:"list" shows their args).`);
    body = readFileSync(file, 'utf8');
  }
  if (!body) throw new ArgError('give code, file or recipe');
  return body;
}

export const run_script: ToolDef = {
  name: 'run_script',
  description: `Run ExtendScript in Illustrator on the active document in ONE call: a whole design in one script, details in small ones.
Give "code" (a function BODY: use \`return\` to get a value back as JSON; Illustrator objects come back as {type, uuid, name, box}) or "file" (a UTF-8 .jsx file with the same body; "args" are arguments[0..]). Non-ASCII text is safe in both.
ExtendScript is ES3: var only, no let/const/arrow functions/template strings, no Array.indexOf/map/forEach, no JSON object (use AIA.json / AIA.parse).
Errors return the message and the line number in your code. retries:n re-runs on MRAP or a "RETRY" result.
recipe: a built-in builder instead of code, options in args[0] (recipe:"list" names them; "help": every AIA helper with its options).
${HELPERS}`,
  shape: {
    code: z.string().optional(), file: z.string().optional(), recipe: z.string().optional(),
    args: z.array(z.any()).optional(), timeout: z.number().optional().describe('seconds, default from configure (300)'),
    retries: z.number().min(0).max(5).optional(),
  },
  step: (a) => ({ cmd: 'script', args: { code: codeOf(a), args: a.args ?? [] } }),
  async run(a, { rt }) {
    if (a.recipe === 'help') return text('AIA helpers (the runtime\'s own list; positions in session units, options last as an object):\n' + helperReference());
    if (a.recipe === 'list') return text(J({ recipes: recipeList(), how: 'run_script {recipe: name, args: [{...options}]} - positions and sizes in session units, type sizes in pt' }));
    const body = codeOf(a);
    const t = performance.now();
    // builders retry on Illustrator's transient MRAP error (B3) or when they return "RETRY" (e.g. after closing
    // an open copy of their output file) — what the owner's run.sh did around osascript
    let r = await rt.script(body, a.args ?? [], a.timeout), attempts = 1;
    while (attempts <= (a.retries ?? 0) && (r.ok ? r.data === 'RETRY' : /MRAP|1346458189/.test(r.error ?? ''))) {
      await new Promise((res) => setTimeout(res, 500 * attempts));
      r = await rt.script(body, a.args ?? [], a.timeout);
      attempts++;
    }
    const ms = Math.round(performance.now() - t);
    const extra = attempts > 1 ? { attempts } : {};
    if (!r.ok) return fail(J({ error: r.error, line: r.line, where: r.where, doc: r.doc, warnings: r.warnings, ms, ...extra }));
    return text(clip(J({ result: r.data, doc: r.doc, warnings: r.warnings, ms, ...extra })));
  },
};
