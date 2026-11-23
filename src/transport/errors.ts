// Bridge error numbers → messages that tell the agent what happened and what to do.
// macOS: Apple Event / Illustrator errnos. Windows: COM HRESULTs, sent by bridge-win.ps1 as signed 32-bit ints and
// looked up here in hex (windows-plan § 3.5). Same wording where the meaning is the same.
const NOT_RUNNING = 'Illustrator is not running. Start it, or call status with launch:true.';
const GONE = 'Illustrator quit or crashed during the call. Restart it; the runtime reloads by itself.';
const TIMEOUT = 'Timed out waiting for Illustrator. It may still be working: check the document before retrying (do not repeat non-idempotent work blindly).';
const BUSY = 'Illustrator stayed busy until the timeout (a modal dialog may be open in Illustrator). Close it and check the document before retrying.';

export const ERRNO: Record<string, string> = {
  '-600': NOT_RUNNING,
  '-609': GONE,
  '-903': 'Illustrator did not accept the Apple event (it may be starting up or showing a dialog).',
  '-1708': 'Illustrator did not understand the request (is a modal dialog open?).',
  '-1712': TIMEOUT,
  '-1728': 'Illustrator could not find the object it was asked about.',
  '-1743': 'macOS blocked automation of Illustrator. Allow it in System Settings → Privacy & Security → Automation, then retry.',
  '-10810': 'macOS could not launch Illustrator.',
  '5001': 'ExtendScript error (often a syntax error in the script).',
  '1346458189': 'Illustrator internal error MRAP. Usually transient: retry once; if it repeats, save and restart Illustrator.',
  // Windows (COM)
  '0x800401E3': NOT_RUNNING, // MK_E_UNAVAILABLE
  '0x800401F3': 'Illustrator is not installed or its COM server is not registered (start it once as this user).', // CO_E_CLASSSTRING
  '0x80010108': GONE, // RPC_E_DISCONNECTED
  '0x800706BA': GONE, // RPC_S_SERVER_UNAVAILABLE
  '0x80010007': GONE, // RPC_E_SERVER_DIED
  '0x80010012': GONE, // RPC_E_SERVER_DIED_DNE
  '0x8001010A': BUSY, // RPC_E_SERVERCALL_RETRYLATER
  '0x80010001': BUSY, // RPC_E_CALL_REJECTED
  '0x80041389': 'ExtendScript error (often a syntax error in the script).', // FACILITY_ITF + 5001: what DoJavaScript throws (W1, Illustrator 31)
  '0x80020009': 'ExtendScript error outside the runtime (often a syntax error in the script).', // DISP_E_EXCEPTION
  '0x80070005': 'Illustrator runs as another user or elevated ("Run as administrator"); run it and the MCP client at the same level.', // E_ACCESSDENIED
};

/** Map key of an error number: decimal for Apple errnos, 0xXXXXXXXX for HRESULTs (negative 32-bit with the high bit). */
export function errKey(errno: number): string {
  if (errno < -0x10000000 && errno >= -0x80000000) return '0x' + (errno >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return String(errno);
}

/** Errors after which the call may still be running in Illustrator (the agent should check before repeating). */
export const isTimeout = (errno: number | null | undefined): boolean =>
  errno != null && (errno === -1712 || ['0x8001010A', '0x80010001'].includes(errKey(errno)));

export function explain(errno: number | null | undefined, raw: string | undefined): string {
  const key = errno != null ? errKey(errno) : '';
  const known = errno != null ? ERRNO[key] : undefined;
  if (!known) return raw ?? 'unknown error';
  return raw ? `${known} (${key}: ${raw})` : `${known} (${key})`;
}
