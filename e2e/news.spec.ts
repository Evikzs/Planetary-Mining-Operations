import { expect, test } from '@playwright/test';
import { foundCompany, gotoGame } from './helpers';

test('the desktop ticker shows rival news; reduced motion shows one item without movement', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'phones read news in the Finance tab');
  await gotoGame(page);
  await foundCompany(page);
  const rivals = await page.evaluate(() =>
    window.__pmo
      .ui()!
      .companies.filter((c) => c.kind === 'rival')
      .map((c) => c.name),
  );
  const ticker = page.getByTestId('news-ticker');
  // Rivals bid on the Lunar Authority's lot at game hour 12 and win it 3 hours later.
  await expect
    .poll(
      async () => {
        const text = (await ticker.textContent()) ?? '';
        return rivals.some((name) => text.includes(name));
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  const track = ticker.getByRole('list');
  await expect(track).toHaveCSS('animation-name', 'ticker-crawl');
  expect(await track.getByRole('listitem').count()).toBeGreaterThan(1);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(track.getByRole('listitem')).toHaveCount(1);
  await expect(track).toHaveCSS('animation-name', 'none');
  // The next item takes its place after 8 seconds.
  const first = await track.textContent();
  await expect.poll(() => track.textContent(), { timeout: 10_000 }).not.toBe(first);
  await expect(track.getByRole('listitem')).toHaveCount(1);
});
