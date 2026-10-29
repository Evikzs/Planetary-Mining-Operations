import { expect, test } from '@playwright/test';
import { gotoGame } from './helpers';

test('a new player founds a company and Ox Varga speaks', async ({ page }, info) => {
  await gotoGame(page);
  const founding = page.getByRole('dialog', { name: 'Found your company' });
  await expect(founding).toBeVisible();
  const name = founding.getByLabel('Company name');
  await name.fill('ab');
  await expect(founding).toContainText('Use 3 to 32 letters, numbers or spaces.');
  await expect(founding.getByRole('button', { name: 'Found company' })).toBeDisabled();
  await expect(founding.getByRole('radio', { name: /Ox Varga/ })).toBeChecked();
  await expect(founding.getByRole('radio', { name: /Ship AI/ })).toBeDisabled();
  await name.fill('Selene Rock Co');
  await expect(founding).not.toContainText('Use 3 to 32 letters');
  await founding.getByRole('button', { name: 'Found company' }).click();

  await expect(founding).toBeHidden();
  await expect(page.getByTestId('top-bar')).toContainText('Selene Rock Co');
  // The camera flies down to the founding hub.
  await expect
    .poll(() => page.evaluate(() => window.__pmo.camera()?.altitude ?? 0))
    .toBeLessThan(5);
  if (info.project.name === 'phone') {
    await page.getByRole('button', { name: 'Talk to Ox Varga' }).click();
  }
  await expect(page.getByText(/Ox Varga\. Thirty years cutting rock/)).toBeVisible();
});

test('Advanced founds the company on the chosen world seed', async ({ page }) => {
  await gotoGame(page);
  const founding = page.getByRole('dialog', { name: 'Found your company' });
  await founding.getByText('Advanced').click();
  await founding.getByLabel('World seed').fill('7');
  await founding.getByLabel('Company name').fill('Seven Rocks');
  await founding.getByRole('button', { name: 'Found company' }).click();
  // Seed 7 is a new Moon for the worker to generate first.
  await expect(page.getByTestId('top-bar')).toContainText('Seven Rocks', { timeout: 20_000 });
  expect(await page.evaluate(() => window.__pmo.world()?.seed)).toBe(7);
});
