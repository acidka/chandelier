// Apple Event / Illustrator error numbers → messages that tell the agent what happened and what to do.
export const ERRNO: Record<string, string> = {
  '-600': 'Illustrator is not running. Start it, or call status with launch:true.',
  '-609': 'Illustrator quit or crashed during the call. Restart it; the runtime reloads by itself.',
  '-903': 'Illustrator did not accept the Apple event (it may be starting up or showing a dialog).',
  '-1708': 'Illustrator did not understand the request (is a modal dialog open?).',
  '-1712': 'Timed out waiting for Illustrator. It may still be working: check the document before retrying (do not repeat non-idempotent work blindly).',
  '-1728': 'Illustrator could not find the object it was asked about.',
  '-1743': 'macOS blocked automation of Illustrator. Allow it in System Settings → Privacy & Security → Automation, then retry.',
  '-10810': 'macOS could not launch Illustrator.',
  '5001': 'ExtendScript error (often a syntax error in the script).',
  '1346458189': 'Illustrator internal error MRAP. Usually transient: retry once; if it repeats, save and restart Illustrator.',
};

export function explain(errno: number | null | undefined, raw: string | undefined): string {
  const known = errno != null ? ERRNO[String(errno)] : undefined;
  if (!known) return raw ?? 'unknown error';
  return raw ? `${known} (${errno}: ${raw})` : `${known} (${errno})`;
}
