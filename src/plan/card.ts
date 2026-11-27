// Plan-then-run: the plan store and the plan card the designer approves (docs/research/plan-then-run-plan.md § 3.3).
import { createHash } from 'node:crypto';

/** One step as the agent wrote it (tool + validated args). */
export interface Spec { tool: string; args: Record<string, any>; artboard?: number }

/** What the runtime's plan_probe says about one step (src/runtime/plan.jsx). */
export interface Probe {
  step: number; cmd: string; read?: boolean; fresh?: boolean; opaque?: boolean; selection?: number; error?: string;
  count?: number; layers?: [string, number][]; from_steps?: number[]; unresolved?: string[]; texts?: [string, string][]; layer?: string; uuids?: string[];
}

export interface Fingerprint { h: string; doc: string | null; path?: string | null; open?: string; items?: number; layers?: string; [k: string]: unknown }

export interface FileOut { step: number; what: 'save' | 'close' | 'export'; path?: string; format?: string; exists?: boolean; note?: string }

export type Status = 'pending' | 'approved' | 'rejected' | 'run' | 'failed' | 'expired';
export type Channel = 'panel' | 'elicitation' | 'chat';

export interface PlanRecord {
  id: string;
  kind: 'doc' | 'files';
  specs: Spec[];
  /** index of the first save / close / export step (= specs.length when none) */
  fileFrom: number;
  probe: Probe[];
  fp: Fingerprint;
  files: FileOut[];
  card: string;
  created: number;
  expires: number;
  status: Status;
  channel: Channel;
  decision?: { at: number; by: Channel; note?: string };
  /** multi-file jobs: the batch arguments and each file's state at plan time */
  job?: { args: Record<string, any>; files: { path: string; mtime: number; size: number }[] };
  /** n-th plan of this session (agents should send one plan per job) */
  seq: number;
}

export const TTL_MS = 30 * 60_000;

export class PlanStore {
  private plans = new Map<string, PlanRecord>();
  private count = 0;
  constructor(private readonly max = 20) {}

  next(): number { return ++this.count; }

  add(p: PlanRecord): PlanRecord {
    this.plans.delete(p.id);
    this.plans.set(p.id, p);
    // the oldest open plans expire first
    const open = [...this.plans.values()].filter((x) => x.status === 'pending' || x.status === 'approved');
    for (const x of open.slice(0, Math.max(0, open.length - this.max))) x.status = 'expired';
    return p;
  }

  get(id: string, now = Date.now()): PlanRecord | undefined {
    const p = this.plans.get(id);
    if (p && (p.status === 'pending' || p.status === 'approved') && now > p.expires) p.status = 'expired';
    return p;
  }

  /** Plans lose their meaning when uuids change (restart, reopen): expire every open one. */
  expireAll(): void { for (const p of this.plans.values()) if (p.status === 'pending' || p.status === 'approved') p.status = 'expired'; }
}

/** Canonical JSON (sorted keys), so the id doesn't depend on key order. */
export function canon(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v as object).sort().filter((k) => (v as any)[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canon((v as any)[k])).join(',') + '}';
  return JSON.stringify(v);
}

export function planId(specs: Spec[], fp: string, files: FileOut[]): string {
  return createHash('sha256').update(canon({ specs, fp, files })).digest('hex').slice(0, 8);
}

// -- the card ----------------------------------------------------------------------------------------------------------

const q = (s: unknown) => JSON.stringify(String(s));
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const cut = (s: string, n = 48) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const NOUN: Record<string, string> = { create_shape: 'shape', create_path: 'path', create_text: 'text' };

function where(p: Probe): string {
  const parts: string[] = [];
  if (p.layers?.length) parts.push('on ' + (p.layers.length === 1 ? `layer ${q(p.layers[0][0])}` : 'layers ' + p.layers.map(([n, c]) => `${q(n)} (${c})`).join(', ')));
  if (p.from_steps?.length) parts.push(`+ the items of step ${p.from_steps.join(', ')}`);
  return parts.length ? ' ' + parts.join(' ') : '';
}

