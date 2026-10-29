import { expect, type Page } from '@playwright/test';

/** Opens the game with e2e debug flags; defaults speed time up 60x on seed 42. */
export async function gotoGame(page: Page, params: Record<string, string> = {}): Promise<void> {
  const query = new URLSearchParams({ timescale: '60', seed: '42', ...params });
  await page.goto(`/?${query.toString()}`);
}

/** Founds Selene Rock Co with the veteran through the test API, once the worker is ready. */
export async function foundCompany(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.__pmo.ui() !== null)).toBe(true);
  await page.evaluate(() =>
    window.__pmo.send({ t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' }),
  );
  await expect(page.getByTestId('top-bar')).toContainText('Selene Rock Co');
}

/** Opens a tab from the rail on desktop, or from the bottom tabs and More on phones. */
export async function openTab(page: Page, label: string): Promise<void> {
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await page.getByTestId('tab-rail').getByRole('button', { name: label }).click();
    return;
  }
  const tabs = page.getByTestId('bottom-tabs');
  if (['Build', 'People', 'Trade', 'Contracts'].includes(label)) {
    await tabs.getByRole('button', { name: label }).click();
    return;
  }
  await tabs.getByRole('button', { name: 'More' }).click();
  await page.getByTestId('tab-panel').getByRole('button', { name: label }).click();
}
