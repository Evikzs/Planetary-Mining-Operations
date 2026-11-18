import { expect, test } from '@playwright/test';
import { foundCompany, gotoGame } from './helpers';

test('the Sol crumb rises to the view of Sol; Luna leads back down to the Moon', async ({
  page,
}) => {
  test.slow();
  await gotoGame(page, { freeze: '1' });
  await foundCompany(page);
  const gauge = page.getByTestId('depth-gauge');
  await page
    .getByRole('navigation', { name: 'Location' })
    .getByRole('button', { name: 'Sol' })
    .click();
  await expect(gauge.getByRole('button', { name: 'System' })).toHaveAttribute(
    'aria-current',
    'true',
    { timeout: 30_000 },
  );
  await expect(gauge).toContainText('From the Sun');
  // The names of the worlds are marks in the scene, not controls for screen readers.
  const luna = page.locator('.label[data-kind="world"]', { hasText: 'Luna' });
  await expect(luna).toBeVisible({ timeout: 30_000 });
  await luna.click();
  const sheet = page.getByTestId('context-panel');
  await expect(sheet).toContainText('Your charter');
  await sheet.getByRole('button', { name: 'Go down to Luna' }).click();
  await expect(gauge.getByRole('button', { name: 'Orbit' })).toHaveAttribute(
    'aria-current',
    'true',
    { timeout: 30_000 },
  );
  await expect(gauge).toContainText('From the ground');
});
