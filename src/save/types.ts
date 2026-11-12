export interface SaveFile {
  format: 'pmo-save';
  version: number;
  savedAtRealMs: number;
  /** Whether the clock was paused; saves before D1 lack it and count as running. */
  paused?: boolean;
  seed: number;
  tick: number;
  state: unknown;
  checksum: string;
}

/** One stored save, by its key ('auto-0', 'manual-3'). */
export interface SlotInfo {
  slot: string;
  savedAtRealMs: number;
  tick: number;
  company: string;
}

export interface SaveStore {
  writeAuto(file: SaveFile): Promise<void>;
  /** The newest autosave that passes its checks and `accept`, when given. */
  loadLatestValid(accept?: (file: SaveFile) => boolean): Promise<SaveFile | null>;
  writeManual?(slot: number, file: SaveFile): Promise<void>;
  readManual?(slot: number): Promise<SaveFile | null>;
  list?(): Promise<SlotInfo[]>;
}

/** The company a save holds, or '' before founding. */
export function companyOf(file: SaveFile): string {
  // Version 3 keeps the player as companies[0]; older saves kept a single `company`.
  const s = file.state as {
    companies?: { name?: unknown }[];
    company?: { name?: unknown } | null;
  };
  const name = s.companies ? s.companies[0]?.name : s.company?.name;
  return typeof name === 'string' ? name : '';
}
