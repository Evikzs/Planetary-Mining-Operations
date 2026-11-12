import { expect, test, type Page } from '@playwright/test';
import { foundCompany, gotoGame, openTab } from './helpers';

const tick = (page: Page) => page.evaluate(() => window.__pmo.ui()!.tick);
const clockBar = (page: Page) => page.getByTestId('top-bar');

test.beforeEach(async ({ page }) => {
  await gotoGame(page);
  await foundCompany(page);
});

test('space pauses and resumes the clock', async ({ page }) => {
  await page.keyboard.press('Space');
  await expect(page.getByTestId('paused')).toBeVisible();
  const held = await tick(page);
  await page.waitForTimeout(1500);
  expect(await tick(page)).toBe(held);
  await page.keyboard.press('Space');
  await expect(page.getByTestId('paused')).toBeHidden();
  await expect.poll(() => tick(page)).toBeGreaterThan(held);
});

test('keys 1 to 4 set the speed', async ({ page }) => {
  await page.keyboard.press('4');
  await expect(clockBar(page).getByRole('button', { name: '8×' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('2');
  await expect(clockBar(page).getByRole('button', { name: '2×' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('paused')).toBeHidden();
});

test('keys do nothing while typing', async ({ page }) => {
  await page.keyboard.press('o');
  const panel = page.getByTestId('tab-panel');
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText('Settings');
  await panel.getByLabel('Paste a save code').fill('');
  await panel.getByLabel('Paste a save code').pressSequentially('f 4');
  await expect(panel.getByRole('heading', { level: 2 })).toHaveText('Settings');
  await expect(page.getByTestId('paused')).toBeHidden();
  await expect(clockBar(page).getByRole('button', { name: '1×' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('letter keys open tabs', async ({ page }) => {
  const heading = page.getByTestId('tab-panel').getByRole('heading', { level: 2 });
  for (const [key, label] of [
    ['b', 'Build'],
    ['p', 'People'],
    ['t', 'Trade'],
    ['f', 'Finance'],
    ['c', 'Contracts'],
    ['k', 'Codex'],
    ['o', 'Settings'],
  ] as const) {
    await page.keyboard.press(key);
    await expect(heading).toHaveText(label);
  }
});

test('settings lists every key', async ({ page }) => {
  await openTab(page, 'Settings');
  const keys = page.getByTestId('tab-panel').getByRole('table', { name: 'Keys' });
  for (const k of [
    'Space',
    '1–4',
    'B',
    'P',
    'T',
    'F',
    'C',
    'K',
    'O',
    'W A S D',
    'Q E',
    'N',
    '+ -',
    'Esc',
  ]) {
    await expect(keys.getByRole('cell', { name: k, exact: true })).toBeVisible();
  }
});

test('the offline setting persists', async ({ page }) => {
  await openTab(page, 'Settings');
  const box = page
    .getByTestId('tab-panel')
    .getByRole('checkbox', { name: 'Run the world while closed' });
  await expect(box).toBeChecked();
  await box.uncheck();
  await page.reload();
  await expect(page.getByTestId('top-bar')).toContainText('Selene Rock Co');
  await openTab(page, 'Settings');
  await expect(
    page.getByTestId('tab-panel').getByRole('checkbox', { name: 'Run the world while closed' }),
  ).not.toBeChecked();
});

test('a held key does not repeat its shortcut', async ({ page }) => {
  await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', code: 'Space', repeat: true, bubbles: true }),
    ),
  );
  await page.waitForTimeout(500);
  await expect(page.getByTestId('paused')).toBeHidden();
});

test('shortcuts still work after clicking a setting', async ({ page }) => {
  await openTab(page, 'Settings');
  await page
    .getByTestId('tab-panel')
    .getByRole('checkbox', { name: 'Run the world while closed' })
    .click();
  await page.keyboard.press('b');
  await expect(page.getByTestId('tab-panel').getByRole('heading', { level: 2 })).toHaveText(
    'Build',
  );
});

test('the offline setting states its cap in time away', async ({ page }) => {
  await openTab(page, 'Settings');
  await expect(page.getByTestId('tab-panel')).toContainText('up to 8 hours of time away');
});
