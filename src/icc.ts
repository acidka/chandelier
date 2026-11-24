// ICC profiles for PDF/X output intents (0.4): find installed profiles by name, read their description and colour space.
import { readFileSync, readdirSync, statSync, existsSync, openSync, readSync, closeSync } from 'node:fs';
import { join, basename, extname, resolve } from 'node:path';
import { homedir } from 'node:os';

export interface Icc { path: string; name: string; space: string; cls: string }

/** Description ('desc' v2 ASCII or 'mluc' v4 UTF-16) and header fields of an ICC profile. */
export function iccInfo(buf: Buffer, path = ''): Icc | null {
  if (buf.length < 132 || buf.toString('latin1', 36, 40) !== 'acsp') return null;
  const space = buf.toString('latin1', 16, 20).trim(), cls = buf.toString('latin1', 12, 16);
  let name = '';
  const n = buf.readUInt32BE(128);
  for (let i = 0; i < n && 132 + i * 12 + 12 <= buf.length; i++) {
    const at = 132 + i * 12;
    if (buf.toString('latin1', at, at + 4) !== 'desc') continue;
    const off = buf.readUInt32BE(at + 4);
    if (off + 12 > buf.length) break;
    const type = buf.toString('latin1', off, off + 4);
    if (type === 'desc') { const len = buf.readUInt32BE(off + 8); name = buf.toString('latin1', off + 12, off + 12 + Math.max(0, len - 1)); }
    else if (type === 'mluc' && off + 28 <= buf.length) {
      const len = buf.readUInt32BE(off + 20), o = buf.readUInt32BE(off + 24);
      const s = buf.subarray(off + o, off + o + len);
      for (let k = 0; k + 1 < s.length; k += 2) name += String.fromCharCode(s.readUInt16BE(k));
    }
    break;
  }
  return { path, name: name.replace(/\0+$/, '').trim() || basename(path, extname(path)), space, cls };
}

function head(path: string, n: number): Buffer {
  const fd = openSync(path, 'r');
  try { const b = Buffer.alloc(n); const got = readSync(fd, b, 0, n, 0); return b.subarray(0, got); } finally { closeSync(fd); }
}

export function profileDirs(): string[] {
  if (process.platform === 'win32') {
    // the variables are missing in some contexts (a scheduled task's environment): the standard folders as well
    const drive = process.env.SystemDrive ?? 'C:';
    const pf = [process.env['CommonProgramFiles'], process.env['CommonProgramFiles(x86)'], `${drive}\\Program Files\\Common Files`, `${drive}\\Program Files (x86)\\Common Files`].filter(Boolean) as string[];
    return [...new Set([join(process.env.SystemRoot ?? `${drive}\\Windows`, 'System32', 'spool', 'drivers', 'color'), ...pf.map((p) => join(p, 'Adobe', 'Color', 'Profiles'))])];
  }
  return ['/Library/Application Support/Adobe/Color/Profiles', '/Library/ColorSync/Profiles', join(homedir(), 'Library/ColorSync/Profiles'), '/System/Library/ColorSync/Profiles'];
}

/** Installed profiles of a colour space (default CMYK), from the usual folders and one level of subfolders. */
export function listProfiles(space = 'CMYK', dirs = profileDirs()): Icc[] {
  const out: Icc[] = [], seen = new Set<string>();
  const scan = (d: string, depth: number) => {
    let names: string[];
    try { names = readdirSync(d); } catch { return; }
    for (const f of names) {
      const p = join(d, f);
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) { if (depth < 1 && f !== 'Displays') scan(p, depth + 1); continue; }
      if (!/\.ic[cm]$/i.test(f)) continue;
      try { const i = iccInfo(head(p, 64 * 1024), p); if (i && i.space === space && !seen.has(i.name)) { seen.add(i.name); out.push(i); } } catch { /* unreadable */ }
    }
  };
  for (const d of dirs) scan(d, 0);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** A profile by file path, or by (part of) its name or file name: "FOGRA39", "GRACoL", "Coated FOGRA39 (ISO 12647-2:2004)". */
export function findProfile(q: string, dirs?: string[]): Icc {
  if (/\.ic[cm]$/i.test(q) && existsSync(resolve(q))) {
    const p = resolve(q), i = iccInfo(readFileSync(p), p);
    if (!i) throw new Error(`not an ICC profile: ${p}`);
    return i;
  }
  const all = listProfiles('CMYK', dirs), k = norm(q);
  const hit = all.filter((i) => norm(i.name) === k || norm(basename(i.path, extname(i.path))) === k);
  const part = hit.length ? hit : all.filter((i) => norm(i.name).includes(k) || norm(basename(i.path)).includes(k));
  if (part.length === 1 || (part.length > 1 && hit.length)) return part[0];
  const names = (part.length ? part : all).map((i) => i.name);
  throw new Error(`${part.length ? 'several' : 'no'} CMYK profiles match "${q}"${names.length ? ': ' + names.slice(0, 20).join(' · ') : ' (none installed: give the .icc file path)'}`);
}

/** OutputConditionIdentifier: the registered characterisation when the name shows it (FOGRA39, GRACoL…), else the name. */
export function conditionId(name: string): string {
  const f = /FOGRA\s?(\d+)/i.exec(name);
  if (f) return 'FOGRA' + f[1];
  if (/GRACoL\s?2006/i.test(name)) return 'CGATS TR 006';
  if (/SWOP.*2006.*Grade\s?5/i.test(name)) return 'CGATS TR 005';
  if (/SWOP.*2006.*Grade\s?3/i.test(name)) return 'CGATS TR 003';
  return name;
}
