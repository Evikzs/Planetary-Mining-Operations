import { expect, test, type Page } from '@playwright/test';
import { foundCompany, gotoGame, nearestFreeSection, openTab } from './helpers';

const snapshot = (page: Page) => page.evaluate(() => window.__pmo.ui()!);
const RIVAL = 'Tycho Deepworks';

test('the economy loop: found, win land, borrow, buy shares, read the news, and reload', async ({
  page,
}, info) => {
  test.slow();
  await gotoGame(page, { timescale: '120' });
  const panel = page.getByTestId('tab-panel');

  // 1. Found the company; from orbit the legend lists it and five rivals.
  await foundCompany(page);
  await page.evaluate(() => window.__pmo.setCamera(0, 0, 200, 0));
  await expect(page.getByRole('list', { name: 'Owners' }).getByRole('listitem')).toHaveCount(6);

  // 2. Open a lot on a neighbour and let a proxy bid. At 120x a lot runs 1.5 real seconds, too
  // short to type a ceiling, so the proxy goes in directly. In the first game day each rival bids
  // up to LM 232,848, its cash less three days of wages, so the ceiling is the founding cash.
  const neighbour = await nearestFreeSection(page);
  await page.evaluate((id) => window.__pmo.select({ kind: 'section', id }), neighbour);
  await page
    .getByTestId('context-panel')
    .getByRole('button', { name: 'Open an auction — LM 2,000.00' })
    .click();
  const proxy = await page.evaluate(async (id) => {
    for (;;) {
      const lot = window.__pmo
        .ui()!
        .auctions.find((a) => a.status === 'open' && a.lot.sectionId === id);
      if (lot) {
        return window.__pmo.send({ t: 'setProxy', auctionId: lot.id, ceilingCents: 25_000_000 });
      }
      await new Promise((done) => setTimeout(done, 20));
    }
  }, neighbour);
  expect(proxy).toEqual({ ok: true });
  await expect
    .poll(async () => (await snapshot(page)).sections.length, { timeout: 30_000 })
    .toBe(2);
  await page.evaluate(() => window.__pmo.select(null));

  // 3. A 3-month loan of LM 50,000.
  await openTab(page, 'Finance');
  const before = (await snapshot(page)).cashCents;
  await panel.getByLabel('Loan amount (LM)').fill('50000');
  await panel.getByRole('radio', { name: '3 months' }).check();
  await panel.getByRole('button', { name: 'Take loan' }).click();
  await expect(panel.getByRole('list', { name: 'Loans' })).toContainText('LM 50,000.00');
  expect((await snapshot(page)).cashCents).toBeGreaterThan(before + 4_000_000);

  // 4. 100 shares of a rival at market: the holding shows after the next hourly clearing.
  await panel.getByRole('table', { name: 'Stocks' }).getByRole('button', { name: RIVAL }).click();
  const form = panel.getByRole('form', { name: `Trade ${RIVAL} shares` });
  await form.getByRole('radio', { name: 'Buy' }).check();
  await form.getByRole('radio', { name: 'Market' }).check();
  await form.getByLabel('Shares').fill('100');
  await form.getByRole('button', { name: 'Place order' }).click();
  await expect(panel.getByText('You hold 100 shares.')).toBeVisible({ timeout: 15_000 });

  // 5. Rivals in the news: the ticker on desktop, the Finance tab on phones.
  const rivals = (await snapshot(page)).companies
    .filter((c) => c.kind === 'rival')
    .map((c) => c.name);
  const news =
    info.project.name === 'desktop'
      ? page.getByTestId('news-ticker')
      : panel.getByRole('list', { name: 'News' });
  await expect
    .poll(
      async () => {
        const text = (await news.textContent()) ?? '';
        return rivals.some((name) => text.includes(name));
      },
      { timeout: 30_000 },
    )
    .toBe(true);

  // 6. Reload: the company, the loan, the holding and both sections come back.
  await page.reload();
  await expect(page.getByTestId('top-bar')).toContainText('Selene Rock Co', { timeout: 20_000 });
  const back = await snapshot(page);
  expect(back.sections).toHaveLength(2);
  expect(back.finance!.loans.map((l) => l.principalCents)).toEqual([5_000_000]);
  const rival = back.companies.find((c) => c.name === RIVAL)!.id;
  expect(back.holdings).toContainEqual(
    expect.objectContaining({ holder: 0, companyId: rival, shares: 100 }),
  );
});

// At 6x, 7,500 real seconds away are 750 game hours: past the close at 2091-04-01 00:00.
test('a month passes: the Statements periods list 2091-03', async ({ page }) => {
  await gotoGame(page, { timescale: '6' });
  await foundCompany(page);
  await page.evaluate(() => window.__pmo.advanceRealMs(7_500_000));
  const away = page.getByRole('dialog', { name: 'While you were away' });
  await expect(away).toBeVisible({ timeout: 60_000 });
  await away.getByRole('button', { name: 'Back to work' }).click();
  await openTab(page, 'Finance');
  await expect(page.getByTestId('tab-panel').getByRole('radio', { name: '2091-03' })).toBeVisible();
});
