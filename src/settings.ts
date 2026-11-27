// Session settings (changed with the configure tool). Sent to the runtime with every command.
import { osOf, type OS } from './platform.js';

export interface Settings {
  /** units for all coordinates and sizes in tool arguments and results */
  units: 'pt' | 'mm' | 'in' | 'px';
  /** "artboard": origin at the top-left of the reference artboard, y down. "document": Illustrator's own document coordinates (y up). */
  origin: 'artboard' | 'document';
  /** reference artboard index for coordinates; null = the active artboard */
  artboard: number | null;
  /** default timeout per call, seconds */
  timeout: number;
  /** bring Illustrator to the front before save/export (avoids background hangs, quirk A10: macOS only — Windows saves
   *  and exports fine in the background, W1 2026-11-24, so it defaults to off there) */
  activate: boolean;
  /** "brief": replies keep only the fields the next step usually needs (src/tools/brief.ts); Node-side only */
  reply: 'full' | 'brief';
}

export const defaultSettings = (os: OS = osOf()): Settings => ({ units: 'pt', origin: 'artboard', artboard: null, timeout: 300, activate: os === 'mac', reply: 'brief' });
