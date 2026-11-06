import { expect, test } from '@playwright/test';
import { foundCompany, gotoGame } from './helpers';

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

test('at planetary altitude the ownership legend lists 6 companies', async ({ page }) => {
  await gotoGame(page);
  await foundCompany(page);
  // From orbit, over the equator: phones start closer in.
  await page.evaluate(() => window.__pmo.setCamera(0, 0, 200, 0));
  const legend = page.getByRole('list', { name: 'Owners' });
  await expect(legend.getByRole('listitem')).toHaveCount(6);
  await expect(legend.getByRole('listitem').first()).toHaveText('You');
  await expect(legend).toContainText('Tycho Deepworks');
});
