import { expect, test } from '@playwright/test';
import { foundCompany, gotoGame } from './helpers';

test('the app boots and the date element exists', async ({ page }) => {
  await gotoGame(page, { freeze: '1' });
  await expect(page.getByTestId('app')).toBeVisible();
  await foundCompany(page);
  await expect(page.getByTestId('game-date')).toHaveText('2091-03-01 05:00');
});
