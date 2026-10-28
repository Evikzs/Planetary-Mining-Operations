import { expect, test } from '@playwright/test';
import { gotoGame } from './helpers';

test('the globe renders chunks', async ({ page }) => {
  await gotoGame(page);
  await expect
    .poll(() => page.evaluate(() => window.__pmo.renderStats()?.chunksVisible ?? 0))
    .toBeGreaterThan(0);
});

test('?nowebgl=1 shows the WebGL 2 message', async ({ page }) => {
  await gotoGame(page, { nowebgl: '1' });
  await expect(
    page.getByText(
      'This game needs WebGL 2. Update your browser, or try Chrome, Edge, Firefox or Safari 16+.',
      { exact: true },
    ),
  ).toBeVisible();
});
