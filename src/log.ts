// Debug log (phase 5): CHANDELIER_LOG=debug writes one JSON line per event to stderr (MCP clients keep the server's
// stderr in their logs); CHANDELIER_LOG_FILE=<path> appends the lines to that file instead. Read on every call, so a
// test can switch it on before creating a server.
import { appendFileSync } from 'node:fs';

export const logOn = (): boolean => process.env.CHANDELIER_LOG === 'debug' || !!process.env.CHANDELIER_LOG_FILE;

export function log(entry: Record<string, unknown>): void {
  if (!logOn()) return;
  const line = JSON.stringify({ t: new Date().toISOString(), ...entry }) + '\n';
  try {
    if (process.env.CHANDELIER_LOG_FILE) appendFileSync(process.env.CHANDELIER_LOG_FILE, line);
    else process.stderr.write(line);
  } catch { /* logging never breaks a call */ }
}