function count(p: Probe): string {
  if (p.count !== undefined) return plural(p.count, 'item');
  if (p.from_steps?.length) return `the items of step ${p.from_steps.join(', ')}`;
  return 'items';
}

function argKeys(a: Record<string, any>): string {
  const k = Object.keys(a).filter((x) => !['refs', 'items', 'action', 'name', 'names'].includes(x));
  return k.length ? ` (${cut(k.join(', '), 60)})` : '';
}

/** One line (verb + what) per changing step; read steps give none. */
export function describe(s: Spec, p: Probe | undefined, session: { units: string }): [string, string][] {
  const a = s.args ?? {}, act = a.action, P = p ?? ({ step: 0, cmd: s.tool } as Probe);
  if (P.read) return [];
  const on = where(P);
  switch (s.tool) {
    case 'documents':
      if (act === 'new') return [['New', `document ${a.width ?? '?'} × ${a.height ?? '?'} ${a.units ?? session.units}, ${plural(a.artboards ?? 1, 'artboard')}${a.title ? ' ' + q(a.title) : ''}`]];
      return [];
    case 'create_shape': case 'create_path': case 'create_text': {
      const n = Array.isArray(a.items) ? a.items.length : 1;
      const what = a.grid ? `a grid of ${NOUN[s.tool]}s` : plural(n, NOUN[s.tool]);
      const txt = s.tool === 'create_text' && !a.items && typeof a.text === 'string' ? ' ' + q(cut(a.text, 40)) : '';
      return [['Create', `${what}${txt}${P.layer ? ` on layer ${q(P.layer)}` : ''}`]];
    }
    case 'place': return [['Place', `${q(a.path ?? a.file ?? '?')}${P.layer ? ` on layer ${q(P.layer)}` : ''}`]];
    case 'edit_text': {
      const after = typeof a.contents === 'string' ? q(cut(a.contents)) : a.replace ? `replace ${q(a.replace.find)} → ${q(a.replace.with ?? '')}` : 'text attributes' + argKeys(a);
      const t = P.texts ?? [];
      if (!t.length) return [['Text', `${count(P)}${on}: ${after}`]];
      const lines: [string, string][] = t.map(([name, before]) => ['Text', `${name ? q(name) + ': ' : ''}${q(before)} → ${after}`]);
      if ((P.count ?? 0) > t.length) lines.push(['', `+ ${P.count! - t.length} more`]);
      return lines;
    }
    case 'delete_items': return [['Delete', `${count(P)}${on}`]];
    case 'swatches': {
      if (act === 'recolor') return [['Recolour', `${count(P)}${on} → ${a.to ? a.to.map((x: string) => q(x)).join(', ') : a.map ? plural(Object.keys(a.map).length, 'mapping') : '?'}`]];
      if (act === 'convert') return [['Convert', `${count(P)}${on} to ${a.mode ?? '?'}`]];
      if (act === 'import') return [['Swatches', `import ${q(a.path ?? '?')}`]];
      return [['Swatch', `${act} ${a.name ? q(a.name) : a.names ? a.names.map(q).join(', ') : ''}${a.color ? ' = ' + a.color : ''}`.trim()]];
    }
    case 'styles': return [['Style', `${act} ${a.name ? q(a.name) : ''}${act === 'apply' ? ` to ${count(P)}${on}` : ''}`.trim()]];
    case 'layers': return [['Layer', `${act} ${a.name ? q(a.name) : ''}${a.new_name ? ' → ' + q(a.new_name) : ''}`.trim()]];
    case 'artboards': return [['Artboard', `${act}${a.name ? ' ' + q(a.name) : ''}${a.index !== undefined ? ' #' + a.index : ''}`]];
    case 'symbols': return [['Symbol', `${act}${a.name ? ' ' + q(a.name) : ''}${P.count !== undefined ? ` (${count(P)}${on})` : ''}`]];
    case 'effects': return [['Effect', `${a.type ?? act ?? ''} on ${count(P)}${on}`.trim()]];
    case 'history': return [['Redo', plural(a.count ?? 1, 'step')]];
    case 'duplicate_items': return [['Duplicate', `${count(P)}${on}${a.to_artboards ? ' to artboards ' + J2(a.to_artboards) : ''}`]];
    default: return [['Change', `${count(P)}${on} — ${s.tool.replace(/_items$/, '').replace(/_/g, ' ')}${act ? ' ' + act : ''}${argKeys(a)}`]];
  }
}
const J2 = (v: unknown) => JSON.stringify(v);

