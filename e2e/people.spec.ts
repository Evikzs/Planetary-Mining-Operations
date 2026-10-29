import { expect, test } from '@playwright/test';
import { gotoGame } from './helpers';

// Frozen, so the hourly hiring round does not undo what the test changes.
test.beforeEach(async ({ page }) => {
  await gotoGame(page, { scene: 'bench', freeze: '1' });
  await expect
    .poll(() => page.evaluate(() => window.__pmo.ui()?.workforce.total ?? 0), { timeout: 30_000 })
    .toBe(10_000);
  await page.keyboard.press('2');
});

test('the list renders only the rows in view and reaches worker 10,000', async ({ page }) => {
  const list = page.getByRole('list', { name: 'Workers' });
  await expect(list.getByRole('listitem').first()).toBeVisible();
  expect(await list.getByRole('listitem').count()).toBeLessThan(60);
  await list.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(list.locator('[aria-posinset="10000"]')).toBeVisible();
});

test('the Engineer filter shows only engineers', async ({ page }) => {
  await page.getByLabel('Skill').selectOption('engineer');
  const rows = page.getByRole('list', { name: 'Workers' }).getByRole('listitem');
  await expect(rows.first()).toContainText('Engineer');
  const texts = await rows.allTextContents();
  expect(texts.every((t) => t.includes('Engineer'))).toBe(true);
});

test('assigning a worker changes their job in the next page', async ({ page }) => {
  const first = page.getByRole('list', { name: 'Workers' }).getByRole('listitem').first();
  const card = page.getByTestId('worker');
  await first.getByRole('button').click();
  await card.getByRole('button', { name: 'Unassign' }).click();
  await card.getByRole('button', { name: 'All workers' }).click();
  await expect(first).toContainText('No job');
  await first.getByRole('button').click();
  await card.getByRole('button', { name: 'Assign', exact: true }).click();
  await card.getByRole('button', { name: 'All workers' }).click();
  await expect(first).not.toContainText('No job');
});
