export interface SaveFile {
  format: 'pmo-save';
  version: number;
  savedAtRealMs: number;
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
  const name = (file.state as { company?: { name?: unknown } | null }).company?.name;
  return typeof name === 'string' ? name : '';
}
