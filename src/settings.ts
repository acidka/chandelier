// Session settings (changed with the configure tool). Sent to the runtime with every command.
export interface Settings {
  /** units for all coordinates and sizes in tool arguments and results */
  units: 'pt' | 'mm' | 'in' | 'px';
  /** "artboard": origin at the top-left of the reference artboard, y down. "document": Illustrator's own document coordinates (y up). */
  origin: 'artboard' | 'document';
  /** reference artboard index for coordinates; null = the active artboard */
  artboard: number | null;
  /** default timeout per call, seconds */
  timeout: number;
  /** bring Illustrator to the front before save/export (avoids background hangs, quirk A10) */
  activate: boolean;
}

export const defaultSettings = (): Settings => ({ units: 'pt', origin: 'artboard', artboard: null, timeout: 300, activate: true });
