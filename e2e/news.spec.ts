import { expect, test } from '@playwright/test';
import { foundCompany, gotoGame } from './helpers';

test('the shift log shows rival news in three lines at most', async ({ page }) => {
  await gotoGame(page);
  await foundCompany(page);
  const rivals = await page.evaluate(() =>
    window.__pmo
      .ui()!
      .companies.filter((c) => c.kind === 'rival')
      .map((c) => c.name),
  );
  const log = page.getByTestId('news-ticker');
  // Rivals bid on the Lunar Authority's lot at game hour 12 and win it 3 hours later.
  await expect
    .poll(
      async () => {
        const text = (await log.textContent()) ?? '';
        return rivals.some((name) => text.includes(name));
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  const lines = log.getByRole('listitem');
  expect(await lines.count()).toBeGreaterThan(0);
  expect(await lines.count()).toBeLessThanOrEqual(3);
  await expect(log).toHaveAttribute('role', 'log');

  // Reduced motion: lines appear without sliding in.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(lines.last()).toHaveCSS('animation-name', 'none');
});
