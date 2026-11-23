// Phase 7 W2: platform layer and the Windows HRESULT error map (run on every OS).
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { bridgeCommand, scriptPath, scriptPaths, osOf, BRIDGE_WIN } from '../../src/platform.js';
import { explain, errKey, isTimeout } from '../../src/transport/errors.js';

const hr = (hex: string) => parseInt(hex, 16) | 0; // signed 32-bit, as bridge-win.ps1 sends it

describe('platform', () => {
  it('picks the bridge by OS', () => {
    expect(osOf('darwin')).toBe('mac');
    expect(osOf('win32')).toBe('win');
    expect(bridgeCommand('mac').command).toBe('osascript');
    const w = bridgeCommand('win');
    expect(w.command).toBe('powershell.exe');
    expect(w.args).toEqual(expect.arrayContaining(['-Sta', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File']));
    expect(w.args.at(-1)).toMatch(/bridge-win\.ps1$/);
  });

  it('writes paths for ExtendScript with forward slashes on Windows only', () => {
    expect(scriptPath('C:\\Users\\a b\\out.pdf', 'win')).toBe('C:/Users/a b/out.pdf');
    expect(scriptPath('/Users/a/out.pdf', 'mac')).toBe('/Users/a/out.pdf');
    const a = { path: 'D:\\x\\y.ai', dir: 'C:\\t', code: 'a\\b' };
    expect(scriptPaths(a, 'win')).toEqual({ path: 'D:/x/y.ai', dir: 'C:/t', code: 'a\\b' });
    expect(scriptPaths(a, 'mac')).toBe(a);
  });

  it('ships an ASCII PowerShell bridge that speaks the same ops', () => {
    expect(existsSync(BRIDGE_WIN)).toBe(true);
    const src = readFileSync(BRIDGE_WIN, 'utf8');
    expect(/[^\x00-\x7e]/.test(src)).toBe(false); // PowerShell 5.1 reads BOM-less files as ANSI
    for (const op of ["'running'", "'activate'", "'launch'", "'js'"]) expect(src).toContain(op);
    expect(src).toContain('GetActiveObject');
    expect(src).not.toMatch(/New-Object\s+-ComObject\s+['"]?Illustrator/i); // never launch Illustrator by COM
  });
});

describe('Windows error map', () => {
  it('keys HRESULTs in hex and Apple errnos in decimal', () => {
    expect(errKey(hr('800401E3'))).toBe('0x800401E3');
    expect(errKey(-1712)).toBe('-1712');
    expect(errKey(1346458189)).toBe('1346458189');
  });

  it('explains COM failures like their macOS twins', () => {
    expect(explain(hr('800401E3'), 'x')).toMatch(/^Illustrator is not running/);
    expect(explain(-600, 'x')).toMatch(/^Illustrator is not running/);
    expect(explain(hr('80010108'), 'x')).toMatch(/quit or crashed/);
    expect(explain(hr('8001010A'), 'x')).toMatch(/modal dialog/);
    expect(explain(hr('80070005'), 'x')).toMatch(/administrator/);
    expect(explain(-2147216503, 'Error 17')).toMatch(/^ExtendScript error \(often.*0x80041389: Error 17/); // W1: what DoJavaScript throws
    expect(explain(hr('80004005'), 'raw')).toBe('raw');
  });

  it('treats busy-until-timeout like a timeout', () => {
    expect(isTimeout(-1712)).toBe(true);
    expect(isTimeout(hr('8001010A'))).toBe(true);
    expect(isTimeout(hr('80010001'))).toBe(true);
    expect(isTimeout(hr('800401E3'))).toBe(false);
    expect(isTimeout(null)).toBe(false);
  });
});
