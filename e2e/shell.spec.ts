import { expect, test } from '@playwright/test';
import { foundCompany, gotoGame } from './helpers';

test('desktop shows the rail, phone shows bottom tabs', async ({ page }, info) => {
  await gotoGame(page);
  await foundCompany(page);
  if (info.project.name === 'desktop') {
    await expect(page.getByTestId('tab-rail')).toBeVisible();
    await expect(page.getByTestId('bottom-tabs')).toBeHidden();
  } else {
    await expect(page.getByTestId('bottom-tabs')).toBeVisible();
    await expect(page.getByTestId('tab-rail')).toBeHidden();
  }
});

test('phone tab buttons are at least 44x44', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone layout only');
  await gotoGame(page);
  await foundCompany(page);
  const buttons = page.getByTestId('bottom-tabs').getByRole('button');
  const count = await buttons.count();
  expect(count).toBe(5);
  for (let i = 0; i < count; i++) {
    const box = await buttons.nth(i).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});

test('keyboard 2 opens People and Esc closes', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop keyboard');
  await gotoGame(page);
  await foundCompany(page);
  await page.keyboard.press('2');
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
  await gotoGame(second, { freeze: '1' });
  await expect(second.getByText('The game is open in another tab.')).toBeVisible();
  // The second tab never starts the game, so it cannot save over the first.
  expect(await second.evaluate(() => typeof window.__pmo)).toBe('undefined');
  await foundCompany(page);
});
