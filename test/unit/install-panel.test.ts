// npx chandelier-mcp install-panel (phase 8 panel): copies the panel, sets PlayerDebugMode per CSXS version, uninstalls.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installPanel, extensionsDir, isArm, PANEL_ID } from '../../src/install-panel.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'aia-install-'));
  const src = join(root, 'cep');
  mkdirSync(join(src, 'CSXS'), { recursive: true });
  writeFileSync(join(src, 'CSXS', 'manifest.xml'), '<ExtensionManifest/>');
  writeFileSync(join(src, '.debug'), 'dev only');
  return { root, src, home: join(root, 'home') };
}

describe('install-panel', () => {
  it('macOS: copies the panel (without .debug) and sets PlayerDebugMode for CSXS 9-14', () => {
    const f = fixture();
    const calls: string[][] = [], lines: string[] = [];
    expect(installPanel({ args: [], src: f.src, platform: 'darwin', home: f.home, exec: (c, a) => calls.push([c, ...a]), log: (l) => lines.push(l) })).toBe(0);
    const target = join(extensionsDir('darwin', f.home), PANEL_ID);
    expect(target).toContain(join('Library', 'Application Support', 'Adobe', 'CEP', 'extensions'));
    expect(existsSync(join(target, 'CSXS', 'manifest.xml'))).toBe(true);
    expect(existsSync(join(target, '.debug'))).toBe(false);
    expect(calls.map((c) => c[2])).toEqual(['com.adobe.CSXS.9', 'com.adobe.CSXS.10', 'com.adobe.CSXS.11', 'com.adobe.CSXS.12', 'com.adobe.CSXS.13', 'com.adobe.CSXS.14']);
    expect(lines.join('\n')).toMatch(/Window > Extensions > Chandelier[\s\S]*CHANDELIER_TRANSPORT=panel -- npx -y chandelier-mcp[\s\S]*dangerously-load-development-channels[\s\S]*never receives panel messages[\s\S]*run install-panel again/);
    installPanel({ args: ['--uninstall'], src: f.src, platform: 'darwin', home: f.home, exec: () => {}, log: () => {} });
    expect(existsSync(target)).toBe(false);
    rmSync(f.root, { recursive: true, force: true });
  });
  it('Windows: %APPDATA% extensions folder and reg add', () => {
    const f = fixture();
    const calls: string[][] = [];
    const lines: string[] = [];
    installPanel({ args: ['--debug'], src: f.src, platform: 'win32', home: f.home, appData: join(f.root, 'AppData'), env: { PROCESSOR_ARCHITECTURE: 'ARM64' }, exec: (c, a) => calls.push([c, ...a]), log: (l) => lines.push(l) });
    expect(lines.join('\n')).toMatch(/-- cmd \/c npx -y chandelier-mcp/); // Windows has only npx.cmd
    expect(lines.join('\n')).toMatch(/Windows ARM loads only Adobe's own CEP panels/);
    const target = join(f.root, 'AppData', 'Adobe', 'CEP', 'extensions', PANEL_ID);
    expect(existsSync(join(target, '.debug'))).toBe(true); // --debug writes it on purpose
    expect(calls[0]).toEqual(['reg', 'add', 'HKCU\\Software\\Adobe\\CSXS.9', '/v', 'PlayerDebugMode', '/t', 'REG_SZ', '/d', '1', '/f']);
    rmSync(f.root, { recursive: true, force: true });
  });
  it('--help and unknown options print usage and change nothing', () => {
    const f = fixture();
    const calls: string[][] = [], lines: string[] = [];
    const o = { src: f.src, platform: 'darwin' as const, home: f.home, exec: (c: string, a: string[]) => calls.push([c, ...a]), log: (l: string) => lines.push(l) };
    expect(installPanel({ ...o, args: ['--help'] })).toBe(0);
    expect(installPanel({ ...o, args: ['--force'] })).toBe(1);
    expect(lines.join('\n')).toMatch(/Unknown option: --force[\s\S]*Usage: npx chandelier-mcp install-panel/);
    expect(existsSync(join(extensionsDir('darwin', f.home), PANEL_ID))).toBe(false);
    expect(calls).toEqual([]);
    rmSync(f.root, { recursive: true, force: true });
  });
  it('knows Windows on ARM also under x64 emulation', () => {
    expect(isArm({}, 'arm64')).toBe(true);
    expect(isArm({ PROCESSOR_ARCHITEW6432: 'ARM64', PROCESSOR_ARCHITECTURE: 'AMD64' }, 'x64')).toBe(true);
    expect(isArm({ PROCESSOR_ARCHITECTURE: 'AMD64' }, 'x64')).toBe(false);
  });
  it('refuses without built panel files', () => {
    const lines: string[] = [];
    expect(installPanel({ args: [], src: '/nonexistent/cep', platform: 'darwin', home: '/tmp/x', exec: () => {}, log: (l) => lines.push(l) })).toBe(1);
    expect(lines[0]).toMatch(/npm run build/);
  });
});
