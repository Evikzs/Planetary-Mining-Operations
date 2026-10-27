export interface SaveFile {
  format: 'pmo-save';
  version: number;
  savedAtRealMs: number;
  seed: number;
  tick: number;
  state: unknown;
  checksum: string;
}

export interface SaveStore {
  writeAuto(file: SaveFile): Promise<void>;
  loadLatestValid(): Promise<SaveFile | null>;
  writeManual?(slot: number, file: SaveFile): Promise<void>;
  readManual?(slot: number): Promise<SaveFile | null>;
}
