import { expect, test } from '@playwright/test';
import { gotoGame } from './helpers';

// 30 t: a market order big enough to move the price, filled at the next hourly clearing.
test('selling ilmenite at market fills at the next clearing and pays', async ({ page }) => {
  await gotoGame(page, { scene: 'demo' });
  await expect
    .poll(() => page.evaluate(() => window.__pmo.ui()?.company !== null), { timeout: 30_000 })
    .toBe(true);
  await page.keyboard.press('3');
  const tab = page.getByTestId('tab-panel');
  await tab.getByRole('button', { name: /^Ilmenite/ }).click();
  await tab.getByRole('radio', { name: 'Sell' }).check();
  await tab.getByRole('radio', { name: 'Market' }).check();
  await tab.getByLabel('Amount (t)').fill('30');
  await expect(tab.getByTestId('quote')).toContainText(
    /Estimated price LM [\d,.]+\/t, fills [\d.,]+ t/,
  );
  await tab.getByRole('button', { name: 'Place order' }).click();
  // One game hour passes in about a real second at 60x, so the order may fill before it shows.
  await expect(tab.getByRole('list', { name: 'Recent fills' })).toContainText(
    /Sold 30\.0 t Ilmenite for LM [\d,.]+/,
    { timeout: 15_000 },
  );
  await expect(tab.getByRole('list', { name: 'Open orders' })).toHaveText('No open orders.');
  await expect(tab.locator('.error')).toBeEmpty();
});

// At 600x a game hour passes in a tenth of a second, faster than the form waits after a change.
test('the quote shows even when game hours pass faster than the form waits', async ({ page }) => {
  await gotoGame(page, { scene: 'demo', timescale: '600' });
  await expect
    .poll(() => page.evaluate(() => window.__pmo.ui()?.company !== null), { timeout: 30_000 })
    .toBe(true);
  await page.keyboard.press('3');
  const tab = page.getByTestId('tab-panel');
  await tab.getByRole('button', { name: /^Ilmenite/ }).click();
  await tab.getByLabel('Amount (t)').fill('10');
  await expect(tab.getByTestId('quote')).toContainText('Estimated price', { timeout: 10_000 });
});
