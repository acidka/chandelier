// Copy non-TypeScript assets (the JXA and PowerShell bridges, the ExtendScript runtime, the recipes, the CEP panel) into dist/.
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['bridge/bridge-mac.js', 'bridge/bridge-win.ps1', 'runtime', 'recipes', 'cep']) {
  rmSync(join(ROOT, 'dist', f), { recursive: true, force: true }); // no stale files (the runtime loads every .jsx in the folder)
  mkdirSync(dirname(join(ROOT, 'dist', f)), { recursive: true });
  cpSync(join(ROOT, 'src', f), join(ROOT, 'dist', f), { recursive: true });
}
// the panel shows which server version it belongs to
writeFileSync(join(ROOT, 'dist/cep/version.json'), JSON.stringify({ version: JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version }) + '\n');
