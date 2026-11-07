import { expect, test, type Page } from '@playwright/test';
import { foundCompany, gotoGame, nearestFreeSection, openTab } from './helpers';

const snapshot = (page: Page) => page.evaluate(() => window.__pmo.ui()!);

// Seed 42 at 10x, so a lot runs 18 real seconds. In the first game day each rival can bid up to
// LM 232,848, its cash less three days of wages, so LM 250,000 (the founding cash) wins any
// neighbour.
test('open a lot on a neighbour section, set a proxy of LM 250,000, and own the section when it ends', async ({
  page,
}) => {
  test.slow();
  await gotoGame(page, { timescale: '10' });
  await foundCompany(page);
  const id = await nearestFreeSection(page);
  await page.evaluate((id) => window.__pmo.select({ kind: 'section', id }), id);
  await openTab(page, 'Build');
  const land = page.getByTestId('tab-panel').getByRole('region', { name: 'Land and auctions' });
  await expect(land).toContainText('Reserve LM 30,000.00');
  await land.getByRole('button', { name: 'Open an auction — LM 2,000.00' }).click();

  const lot = land.getByRole('region', { name: `Auction for section ${id}` });
  await expect(lot).toContainText('Your minimum bid');
  await lot.getByLabel('Bid for me up to (LM)').fill('250000');
  await lot.getByRole('button', { name: 'Set' }).click();
  await expect(lot).toContainText('LM 250,000.00');
  await expect(land.getByRole('list', { name: 'Open lots' })).toContainText(`Section ${id}`);

  await expect
    // A late bid can stretch a lot to 10 game hours: 60 real seconds here.
    .poll(async () => (await snapshot(page)).sections.map((s) => s.id), { timeout: 70_000 })
    .toContain(id);
});

test('a rival lot appears in the Land and auctions list', async ({ page }) => {
  await gotoGame(page);
  await foundCompany(page);
  await openTab(page, 'Build');
  const rivals = (await snapshot(page)).companies
    .filter((c) => c.kind === 'rival')
    .map((c) => c.name);
  const lots = page
    .getByTestId('tab-panel')
    .getByRole('region', { name: 'Land and auctions' })
    .getByRole('list', { name: 'Open lots' });
  // The Lunar Authority puts a section up every 12 game hours, and rivals bid on it.
  await expect
    .poll(
      async () => {
        const text = (await lots.textContent()) ?? '';
        return rivals.some((name) => text.includes(name));
      },
      { timeout: 30_000 },
    )
    .toBe(true);
});
