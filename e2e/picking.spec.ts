import { expect, test } from '@playwright/test';
import { gotoGame } from './helpers';

test('tapping a deposit near the hub shows it in the context panel', async ({ page }) => {
  await gotoGame(page);
  await expect.poll(() => page.evaluate(() => window.__pmo.camera())).not.toBeNull();
  await page.evaluate(() =>
    window.__pmo.send({ t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' }),
  );
  await expect
    .poll(() =>
      page.evaluate(() => window.__pmo.world()?.sections.some((s) => s.owner === 'player')),
    )
    .toBe(true);
  const plotId = await page.evaluate(() => {
    const w = window.__pmo.world()!;
    const home = w.sections.find((s) => s.owner === 'player')!;
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
  const panel = page.getByTestId('context-panel');
  await expect(panel).toContainText('Deposit');
  await expect(panel).toContainText('Ilmenite');
});
