// npx chandelier-mcp install-panel [--uninstall] [--link] [--debug] — install the Chandelier panel (CEP, unsigned)
// into Illustrator's per-user extensions folder. Phase 8, docs/panel-plan.md.
// Unsigned extensions load only with PlayerDebugMode=1 for the CEP version Illustrator uses (CSXS.9 … CSXS.14 are set;
// Illustrator 2025 (29.x) uses CEP 11, 2026+ CEP 12). The setting is per user; --uninstall leaves it and says how to undo it.
// Copies by default (the npx cache is temporary); --link symlinks dist/cep instead (development: edits apply after
// "npm run build" + reopening the panel); --debug adds the panel's .debug file (Chrome DevTools on :8098).
import { cpSync, rmSync, symlinkSync, existsSync, mkdirSync, lstatSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PANEL_ID = 'io.github.acidka.chandelier';
export const DEBUG_PORT = 8098;
const CSXS = [9, 10, 11, 12, 13, 14];
const FLAGS = ['--uninstall', '--link', '--debug'];
const USAGE = `Usage: npx chandelier-mcp install-panel [--uninstall] [--link] [--debug]
  (no flag)    copy the Chandelier panel into Illustrator's extensions folder and allow unsigned panels (PlayerDebugMode)
  --uninstall  remove the panel (PlayerDebugMode stays; the message says how to turn it off)
  --link       symlink instead of copying (development: a checkout's dist/cep)
  --debug      add the panel's .debug file: Chrome DevTools on http://localhost:${DEBUG_PORT}`;

export interface InstallOptions {
  args: string[];
  /** the built panel (default: dist/cep next to this file) */
  src?: string;
  platform?: NodeJS.Platform;
  home?: string;
  appData?: string;
  /** runs `defaults write` / `reg add` (tests pass a recorder) */
  exec?: (cmd: string, args: string[]) => void;
  log?: (line: string) => void;
}

export function extensionsDir(platform: NodeJS.Platform = process.platform, home = homedir(), appData = process.env.APPDATA): string {
  return platform === 'win32'
    ? join(appData ?? join(home, 'AppData', 'Roaming'), 'Adobe', 'CEP', 'extensions')
    : join(home, 'Library', 'Application Support', 'Adobe', 'CEP', 'extensions');
}

/** Returns the exit code. */
export function installPanel(o: InstallOptions): number {
  const args = new Set(o.args);
  const platform = o.platform ?? process.platform;
  const win = platform === 'win32';
  const log = o.log ?? ((l: string) => console.log(l));
  const exec = o.exec ?? ((cmd: string, a: string[]) => { execFileSync(cmd, a, { stdio: 'ignore' }); });
  const src = o.src ?? join(dirname(fileURLToPath(import.meta.url)), 'cep');
  const dir = extensionsDir(platform, o.home ?? homedir(), o.appData ?? process.env.APPDATA);
  const target = join(dir, PANEL_ID);
  const remove = () => { try { lstatSync(target); } catch { return false; } rmSync(target, { recursive: true, force: true }); return true; };

  // --help, or anything unknown: say how, change nothing (seen 2026-11-24: "--help" installed the panel)
  const unknown = [...args].filter((x) => !FLAGS.includes(x));
  if (unknown.length) {
    if (!(unknown.length === 1 && (unknown[0] === '--help' || unknown[0] === '-h'))) log(`Unknown option: ${unknown.join(' ')}`);
    log(USAGE);
    return unknown.every((x) => x === '--help' || x === '-h') ? 0 : 1;
  }
  if (args.has('--uninstall')) {
    log(remove() ? `Removed ${target}` : `Not installed (${target})`);
    log(win
      ? 'PlayerDebugMode left on. To turn it off: reg delete HKCU\\Software\\Adobe\\CSXS.<N> /v PlayerDebugMode /f  (N = 9 … 14)'
      : 'PlayerDebugMode left on. To turn it off: defaults delete com.adobe.CSXS.<N> PlayerDebugMode  (N = 9 … 14)');
    return 0;
  }
  if (!existsSync(join(src, 'CSXS', 'manifest.xml'))) {
    log(`The panel files are missing (${src}): run "npm run build" first.`);
    return 1;
  }
  mkdirSync(dir, { recursive: true });
  remove();
  if (args.has('--link')) symlinkSync(src, target, win ? 'junction' : 'dir');
  else cpSync(src, target, { recursive: true, filter: (f) => !f.endsWith('.debug') });
  log(`${args.has('--link') ? 'Linked' : 'Copied'} the Chandelier panel to ${target}`);
  if (args.has('--debug')) {
    writeFileSync(join(target, '.debug'), `<?xml version="1.0" encoding="UTF-8"?>
<ExtensionList>
  <Extension Id="${PANEL_ID}.panel"><HostList><Host Name="ILST" Port="${DEBUG_PORT}"/></HostList></Extension>
</ExtensionList>
`);
    log(`DevTools for the panel: http://localhost:${DEBUG_PORT} (after restarting Illustrator and opening the panel).`);
  }
  for (const n of CSXS) {
    if (win) exec('reg', ['add', `HKCU\\Software\\Adobe\\CSXS.${n}`, '/v', 'PlayerDebugMode', '/t', 'REG_SZ', '/d', '1', '/f']);
    else exec('defaults', ['write', `com.adobe.CSXS.${n}`, 'PlayerDebugMode', '1']);
  }
  log(`PlayerDebugMode=1 for CSXS.${CSXS[0]}…${CSXS[CSXS.length - 1]} (lets Illustrator load this unsigned panel).`);
  log('');
  log('Next:');
  log('  1. Restart Illustrator, then open Window > Extensions > Chandelier.');
  log('  2. Run the server in panel mode, e.g. for Claude Code:');
  log('       claude mcp add chandelier-panel -e CHANDELIER_TRANSPORT=panel -- npx -y chandelier-mcp');
  log('  3. To have panel messages wake the agent (Claude Code channels, research preview), add CHANDELIER_CHANNEL=1');
  log('     to that server and start Claude Code with:');
  log('       claude --dangerously-load-development-channels server:chandelier-panel');
  if (win && process.arch === 'arm64') log('Note: Illustrator on Windows ARM loads only Adobe\'s own CEP panels; this one needs x64 Illustrator.');
  return 0;
}

