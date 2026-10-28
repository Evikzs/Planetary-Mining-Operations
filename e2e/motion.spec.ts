import { expect, test } from '@playwright/test';
import { gotoGame } from './helpers';

test('the demo shows buses and crates at bird’s-eye over the founding section', async ({
  page,
}) => {
  await gotoGame(page, { scene: 'demo', freeze: '1' });
  await expect
    .poll(() => page.evaluate(() => (window.__pmo.world()?.belts.length ?? 0) > 0), {
      timeout: 30_000,
    })
    .toBe(true);
  await page.evaluate(() => {
    const w = window.__pmo.world()!;
    const depot = w.buildings.find((b) => b.type === 'depot')!;
    const [x, y, z] = w.plots.find((p) => p.id === depot.plotId)!.dir;
    window.__pmo.setCamera(
      (Math.asin(y) * 180) / Math.PI,
      (Math.atan2(x, z) * 180) / Math.PI,
      5,
      0,
    );
  });
  await expect
    .poll(() => page.evaluate(() => window.__pmo.renderStats()?.rovers ?? 0))
    .toBeGreaterThan(0);
  await expect
    .poll(() => page.evaluate(() => window.__pmo.renderStats()?.crates ?? 0))
    .toBeGreaterThan(0);
});
