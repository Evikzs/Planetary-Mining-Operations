import { expect, test } from '@playwright/test';
import { foundCompany, gotoGame, openTab } from './helpers';

// Frozen at 1x: a reload a few seconds later stays well short of the 10 game hours that bring
// up the away page.
// The worker takes a few seconds to generate a new Moon, more with other tests running beside.
const NEW_WORLD = { timeout: 20_000 };
test.beforeEach(async ({ page }) => {
  await gotoGame(page, { freeze: '1', timescale: '1' });
  await foundCompany(page);
  await openTab(page, 'Settings');
});

// The next two tests build a second Moon and then the first again: each new world streams in
// its terrain under SwiftShader, so they get the slow-test allowance.
test('export, new game and import bring the company back', async ({ page }) => {
  test.slow();
  const panel = page.getByTestId('tab-panel');
  await panel.getByRole('button', { name: 'Export save' }).click();
  const exported = panel.getByLabel('Your save code');
  await expect(exported).toHaveValue(/^PMO1\./);
  const code = await exported.inputValue();

  await panel.getByRole('button', { name: 'New game' }).click();
  await expect(panel).toContainText(
    'This replaces your current company. Export first if you want to keep it.',
  );
  await panel.getByRole('button', { name: 'Start a new game' }).click();
  const founding = page.getByRole('dialog', { name: 'Found your company' });
  await expect(founding).toBeVisible(NEW_WORLD);

  await founding.getByText('Load a save').click();
  await founding.getByLabel('Paste a save code').fill(code);
  await founding.getByRole('button', { name: 'Import' }).click();
  await expect(founding).toBeHidden(NEW_WORLD);
  await expect(page.getByTestId('top-bar')).toContainText('Selene Rock Co');
});

test('a save slot keeps the company through a new game', async ({ page }) => {
  test.slow();
  const panel = page.getByTestId('tab-panel');
  const slot = panel.getByRole('group', { name: 'Slot 1' });
  await expect(slot).toContainText('Empty');
  await slot.getByRole('button', { name: 'Save' }).click();
  await expect(slot).toContainText('Selene Rock Co');

  await panel.getByRole('button', { name: 'New game' }).click();
  await panel.getByRole('button', { name: 'Start a new game' }).click();
  const founding = page.getByRole('dialog', { name: 'Found your company' });
  await founding.getByText('Load a save').click();
  await founding
    .getByRole('group', { name: 'Slot 1' })
    .getByRole('button', { name: 'Load' })
    .click();
  await expect(founding).toBeHidden(NEW_WORLD);
  await expect(page.getByTestId('top-bar')).toContainText('Selene Rock Co');
});

test('a code that is not a save is refused', async ({ page }) => {
  const panel = page.getByTestId('tab-panel');
  await panel.getByLabel('Paste a save code').fill('hello');
  await panel.getByRole('button', { name: 'Import' }).click();
  await expect(panel).toContainText('That code is not a valid save.');
  await expect(page.getByTestId('top-bar')).toContainText('Selene Rock Co');
});

test('reduced motion can be forced on, and stays on after a reload', async ({ page }) => {
  const camera = () => page.evaluate(() => window.__pmo.camera());
  await page.evaluate(() => window.__pmo.setCamera(-70, 30, 20, 0));
  const before = await camera();
  const motion = page.getByTestId('tab-panel').getByRole('group', { name: 'Reduced motion' });
  await motion.getByRole('radio', { name: 'On' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  // The map starts over for the new setting, but the camera stays where it was.
  await expect.poll(async () => (await camera())?.altitude).toBeCloseTo(20, 6);
  expect((await camera())?.pos).toEqual(before?.pos);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await openTab(page, 'Settings');
  await motion.getByRole('radio', { name: 'Off' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
});

test('muting tutorial hints silences the companion', async ({ page }) => {
  await page.getByTestId('tab-panel').getByRole('checkbox', { name: 'Tutorial hints' }).uncheck();
  await expect
    .poll(() => page.evaluate(() => window.__pmo.ui()?.story.muted ?? []))
    .toContain('tutorial');
  await expect.poll(() => page.evaluate(() => window.__pmo.ui()?.story.line ?? null)).toBeNull();
});
