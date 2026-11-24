// Data for data_merge (0.3): CSV / TSV / JSON rows → [{field: string}], and {field} patterns for names and paths.
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

export type Row = Record<string, string>;

/** RFC 4180 CSV: quotes, "" escapes, newlines inside quotes, CRLF, BOM; delimiter auto-detected (, ; tab). */
export function parseCsv(src: string, delim?: string): Row[] {
  let s = src.replace(/^﻿/, '');
  if (!delim) {
    const first = s.split(/\r?\n/, 1)[0] ?? '';
    const count = (d: string) => first.split(d).length - 1;
    delim = ['\t', ';', ','].reduce((best, d) => (count(d) > count(best) ? d : best), ',');
  }
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false, i = 0;
  while (i < s.length) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i += 2; continue; } q = false; i++; continue; }
      cell += c; i++; continue;
    }
    if (c === '"' && cell === '') { q = true; i++; continue; }
    if (c === delim) { row.push(cell); cell = ''; i++; continue; }
    if (c === '\r' || c === '\n') {
      row.push(cell); cell = ''; rows.push(row); row = [];
      i += c === '\r' && s[i + 1] === '\n' ? 2 : 1; continue;
    }
    cell += c; i++;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const data = rows.filter((r) => r.some((x) => x.trim() !== ''));
  if (!data.length) return [];
  const head = data[0].map((h) => h.trim());
  head.forEach((h, k) => { if (!h) head[k] = `column${k + 1}`; });
  return data.slice(1).map((r) => Object.fromEntries(head.map((h, k) => [h, r[k] ?? ''])));
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** Rows from inline objects (values become strings). */
export function normRows(rows: Record<string, unknown>[]): Row[] {
  return rows.map((r, i) => {
    if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error(`row ${i + 1} is not an object`);
    return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, str(v)]));
  });
}

/** .csv / .tsv / .txt → CSV; .json → an array of objects or {rows: [...]}. */
export function readRows(path: string): Row[] {
  const src = readFileSync(path, 'utf8');
  const ext = extname(path).toLowerCase();
  if (ext === '.json') {
    const v = JSON.parse(src);
    const arr = Array.isArray(v) ? v : v?.rows ?? v?.data;
    if (!Array.isArray(arr)) throw new Error('JSON data must be an array of objects, or {rows: [...]}');
    return normRows(arr);
  }
  return parseCsv(src, ext === '.tsv' ? '\t' : undefined);
}

/** Fields named in "{field}" / "{{field}}" tokens. */
export function patternFields(p: string): string[] {
  return [...p.matchAll(/\{\{?\s*([^{}]+?)\s*\}?\}/g)].map((m) => m[1]);
}

/** Fill "{field}" / "{{field}}" tokens; {n} = 1-based row number; values passed through `clean` (e.g. file-name safe). */
export function fillPattern(p: string, row: Row, n: number, clean: (s: string) => string = (s) => s): string {
  return p.replace(/\{\{?\s*([^{}]+?)\s*\}?\}/g, (m, f: string) => {
    if (f === 'n') return String(n);
    return f in row ? clean(row[f]) : m;
  });
}

export const fileSafe = (s: string): string => s.replace(/[\/\\:*?"<>|\r\n\t]+/g, '_').trim().slice(0, 120) || '_';
