import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const sources = [...files('src/ui'), ...files('src/data')];

describe('style rules', () => {
  it('has UI sources to check', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it('uses no backdrop-filter and no emoji', () => {
    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      expect(text.includes('backdrop-filter'), `${file} uses backdrop-filter`).toBe(false);
      expect(/\p{Extended_Pictographic}/u.test(text), `${file} contains emoji`).toBe(false);
    }
  });
});
