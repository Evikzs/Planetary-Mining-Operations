import { expect, type Page } from '@playwright/test';
import { formatMoney } from '../src/ui/format';

/**
 * Opens the game with e2e debug flags; defaults speed time up 60x on seed 42. Waits for the test
 * API, which arrives once the page holds the game's tab lock, a moment after load, and for the
 * renderer, without which `setCamera` does nothing; `api: false` skips that for pages that never
 * start the game.
 */
export async function gotoGame(
  page: Page,
  params: Record<string, string> = {},
  opts: { api?: boolean } = {},
): Promise<void> {
  const query = new URLSearchParams({ timescale: '60', seed: '42', ...params });
  await page.goto(`/?${query.toString()}`);
  if (opts.api ?? params.nowebgl !== '1') {
    await page.waitForFunction(() => window.__pmo !== undefined && window.__pmo.camera() !== null);
  }
}

/** Founds Selene Rock Co with the veteran through the test API, once the worker is ready. */
export async function foundCompany(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.__pmo.ui() !== null)).toBe(true);
  await page.evaluate(() =>
    window.__pmo.send({ t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' }),
  );
  await expect(page.getByTestId('top-bar')).toContainText('Selene Rock Co');
}

/** Opens a tab from the rail. */
export async function openTab(page: Page, label: string): Promise<void> {
  await page.getByTestId('tab-rail').getByRole('button', { name: label }).click();
}

/** The unowned section nearest the player's charter, with no lot open on it. */
export function nearestFreeSection(page: Page): Promise<number> {
  return page.evaluate(() => {
    const w = window.__pmo.world()!;
    const home = w.sections.find((s) => s.owner === 0)!.center;
    const dist = (c: readonly number[]) => Math.hypot(...c.map((v, i) => v - home[i]!));
    const free = w.sections.filter((s) => s.owner === null && !s.onAuction);
    return free.sort((a, b) => dist(a.center) - dist(b.center))[0]!.id;
  });
}

/**
 * Opens a lot on the free section nearest the charter and sets a proxy, in the context panel.
 * Game time stands still meanwhile: at e2e speeds a lot can close before a slow runner has typed.
 */
export async function bidOnNeighbour(page: Page, ceilingLm: number): Promise<number> {
  await page.evaluate(() => window.__pmo.freeze(true));
  const id = await nearestFreeSection(page);
  await page.evaluate((section) => window.__pmo.select({ kind: 'section', id: section }), id);
  const context = page.getByTestId('context-panel');
  await context.getByRole('button', { name: 'Open an auction — LM 2,000.00' }).click();
  const lot = context.getByRole('region', { name: `Auction for section ${id}` });
  await lot.getByLabel('Bid for me up to (LM)').fill(String(ceilingLm));
  await lot.getByRole('button', { name: 'Set' }).click();
  await expect(lot).toContainText(formatMoney(ceilingLm * 100));
  await page.evaluate(() => window.__pmo.freeze(false));
  return id;
}