/** Steps whose effect can't be known before they run, or whose refs don't resolve now. */
export function warnings(specs: Spec[], probe: Probe[]): string[] {
  const out: string[] = [];
  for (const p of probe) {
    const s = specs[p.step];
    if (p.opaque) out.push(`step ${p.step} ${s.tool}: ${s.tool === 'menu_command' ? `menu command ${q(s.args.command ?? '?')} on the selection (${plural(p.selection ?? 0, 'item')})` : `script ${s.args.file ? q(s.args.file) : `(${plural(String(s.args.code ?? '').length, 'char')})`}${s.args.recipe ? ' recipe ' + q(s.args.recipe) : ''}`}: effect unknown until it runs`);
    if (p.unresolved?.length) out.push(`step ${p.step} ${s.tool}: ${p.unresolved.map(q).join(', ')} not found now (made by an earlier step? use "@n")`);
    if (p.error) out.push(`step ${p.step} ${s.tool}: ${p.error}`);
  }
  return out;
}

export interface CardInput {
  id: string; seq: number; specs: Spec[]; probe: Probe[]; fp: Fingerprint; files: FileOut[]; channel: Channel;
  layers?: string[]; units: string; rehearsed?: string;
}

export function renderCard(c: CardInput): string {
  const changes = c.specs.flatMap((s, i) => (i < c.probe.length ? describe(s, c.probe[i], { units: c.units }) : []));
  const where = c.fp.doc ? `${q(c.fp.doc)}${c.fp.path ? ` (${c.fp.path})` : ' (not saved yet)'}` : 'a new document';
  const head = `Plan ${c.id} · ${where} · ${plural(c.probe.filter((p) => !p.read).length, 'step')}${c.files.length ? ` + ${plural(c.files.length, 'file step')}` : ''}${c.seq > 1 ? ` · plan ${c.seq} of this session` : ''}`;
  const lines = [head];
  for (const w of warnings(c.specs, c.probe)) lines.push('  ! ' + w);
  for (const [verb, what] of changes) lines.push(`  ${verb.padEnd(9)}${what}`);
  for (const f of c.files) {
    if (f.what === 'close') lines.push(`  ${'Close'.padEnd(9)}${f.note ?? 'the document'}`);
    else lines.push(`  ${(f.what === 'save' ? 'Save' : 'Write').padEnd(9)}${f.path ?? '?'}${f.format ? ` (${f.format})` : ''}${f.note ? ' ' + f.note : ''} — ${f.exists ? 'OVERWRITES an existing file' : 'new file'}`);
  }
  if (!changes.length && !c.files.length) lines.push('  (nothing changes)');
  const touched = new Set<string>();
  for (const p of c.probe) { for (const [n] of p.layers ?? []) touched.add(n); if (p.layer) touched.add(p.layer); }
  const rest = (c.layers ?? []).filter((n) => !touched.has(n));
  if (c.fp.doc && rest.length) lines.push(`  Untouched: ${plural(rest.length, 'other layer')} (${cut(rest.map(q).join(', '), 70)})${c.fp.path ? ', the file on disk until a Save step' : ''}`);
  if (c.rehearsed) lines.push(`  Rehearsed: ${c.rehearsed}`);
  lines.push(c.fp.doc ? '  Undo:    one step (Edit > Undo or history undo); written files stay' : '  If a step fails, the new document is closed without saving');
  lines.push(c.channel === 'panel' ? '  → Approve or reject in the Chandelier panel in Illustrator'
    : c.channel === 'elicitation' ? '  → Approve or reject in the dialog'
      : '  → Show this card to the designer and wait for their answer');
  const MAX = 40;
  return lines.length > MAX ? [...lines.slice(0, MAX - 1), `  … ${lines.length - MAX + 1} more lines`].join('\n') : lines.join('\n');
}
