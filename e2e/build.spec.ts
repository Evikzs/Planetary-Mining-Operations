import { expect, test } from '@playwright/test';
import { gotoGame } from './helpers';

test('builds a mine from the Build tab and sees it finish', async ({ page }) => {
  await gotoGame(page);
  await expect.poll(() => page.evaluate(() => window.__pmo.ui() !== null)).toBe(true);
  await page.evaluate(() =>
    window.__pmo.send({ t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' }),
  );
  await page.keyboard.press('1');
  const tab = page.getByTestId('tab-panel');
  await tab.getByRole('button', { name: 'Ilmenite deposit' }).first().click();
  await tab.getByRole('button', { name: 'Build Mine' }).click();
  await expect(tab).toContainText('Under construction');
  // A mine takes 4 game hours: about 4 real seconds at 60x.
  await expect(tab).not.toContainText('Under construction', { timeout: 20_000 });
  await expect(tab).toContainText(/Working|No workers on shift/);
});
