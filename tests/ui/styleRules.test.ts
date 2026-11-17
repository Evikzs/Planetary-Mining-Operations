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

  it('uses no emoji', () => {
    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      expect(/\p{Extended_Pictographic}/u.test(text), `${file} contains emoji`).toBe(false);
    }
  });

  // Only the small sheets blur what is behind them: a blur behind the big tab panel costs every
  // frame of the map under it.
  it('blurs the backdrop of the sheet, the gauge and the alerts only', () => {
    const css = readFileSync('src/ui/global.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const blurred = [...css.matchAll(/([^{}]+)\{[^}]*backdrop-filter/g)].map((m) => m[1]!.trim());
    for (const selector of blurred) {
      expect(selector, `${selector} blurs its backdrop`).toMatch(
        /^\.(context-panel|gauge|alerts)\b/,
      );
    }
  });
});
