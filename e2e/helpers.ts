import type { Page } from '@playwright/test';

/** Opens the game with e2e debug flags; defaults speed time up 60x on seed 42. */
export async function gotoGame(page: Page, params: Record<string, string> = {}): Promise<void> {
  const query = new URLSearchParams({ timescale: '60', seed: '42', ...params });
  await page.goto(`/?${query.toString()}`);
}
