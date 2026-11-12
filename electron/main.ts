// The desktop app: one window over the web build, served from app://, with saves as files.
import { app, BrowserWindow, ipcMain, Menu, net, protocol, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { listSlots, readSlot, removeSlot, writeSlot } from './saveFiles.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(here, '..', 'dist');
const MIN = { width: 1280, height: 720 };
const CLOSE_WAIT_MS = 2000;
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
].join('; ');

// Tests run the app against a throwaway profile.
if (process.env.PMO_USER_DATA) app.setPath('userData', process.env.PMO_USER_DATA);

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const savesDir = () => path.join(app.getPath('userData'), 'saves');
const boundsFile = () => path.join(app.getPath('userData'), 'window.json');

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}

function loadWindowState(): WindowState {
  try {
    const s = JSON.parse(fs.readFileSync(boundsFile(), 'utf8')) as Partial<WindowState>;
    if (typeof s.width === 'number' && typeof s.height === 'number') {
      return {
        x: s.x,
        y: s.y,
        width: Math.max(MIN.width, s.width),
        height: Math.max(MIN.height, s.height),
        maximized: s.maximized === true,
      };
    }
  } catch {
    // No saved window yet, or a broken file: start with the default.
  }
  return { width: 1600, height: 900, maximized: false };
}

/** Serves dist/ for app://game/…; a path that climbs out of dist/ is refused. */
function serveApp(): void {
  protocol.handle('app', async (req) => {
    const { pathname } = new URL(req.url);
    const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
    const file = path.normalize(path.join(DIST, rel));
    if (!file.startsWith(DIST + path.sep)) return new Response('Not found', { status: 404 });
    const res = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(res.headers);
    headers.set('Content-Security-Policy', CSP);
    return new Response(res.body, { status: res.status, headers });
  });
}

function handleSaves(): void {
  ipcMain.handle('saves:list', () => listSlots(savesDir()));
  ipcMain.handle('saves:read', (_e, slot: string) => readSlot(savesDir(), slot));
  ipcMain.handle('saves:write', (_e, slot: string, text: string) =>
    writeSlot(savesDir(), slot, text),
  );
  ipcMain.handle('saves:remove', (_e, slot: string) => removeSlot(savesDir(), slot));
}

const isWebLink = (url: string) => /^https?:\/\//.test(url);

function createWindow(): void {
  const state = loadWindowState();
  const win = new BrowserWindow({
    ...state,
    minWidth: MIN.width,
    minHeight: MIN.height,
    autoHideMenuBar: true,
    backgroundColor: '#1b2340',
    title: 'Planetary Mining Operations',
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (state.maximized) win.maximize();

  // Web links open in the system browser; the window never leaves the game.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isWebLink(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('app://') || url === process.env.PMO_DEV_URL) return;
    e.preventDefault();
    if (isWebLink(url)) void shell.openExternal(url);
  });
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') win.setFullScreen(!win.isFullScreen());
  });

  // The page saves before the window goes: it has up to 2 s.
  let closing = false;
  win.on('close', (e) => {
    const bounds = win.getNormalBounds();
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(boundsFile(), JSON.stringify({ ...bounds, maximized: win.isMaximized() }));
    if (closing) return;
    e.preventDefault();
    closing = true;
    const done = () => {
      if (!win.isDestroyed()) win.destroy();
    };
    ipcMain.once('app:close-ready', done);
    setTimeout(done, CLOSE_WAIT_MS);
    win.webContents.send('app:close-request');
  });

  void win.loadURL(process.env.PMO_DEV_URL ?? 'app://game/');
}

void app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  serveApp();
  handleSaves();
  createWindow();
});

// The app quits when its window closes, on every OS.
app.on('window-all-closed', () => app.quit());
