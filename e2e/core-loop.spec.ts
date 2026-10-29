import { expect, test, type Page } from '@playwright/test';
import { gotoGame, openTab } from './helpers';

const TIMESCALE = 120; // one game hour every half second
const snapshot = (page: Page) => page.evaluate(() => window.__pmo.ui()!);
/** What the page-side watchers saw: income tokens, and each rise of cash between snapshots. */
type Watch = { tokens: string[]; rises: number[] };
const ilmenite = async (page: Page) => (await snapshot(page)).sections[0]?.stockKg.ilmenite ?? 0;

// Seed 42 offers ilmenite deliveries from game hour 21 to 69 and 113 to 253, whenever the mine
// is built; the mine fills the depot with about 6 t an hour.
test('the core loop: found, build, sell, deliver, expand, and reload', async ({ page }, info) => {
  test.slow();
  await gotoGame(page, { timescale: String(TIMESCALE) });
  const panel = page.getByTestId('tab-panel');

  // 1. Found the company.
  const founding = page.getByRole('dialog', { name: 'Found your company' });
  await founding.getByLabel('Company name').fill('Selene Rock Co');
  await founding.getByRole('button', { name: 'Found company' }).click();
  await expect(page.getByTestId('top-bar')).toContainText('Selene Rock Co');

  // 2–3. Build a mine on the ilmenite deposit and wait until it works.
  await openTab(page, 'Build');
  await panel.getByRole('button', { name: 'Ilmenite deposit' }).first().click();
  await panel.getByRole('button', { name: 'Build Mine' }).click();
  await expect(panel).toContainText('Under construction');
  await expect(panel).not.toContainText('Under construction', { timeout: 20_000 });
  // Esc closes the tab and the mine's details, which cover Ox's portrait on phones.
  await page.keyboard.press('Escape');

  // 4. Pan and zoom a little, so the hub stays in sight for the income token; then hear Ox
  // out: the camera beat follows his welcome and ends at once.
  const map = (await page.getByTestId('map-canvas').boundingBox())!;
  const [cx, cy] = [map.x + map.width / 2, map.y + map.height / 2];
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 40, cy, { steps: 4 });
  await page.mouse.up();
  await page.mouse.wheel(0, -50);
  if (info.project.name === 'phone') {
    await page.getByRole('button', { name: 'Talk to Ox Varga' }).click();
  }
  const speech = info.project.name === 'phone' ? panel : page.getByTestId('companion');
  for (let i = 0; i < 3; i++) await speech.getByRole('button', { name: 'Next' }).click();
  await expect
    .poll(async () => (await snapshot(page)).story.codex, { timeout: 15_000 })
    .toContain('mech.camera');

  // 5–6. Sell 40 t of ilmenite at market: the fill pays, a token flies to the cash.
  await expect.poll(() => ilmenite(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(40_000);
  await openTab(page, 'Trade');
  await panel.getByRole('button', { name: /^Ilmenite/ }).click();
  await panel.getByRole('radio', { name: 'Sell' }).check();
  await panel.getByRole('radio', { name: 'Market' }).check();
  await panel.getByLabel('Amount (t)').fill('40');
  await expect(panel.getByTestId('quote')).toContainText('Estimated price', { timeout: 15_000 });
  // Tokens live for under a second and wages keep draining cash, so watchers on the page record
  // each token and each rise of cash between snapshots: only income makes cash rise.
  await page.evaluate(() => {
    const watch = window as unknown as Watch;
    watch.tokens = [];
    watch.rises = [];
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (n instanceof HTMLElement && n.classList.contains('income-token')) {
            watch.tokens.push(n.textContent ?? '');
          }
        }
      }
    }).observe(document.body, { childList: true });
    let last = window.__pmo.ui()!.cashCents;
    setInterval(() => {
      const cash = window.__pmo.ui()!.cashCents;
      if (cash > last) watch.rises.push(cash - last);
      last = cash;
    }, 20);
  });
  await panel.getByRole('button', { name: 'Place order' }).click();
  const watched = () =>
    page.evaluate((): Watch => {
      const { tokens, rises } = window as unknown as Watch;
      return { tokens, rises };
    });
  await expect
    .poll(async () => (await watched()).tokens, { timeout: 15_000 })
    .toContainEqual(expect.stringMatching(/^\+LM [\d,.]+$/));
  await expect.poll(async () => (await watched()).rises.length).toBeGreaterThan(0);
  await expect(panel.getByRole('list', { name: 'Recent fills' })).toContainText(
    'Sold 40.0 t Ilmenite',
  );

  // 7. Accept the ilmenite delivery and fill it from the depot.
  await openTab(page, 'Contracts');
  await panel
    .getByRole('region', { name: 'Offers' })
    .getByRole('article')
    .filter({ hasText: /Deliver [\d.,]+ t Ilmenite/ })
    .first() // hours 113 to 165 hold two of them
    .getByRole('button', { name: 'Accept' })
    .click({ timeout: 40_000 });
  const needKg = await page.evaluate(() => {
    const stage = window.__pmo.ui()!.contracts.find((c) => c.status === 'active')!.stages[0]!;
    return stage.kind === 'deliver' ? (stage.needKg.ilmenite ?? 0) : 0;
  });
  await expect.poll(() => ilmenite(page), { timeout: 40_000 }).toBeGreaterThanOrEqual(needKg);
  await panel
    .getByRole('region', { name: 'Active contracts' })
    .getByRole('button', { name: 'Deliver' })
    .click();
  await expect(panel.getByRole('region', { name: 'Finished contracts' })).toContainText(
    'Ilmenite',
    { timeout: 15_000 },
  );
  await panel.getByRole('button', { name: 'Close panel' }).click();

  // 8. Buy a neighbouring section: the starting cash covers the land office's LM 60,000.
  const neighbour = await page.evaluate(
    () => window.__pmo.world()!.sections.find((s) => s.buyable)!.id,
  );
  await page.evaluate((id) => window.__pmo.select({ kind: 'section', id }), neighbour);
  await page
    .getByTestId('context-panel')
    .getByRole('button', { name: 'Buy section — LM 60,000.00' })
    .click();
  await expect.poll(async () => (await snapshot(page)).sections.length).toBe(2);

  // 9. Reload: the autosave brings back the company, and the clock has kept time.
  const before = await page.evaluate(() => ({ tick: window.__pmo.ui()!.tick, at: Date.now() }));
  await page.reload();
  await expect(page.getByTestId('top-bar')).toContainText('Selene Rock Co', { timeout: 20_000 });
  const after = await page.evaluate(() => ({
    tick: window.__pmo.ui()!.tick,
    at: Date.now(),
    sections: window.__pmo.ui()!.sections.length,
    mine: window.__pmo.world()!.buildings.some((b) => b.type === 'mine'),
  }));
  const expected = before.tick + ((after.at - before.at) * TIMESCALE) / 1000;
  expect(Math.abs(after.tick - expected)).toBeLessThanOrEqual(TIMESCALE);
  expect(after.sections).toBe(2);
  expect(after.mine).toBe(true);
});
