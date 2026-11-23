// Platform layer (phase 7 W2): which bridge carries scripts into Illustrator, and how file paths are written for
// ExtendScript. Everything above the bridge (Transport protocol, runtime, tools) is the same on macOS and Windows.
import { asset } from './paths.js';

export type OS = 'mac' | 'win';

export const osOf = (p: NodeJS.Platform = process.platform): OS => (p === 'win32' ? 'win' : 'mac');

export const BRIDGE_MAC = asset('bridge/bridge-mac.js');
export const BRIDGE_WIN = asset('bridge/bridge-win.ps1');

/** The persistent bridge process: JXA on macOS, Windows PowerShell 5.1 (STA, COM) on Windows. */
export function bridgeCommand(os: OS = osOf()): { command: string; args: string[] } {
  if (os === 'win') {
    // powershell.exe (5.1), not pwsh: .NET Core dropped Marshal.GetActiveObject (windows-plan § 2).
    // Bypass applies to this process only and needs no admin rights.
    return { command: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Sta', '-ExecutionPolicy', 'Bypass', '-File', BRIDGE_WIN] };
  }
  return { command: 'osascript', args: ['-l', 'JavaScript', BRIDGE_MAC] };
}

/** A path as ExtendScript's File/Folder should get it: forward slashes on Windows (C:/Users/…), unchanged on macOS. */
export function scriptPath(p: string, os: OS = osOf()): string {
  return os === 'win' ? p.replace(/\\/g, '/') : p;
}

/** Keys of runtime command args that hold file system paths (documents, export, place, preview). */
export const PATH_KEYS = ['path', 'dir'] as const;

/** Copy of args with path values converted by scriptPath (shallow: path keys are top-level in every command). */
export function scriptPaths<T extends object>(args: T, os: OS = osOf()): T {
  if (os !== 'win') return args;
  const out: Record<string, unknown> = { ...(args as Record<string, unknown>) };
  for (const k of PATH_KEYS) if (typeof out[k] === 'string') out[k] = scriptPath(out[k] as string, os);
  return out as T;
}
