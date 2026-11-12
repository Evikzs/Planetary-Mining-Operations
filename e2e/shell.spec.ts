import { expect, test } from '@playwright/test';
import { foundCompany, gotoGame } from './helpers';

test('the rail shows every tab', async ({ page }) => {
  await gotoGame(page);
  await foundCompany(page);
  const rail = page.getByTestId('tab-rail');
  for (const label of ['Build', 'People', 'Trade', 'Finance', 'Contracts', 'Codex', 'Settings']) {
    await expect(rail.getByRole('button', { name: label })).toBeVisible();
  }
});

test('keyboard P opens People and Esc closes', async ({ page }) => {
  await gotoGame(page);
  await foundCompany(page);
  await page.keyboard.press('p');
  await expect(page.getByTestId('tab-panel')).toBeVisible();
  await expect(page.getByTestId('tab-panel').getByRole('heading', { level: 2 })).toHaveText(
    'People',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tab-panel')).toBeHidden();
});

test('reduced motion is mirrored on <html>', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoGame(page);
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
});

test('an error in the game worker shows in a banner until dismissed', async ({ page }) => {
  await gotoGame(page, { freeze: '1' });
  await foundCompany(page);
  // A buy order for a good that does not exist makes the worker throw.
  await page.evaluate(() => {
    const sectionId = window.__pmo.ui()!.sections[0]!.id;
    void window.__pmo.send({
      t: 'placeOrder',
      goodId: 'nope' as never,
      side: 'buy',
      kind: 'market',
      qtyKg: 1000,
      sectionId,
    });
  });
  const banner = page.getByRole('alert').filter({ hasText: 'Something went wrong' });
  await expect(banner).toBeVisible();
  await banner.getByRole('button', { name: 'Dismiss' }).click();
  await expect(banner).toBeHidden();
});

test('a second tab of the game waits for the first, so their saves never collide', async ({
  page,
  context,
}) => {
  await gotoGame(page, { freeze: '1' });
  await expect.poll(() => page.evaluate(() => window.__pmo.ui() !== null)).toBe(true);
  const second = await context.newPage();
  await gotoGame(second, { freeze: '1' }, { api: false });
  await expect(second.getByText('The game is open in another tab.')).toBeVisible();
  // The second tab never starts the game, so it cannot save over the first.
  expect(await second.evaluate(() => typeof window.__pmo)).toBe('undefined');
  await foundCompany(page);
});
