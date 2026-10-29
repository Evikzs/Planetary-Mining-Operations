import { expect, test } from '@playwright/test';
import { foundCompany, gotoGame } from './helpers';

// At 1x, two real hours away are 120 game hours: past the 10 hours that bring up the away page.
test('two hours away brings up the away page until Back to work', async ({ page }) => {
  await gotoGame(page, { timescale: '1' });
  await foundCompany(page);
  await page.evaluate(() => window.__pmo.advanceRealMs(7_200_000));
  const away = page.getByRole('dialog', { name: 'While you were away' });
  await expect(away).toBeVisible({ timeout: 15_000 });
  await expect(away.getByRole('heading', { level: 2 })).toHaveText(/\s— cash (up|down|holds)/);
  await expect(away).toContainText('2 h');
  await away.getByRole('button', { name: 'Back to work' }).click();
  await expect(away).toBeHidden();
});
