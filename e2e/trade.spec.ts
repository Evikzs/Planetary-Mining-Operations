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
