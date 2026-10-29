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
