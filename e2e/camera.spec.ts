import { expect, test } from '@playwright/test';
import { gotoGame } from './helpers';

const camera = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.__pmo.camera());

test.beforeEach(async ({ page }) => {
  await gotoGame(page);
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

test('a two-pointer pinch changes the altitude', async ({ page }) => {
  const before = (await camera(page))!.altitude;
  await page.getByTestId('map-canvas').evaluate((el) => {
    const fire = (type: string, pointerId: number, x: number, y: number) =>
      el.dispatchEvent(
        new PointerEvent(type, {
          pointerId,
          clientX: x,
          clientY: y,
          bubbles: true,
          isPrimary: pointerId === 1,
        }),
      );
    fire('pointerdown', 1, 300, 400);
    fire('pointerdown', 2, 340, 400);
    for (let i = 1; i <= 5; i++) fire('pointermove', 2, 340 + i * 30, 400);
    fire('pointerup', 2, 490, 400);
    fire('pointerup', 1, 300, 400);
  });
  expect((await camera(page))!.altitude).toBeLessThan(before);
});

test('N toggles lock north', async ({ page }) => {
  expect((await camera(page))!.lockNorth).toBe(true);
  await page.keyboard.press('n');
  expect((await camera(page))!.lockNorth).toBe(false);
  await page.keyboard.press('n');
  expect((await camera(page))!.lockNorth).toBe(true);
});
