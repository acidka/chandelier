// Copy non-TypeScript assets (the JXA bridge and the ExtendScript runtime) into dist/.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['bridge/bridge-mac.js', 'runtime']) {
  rmSync(join(ROOT, 'dist', f), { recursive: true, force: true }); // no stale files (the runtime loads every .jsx in the folder)
  mkdirSync(dirname(join(ROOT, 'dist', f)), { recursive: true });
  cpSync(join(ROOT, 'src', f), join(ROOT, 'dist', f), { recursive: true });
}
