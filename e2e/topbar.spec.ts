import { expect, test } from '@playwright/test';
import { gotoGame } from './helpers';

// Frozen, so wages do not move the cash while the test reads it.
test.beforeEach(async ({ page }) => {
  await gotoGame(page, { freeze: '1' });
  await expect.poll(() => page.evaluate(() => window.__pmo.ui() !== null)).toBe(true);
  await page.evaluate(() =>
    window.__pmo.send({ t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' }),
  );
});

test('founding shows LM 250,000.00 in the top bar', async ({ page }) => {
  await expect(page.getByTestId('cash')).toHaveText('LM 250,000.00');
});

test('selecting a building shows its staffing in the context panel', async ({ page }) => {
  await expect
    .poll(() => page.evaluate(() => window.__pmo.ui()?.buildings.length ?? 0))
    .toBeGreaterThan(0);
  await page.evaluate(() => {
    const array = window.__pmo.ui()!.buildings.find((b) => b.type === 'solarArray')!;
    window.__pmo.select({ kind: 'building', id: array.id });
  });
  const panel = page.getByTestId('context-panel');
  await expect(panel).toContainText('Solar array');
  await expect(panel).toContainText('Technicians');
  await expect(panel).toContainText('1/1');
});
