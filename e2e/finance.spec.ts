import { expect, test, type Page } from '@playwright/test';
import { formatGameDate } from '../src/sim/clock';
import { formatMoney } from '../src/ui/format';
import { foundCompany, gotoGame, openTab } from './helpers';

async function finance(page: Page) {
  await gotoGame(page, { seed: '42', timescale: '60' });
  await foundCompany(page);
  await openTab(page, 'Finance');
  return page.getByTestId('tab-panel');
}

test('key F opens Finance; on phones it is under More', async ({ page }, info) => {
  await gotoGame(page, { seed: '42', timescale: '60' });
  await foundCompany(page);
  if (info.project.name === 'desktop') {
    await page.keyboard.press('f');
  } else {
    await page.getByTestId('bottom-tabs').getByRole('button', { name: 'More' }).click();
    await page.getByTestId('tab-panel').getByRole('button', { name: 'Finance' }).click();
  }
  await expect(
    page.getByTestId('tab-panel').getByRole('heading', { name: 'Statements' }),
  ).toBeVisible();
});

test('the balance sheet shows founding share capital', async ({ page }) => {
  const panel = await finance(page);
  const capital = await page.evaluate(() => window.__pmo.ui()!.finance!.balance.shareCapital);
  await expect(panel.getByRole('table', { name: 'Balance sheet' })).toContainText(
    formatMoney(capital),
  );
});

test('a 3-month loan of LM 50,000 raises cash and appears with its rate and due date', async ({
  page,
}) => {
  const panel = await finance(page);
  const before = await page.evaluate(() => window.__pmo.ui()!.cashCents);
  await panel.getByLabel('Loan amount (LM)').fill('50000');
  await panel.getByRole('radio', { name: '3 months' }).check();
  await panel.getByRole('button', { name: 'Take loan' }).click();
  const loans = panel.getByRole('list', { name: 'Loans' });
  await expect(loans).toContainText('LM 50,000.00');
  await expect(loans).toContainText('3.2% a month');
  const due = await page.evaluate(() => window.__pmo.ui()!.finance!.loans[0]!.dueTick);
  await expect(loans).toContainText(formatGameDate(due).slice(0, 10));
  // Cash rose by the loan, less a few game hours of wages while the test ran.
  expect(await page.evaluate(() => window.__pmo.ui()!.cashCents)).toBeGreaterThan(
    before + 4_000_000,
  );
  expect(await page.evaluate(() => window.__pmo.ui()!.finance!.balance.loans)).toBe(5_000_000);
});

test('buying 100 shares of Tycho Deepworks at market shows the holding after the next clearing', async ({
  page,
}) => {
  const panel = await finance(page);
  await panel
    .getByRole('table', { name: 'Stocks' })
    .getByRole('button', { name: 'Tycho Deepworks' })
    .click();
  const form = panel.getByRole('form', { name: 'Trade Tycho Deepworks shares' });
  await form.getByRole('radio', { name: 'Buy' }).check();
  await form.getByRole('radio', { name: 'Market' }).check();
  await form.getByLabel('Shares').fill('100');
  await form.getByRole('button', { name: 'Place order' }).click();
  await expect(panel.getByText('You hold 100 shares.')).toBeVisible({ timeout: 15_000 });
});
