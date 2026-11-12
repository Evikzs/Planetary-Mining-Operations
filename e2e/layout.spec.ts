import { expect, test, type Locator, type Page } from '@playwright/test';
import { foundCompany, gotoGame, openTab } from './helpers';

type Box = { x: number; y: number; width: number; height: number };

const box = async (l: Locator): Promise<Box> => (await l.boundingBox())!;
const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Founds, opens Build and selects the home section, so a tab and a selection show together. */
async function tabAndSelection(page: Page) {
  await foundCompany(page);
  await openTab(page, 'Build');
  const home = await page.evaluate(() => window.__pmo.ui()!.sections[0]!.id);
  await page.evaluate((id) => window.__pmo.select({ kind: 'section', id }), home);
  await expect(page.getByTestId('context-panel')).toBeVisible();
}

async function expectFits(page: Page) {
  const view = page.viewportSize()!;
  const parts = {
    tab: await box(page.getByTestId('tab-panel')),
    context: await box(page.getByTestId('context-panel')),
    top: await box(page.getByTestId('top-bar')),
    rail: await box(page.getByTestId('tab-rail')),
  };
  for (const b of Object.values(parts)) {
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(view.width + 1);
    expect(b.y + b.height).toBeLessThanOrEqual(view.height + 1);
  }
  expect(overlap(parts.tab, parts.context)).toBe(false);
  for (const panel of [parts.tab, parts.context]) {
    expect(overlap(panel, parts.top)).toBe(false);
    expect(overlap(panel, parts.rail)).toBe(false);
  }
  await expect(page.getByTestId('top-bar').getByRole('button', { name: '8×' })).toBeInViewport({
    ratio: 1,
  });
}

test('a tab and a selection fit side by side', async ({ page }) => {
  await gotoGame(page, { freeze: '1' });
  await tabAndSelection(page);
  await expectFits(page);
});

test('ui scale 150% still fits', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pmo.uiScale', '1.5'));
  await gotoGame(page, { freeze: '1' });
  await tabAndSelection(page);
  await expectFits(page);
});

test('the interface size choice scales the panels', async ({ page }) => {
  await gotoGame(page, { freeze: '1' });
  await foundCompany(page);
  const rail = page.getByTestId('tab-rail');
  const before = (await box(rail)).width;
  await openTab(page, 'Settings');
  await page
    .getByTestId('tab-panel')
    .getByRole('group', { name: 'Interface size' })
    .getByRole('radio', { name: '125%' })
    .check();
  await expect.poll(async () => (await box(rail)).width).toBeGreaterThan(before * 1.1);
});

test('ui scale does not move map picks', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pmo.uiScale', '1.25'));
  await gotoGame(page, { freeze: '1' });
  await foundCompany(page);
  const plotId = await page.evaluate(() => {
    const w = window.__pmo.world()!;
    const home = w.sections.find((s) => s.owner === 0)!;
    const used = new Set(w.buildings.map((b) => b.plotId));
    const plot = w.plots.find(
      (p) => p.sectionId === home.id && p.deposit?.goodId === 'ilmenite' && !used.has(p.id),
    )!;
    const [x, y, z] = plot.dir;
    window.__pmo.setCamera(
      (Math.asin(y) * 180) / Math.PI,
      (Math.atan2(x, z) * 180) / Math.PI,
      3,
      0,
    );
    return plot.id;
  });
  await expect.poll(() => page.evaluate((id) => window.__pmo.project(id), plotId)).not.toBeNull();
  const at = (await page.evaluate((id) => window.__pmo.project(id), plotId))!;
  await page.mouse.click(at.x, at.y);
  await expect(page.getByTestId('context-panel')).toContainText('Ilmenite');
});
