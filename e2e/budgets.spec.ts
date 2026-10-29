import { expect, test } from '@playwright/test';
import { gotoGame } from './helpers';

// The plan's render budgets, over the busiest section of the 10,000-worker bench, at both ends
// of the bird's-eye range.
test('the bench at bird’s-eye stays under 300 draw calls and 1.5 M triangles', async ({ page }) => {
  test.slow();
  await gotoGame(page, { scene: 'bench', freeze: '1' });
  await expect
    .poll(() => page.evaluate(() => (window.__pmo.world()?.buildings.length ?? 0) > 100), {
      timeout: 60_000,
    })
    .toBe(true);
  for (const alt of [1.5, 4]) {
    await page.evaluate((alt) => {
      const w = window.__pmo.world()!;
      const sectionOf = new Map(w.plots.map((p) => [p.id, p.sectionId]));
      const count = new Map<number, number>();
      for (const b of w.buildings) {
        const s = sectionOf.get(b.plotId)!;
        count.set(s, (count.get(s) ?? 0) + 1);
      }
      const busiest = [...count].sort((a, b) => b[1] - a[1])[0]![0];
      const [x, y, z] = w.plots.find((p) => p.sectionId === busiest && p.kind === 'hub')!.dir;
      const deg = (r: number) => (r * 180) / Math.PI;
      window.__pmo.setCamera(deg(Math.asin(y)), deg(Math.atan2(x, z)), alt, 0);
    }, alt);
    // Two frames, so the streamer has asked for the chunks of the new view.
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
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
    const stats = (await page.evaluate(() => window.__pmo.renderStats()))!;
    expect(stats.drawCalls, `draw calls at altitude ${alt}`).toBeLessThan(300);
    expect(stats.triangles, `triangles at altitude ${alt}`).toBeLessThan(1_500_000);
  }
});
