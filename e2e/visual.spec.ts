import { expect, test, type Page } from '@playwright/test';
import { gotoGame } from './helpers';

/** The frozen demo with the camera over its depot, once every chunk has streamed in. */
async function frame(page: Page, alt: number): Promise<void> {
  await gotoGame(page, { scene: 'demo', freeze: '1' });
  await expect
    .poll(() => page.evaluate(() => (window.__pmo.world()?.buildings.length ?? 0) > 5), {
      timeout: 30_000,
    })
    .toBe(true);
  await page.evaluate((alt) => {
    const w = window.__pmo.world()!;
    const depot = w.buildings.find((b) => b.type === 'depot')!;
    const [x, y, z] = w.plots.find((p) => p.id === depot.plotId)!.dir;
    window.__pmo.setCamera(
      (Math.asin(y) * 180) / Math.PI,
      (Math.atan2(x, z) * 180) / Math.PI,
      alt,
      0,
    );
  }, alt);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const s = window.__pmo.renderStats();
          return !!s && s.chunksVisible > 0 && s.chunksPending === 0;
        }),
      { timeout: 60_000 },
    )
    .toBe(true);
  await page.waitForTimeout(500);
}

// The interface chrome is masked: baselines judge the rendered map, not system font hinting.
const chrome = (page: Page) =>
  ['top-bar', 'tab-rail', 'bottom-tabs', 'map-filters', 'compass', 'news-ticker'].map((id) =>
    page.getByTestId(id),
  );

test('poster look: the demo at bird’s-eye', async ({ page }) => {
  await frame(page, 4);
  await expect(page).toHaveScreenshot('demo-birdseye.png', { mask: chrome(page) });
});

test('poster look: the Moon from altitude 200', async ({ page }) => {
  await frame(page, 200);
  await expect(page).toHaveScreenshot('planetary-200.png', { mask: chrome(page) });
});
