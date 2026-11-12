import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

// Test hosts have no GPU: WebGL 2 runs on SwiftShader, as in the browser e2e runs.
const SWITCHES = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

// The packaged app when PMO_APP_PATH names it; otherwise Electron on this checkout's build.
const launch = (userData: string): Promise<ElectronApplication> =>
  electron.launch({
    ...(process.env.PMO_APP_PATH
      ? { executablePath: process.env.PMO_APP_PATH, args: SWITCHES }
      : { args: ['.', ...SWITCHES] }),
    env: { ...process.env, PMO_USER_DATA: userData },
  });

let userData = '';
test.beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pmo-app-'));
});
test.afterEach(() => fs.rmSync(userData, { recursive: true, force: true }));

test('the app founds a company, saves on quit and loads it paused', async () => {
  const app = await launch(userData);
  const page = await app.firstWindow();
  const founding = page.getByRole('dialog', { name: 'Found your company' });
  await expect(founding).toBeVisible({ timeout: 30_000 });
  await founding.getByLabel('Company name').fill('Selene Rock Co');
  await founding.getByRole('button', { name: 'Found company' }).click();
  await expect(page.getByTestId('top-bar')).toContainText('Selene Rock Co');
  await app.close();
  const saves = fs.readdirSync(path.join(userData, 'saves'));
  expect(saves.some((f) => /^auto-[0-2]\.json$/.test(f))).toBe(true);

  const again = await launch(userData);
  const page2 = await again.firstWindow();
  await expect(page2.getByTestId('top-bar')).toContainText('Selene Rock Co', { timeout: 30_000 });
  await expect(page2.getByTestId('paused')).toBeVisible();
  await again.close();
});

test('the window refuses to shrink below 1280x720', async () => {
  const app = await launch(userData);
  await app.firstWindow();
  const size = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]!;
    win.setSize(800, 600);
    return win.getSize();
  });
  expect(size[0]).toBeGreaterThanOrEqual(1280);
  expect(size[1]).toBeGreaterThanOrEqual(720);
  await app.close();
});

test('an external link opens outside the app', async () => {
  const app = await launch(userData);
  const page = await app.firstWindow();
  await expect(page.getByRole('dialog', { name: 'Found your company' })).toBeVisible({
    timeout: 30_000,
  });
  const opened = await app.evaluate(({ shell }) => {
    const urls: string[] = [];
    shell.openExternal = (url: string) => {
      urls.push(url);
      return Promise.resolve();
    };
    (globalThis as { pmoOpened?: string[] }).pmoOpened = urls;
    return true;
  });
  expect(opened).toBe(true);
  await page.evaluate(() => window.open('https://example.com/'));
  await expect
    .poll(() => app.evaluate(() => (globalThis as { pmoOpened?: string[] }).pmoOpened ?? []))
    .toEqual(['https://example.com/']);
  expect(app.windows()).toHaveLength(1);
  await app.close();
});

test('a second start quits and leaves the first window alone', async () => {
  const app = await launch(userData);
  await app.firstWindow();
  const electronPath = createRequire(import.meta.url)('electron') as string;
  const second = process.env.PMO_APP_PATH
    ? spawn(process.env.PMO_APP_PATH, SWITCHES, {
        env: { ...process.env, PMO_USER_DATA: userData },
      })
    : spawn(electronPath, ['.', ...SWITCHES], { env: { ...process.env, PMO_USER_DATA: userData } });
  const code = await new Promise<number | null>((resolve) => {
    const timer = setTimeout(() => {
      second.kill();
      resolve(-1);
    }, 15_000);
    second.on('exit', (c) => {
      clearTimeout(timer);
      resolve(c);
    });
  });
  expect(code).toBe(0);
  expect(app.windows()).toHaveLength(1);
  await app.close();
});
