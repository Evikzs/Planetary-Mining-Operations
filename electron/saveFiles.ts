// Save slots as files, for the desktop app's main process. Plain Node: no Electron import.
import fs from 'node:fs';
import path from 'node:path';

export const SLOT_PATTERN = /^(auto-[0-2]|manual-[1-5])$/;

/** The page names a slot; only these names ever become a path. */
function fileOf(dir: string, slot: string): string {
  if (!SLOT_PATTERN.test(slot)) throw new Error('bad slot name');
  return path.join(dir, `${slot}.json`);
}

const missing = (err: unknown) => (err as NodeJS.ErrnoException).code === 'ENOENT';

export async function listSlots(dir: string): Promise<string[]> {
  let names: string[];
  try {
    names = await fs.promises.readdir(dir);
  } catch (err) {
    if (missing(err)) return [];
    throw err;
  }
  return names
    .filter((n) => n.endsWith('.json'))
    .map((n) => n.slice(0, -'.json'.length))
    .filter((slot) => SLOT_PATTERN.test(slot))
    .sort();
}

export async function readSlot(dir: string, slot: string): Promise<string | null> {
  const file = fileOf(dir, slot);
  try {
    return await fs.promises.readFile(file, 'utf8');
  } catch (err) {
    if (missing(err)) return null;
    throw err;
  }
}

/** Writes a temporary file, flushes it, then renames it over the slot: a crash keeps the old save. */
export async function writeSlot(dir: string, slot: string, text: string): Promise<void> {
  const file = fileOf(dir, slot);
  await fs.promises.mkdir(dir, { recursive: true });
  const tmp = `${file}.tmp`;
  const handle = await fs.promises.open(tmp, 'w');
  try {
    await handle.writeFile(text, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.promises.rename(tmp, file);
}

export async function removeSlot(dir: string, slot: string): Promise<void> {
  await fs.promises.rm(fileOf(dir, slot), { force: true });
}
