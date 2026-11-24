#!/usr/bin/env node
// Install the Chandelier panel (CEP extension, unsigned) for development — phase 8 panel MVP.
//   node scripts/cep/install.mjs            copy dist/cep into Illustrator's CEP extensions folder
//   node scripts/cep/install.mjs --link     symlink instead (edits in dist/cep apply after "npm run build" + reopening the panel)
//   node scripts/cep/install.mjs --uninstall
// Unsigned extensions load only with PlayerDebugMode=1 for the CEP version Illustrator uses (CSXS.9 … CSXS.14 are set;
// Illustrator 2025 uses CEP 12). The setting is per user; --uninstall leaves it and prints how to undo it.
// Then restart Illustrator and open Window > Extensions > Chandelier.
import { cpSync, rmSync, symlinkSync, existsSync, mkdirSync, lstatSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'dist', 'cep');
const ID = 'io.github.acidka.chandelier';
const WIN = process.platform === 'win32';
const EXT_DIR = WIN
  ? join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Adobe', 'CEP', 'extensions')
  : join(homedir(), 'Library', 'Application Support', 'Adobe', 'CEP', 'extensions');
const TARGET = join(EXT_DIR, ID);
const CSXS = [9, 10, 11, 12, 13, 14];
const args = new Set(process.argv.slice(2));

function removeTarget() {
  try { lstatSync(TARGET); } catch { return false; }
  rmSync(TARGET, { recursive: true, force: true });
  return true;
}

if (args.has('--uninstall')) {
  console.log(removeTarget() ? `Removed ${TARGET}` : `Not installed (${TARGET})`);
  console.log(WIN
    ? 'PlayerDebugMode left on. To turn it off: reg delete HKCU\\Software\\Adobe\\CSXS.<N> /v PlayerDebugMode /f'
    : 'PlayerDebugMode left on. To turn it off: defaults delete com.adobe.CSXS.<N> PlayerDebugMode  (N = 9 … 14)');
  process.exit(0);
}

if (!existsSync(join(SRC, 'CSXS', 'manifest.xml'))) {
  console.error('dist/cep is missing: run "npm run build" first.');
  process.exit(1);
}
mkdirSync(EXT_DIR, { recursive: true });
removeTarget();
if (args.has('--link')) symlinkSync(SRC, TARGET, WIN ? 'junction' : 'dir');
else cpSync(SRC, TARGET, { recursive: true });
console.log(`${args.has('--link') ? 'Linked' : 'Copied'} the panel to ${TARGET}`);

for (const n of CSXS) {
  if (WIN) execFileSync('reg', ['add', `HKCU\\Software\\Adobe\\CSXS.${n}`, '/v', 'PlayerDebugMode', '/t', 'REG_SZ', '/d', '1', '/f'], { stdio: 'ignore' });
  else execFileSync('defaults', ['write', `com.adobe.CSXS.${n}`, 'PlayerDebugMode', '1']);
}
console.log(`PlayerDebugMode=1 for CSXS.${CSXS[0]}…${CSXS[CSXS.length - 1]} (unsigned extensions allowed).`);
console.log('Next: restart Illustrator, open Window > Extensions > Chandelier, and start the server with CHANDELIER_TRANSPORT=panel.');
