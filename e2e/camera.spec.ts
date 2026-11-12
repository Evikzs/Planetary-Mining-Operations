import { expect, test } from '@playwright/test';
import { foundCompany, gotoGame } from './helpers';

const camera = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.__pmo.camera());

test.beforeEach(async ({ page }) => {
  await gotoGame(page);
  await foundCompany(page);
  await expect.poll(() => camera(page)).not.toBeNull();
  await page.evaluate(() => window.__pmo.setCamera(-70, 30, 20, 0));
});

test('dragging the map pans the camera', async ({ page }) => {
  const before = (await camera(page))!.pos;
  const box = (await page.getByTestId('map-canvas').boundingBox())!;
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 120, y + 80, { steps: 6 });
  await page.mouse.up();
  const after = (await camera(page))!.pos;
  expect(
    Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]),
  ).toBeGreaterThan(0.01);
});

test('right-drag turns the camera; the wheel zooms', async ({ page }) => {
  const before = (await camera(page))!;
  const box = (await page.getByTestId('map-canvas').boundingBox())!;
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(x + 120, y, { steps: 6 });
  await page.mouse.up({ button: 'right' });
  const turned = (await camera(page))!;
  expect(turned.lockNorth).toBe(false);
  expect(turned.pos).toEqual(before.pos);
  await page.mouse.wheel(0, -400);
  await expect.poll(async () => (await camera(page))!.altitude).toBeLessThan(before.altitude);
});

test('N toggles lock north', async ({ page }) => {
  expect((await camera(page))!.lockNorth).toBe(true);
  await page.keyboard.press('n');
  expect((await camera(page))!.lockNorth).toBe(false);
  await page.keyboard.press('n');
  expect((await camera(page))!.lockNorth).toBe(true);
});
