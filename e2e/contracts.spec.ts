import { expect, test } from '@playwright/test';
import { gotoGame } from './helpers';

// The demo board offers 42 t of polar volatiles; its depot holds about 56 t.
test('accepting and delivering an ore contract completes it and pays', async ({ page }) => {
  await gotoGame(page, { scene: 'demo' });
  await expect
    .poll(() => page.evaluate(() => window.__pmo.ui()?.company !== null), { timeout: 30_000 })
    .toBe(true);
  await page.keyboard.press('4');
  const tab = page.getByTestId('tab-panel');
  const job = 'Deliver 42.0 t Polar volatiles';
  await tab
    .getByRole('region', { name: 'Offers' })
    .getByRole('article')
    .filter({ hasText: job })
    .getByRole('button', { name: 'Accept' })
    .click();
  const active = tab
    .getByRole('region', { name: 'Active contracts' })
    .getByRole('article')
    .filter({ hasText: job });
  const before = await page.evaluate(() => window.__pmo.ui()!);
  await active.getByRole('button', { name: 'Deliver' }).click();
  await expect(tab.getByRole('region', { name: 'Finished contracts' })).toContainText(job, {
    timeout: 15_000,
  });
  const after = await page.evaluate(() => window.__pmo.ui()!);
  expect(after.reputation).toBeGreaterThan(before.reputation);
  expect(after.cashCents).toBeGreaterThan(before.cashCents);
});
