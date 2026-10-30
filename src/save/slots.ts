import { openDB, type IDBPDatabase } from 'idb';
import { fromSaveFile } from './saveFile';
import { companyOf, type SaveFile, type SaveStore, type SlotInfo } from './types';

export type ManualSlot = 1 | 2 | 3 | 4 | 5;

const AUTO_SLOTS = 3;

function looksLikeSave(v: unknown): v is SaveFile {
  return typeof v === 'object' && v !== null && typeof (v as SaveFile).savedAtRealMs === 'number';
}

export function createIdbSaveStore(dbName = 'pmo'): SaveStore & {
  writeManual(slot: ManualSlot, file: SaveFile): Promise<void>;
  readManual(slot: ManualSlot): Promise<SaveFile | null>;
  list(): Promise<SlotInfo[]>;
} {
  let dbp: Promise<IDBPDatabase> | null = null;
  const db = () =>
    (dbp ??= openDB(dbName, 1, {
      upgrade(d) {
        d.createObjectStore('saves');
        d.createObjectStore('meta');
      },
    }));

  return {
    async writeAuto(file) {
      const tx = (await db()).transaction(['saves', 'meta'], 'readwrite');
      const next = ((await tx.objectStore('meta').get('autoNext')) as number | undefined) ?? 0;
      await tx.objectStore('saves').put(file, `auto-${next}`);
      await tx.objectStore('meta').put((next + 1) % AUTO_SLOTS, 'autoNext');
      await tx.done;
    },
    async loadLatestValid(accept) {
      const d = await db();
      const records: unknown[] = await Promise.all(
        Array.from({ length: AUTO_SLOTS }, (_, i) => d.get('saves', `auto-${i}`)),
      );
      const files = records.filter(looksLikeSave).sort((a, b) => b.savedAtRealMs - a.savedAtRealMs);
      return files.find((f) => fromSaveFile(f).ok && (accept?.(f) ?? true)) ?? null;
    },
    async writeManual(slot, file) {
      await (await db()).put('saves', file, `manual-${slot}`);
    },
    async readManual(slot) {
      const f: unknown = await (await db()).get('saves', `manual-${slot}`);
      return looksLikeSave(f) && fromSaveFile(f).ok ? f : null;
    },
    async list() {
      const d = await db();
      const keys = (await d.getAllKeys('saves')).map(String).sort();
      const infos: SlotInfo[] = [];
      for (const slot of keys) {
        const f: unknown = await d.get('saves', slot);
        if (!looksLikeSave(f)) continue;
        infos.push({ slot, savedAtRealMs: f.savedAtRealMs, tick: f.tick, company: companyOf(f) });
      }
      return infos;
    },
  };
}
