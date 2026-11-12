# D1 design: the desktop conversion

- **Status:** design approved in conversation on 2026-11-12. This file waits for the owner's review.
- **Parent:** [the game design specification](2026-10-27-planetary-mining-operations-design.md). Its sections 1, 2, 3, 9, 11, 13, 14 and 15 now describe the desktop game.
- **Order:** D1 comes before M2b. The [M2b design](2026-11-12-m2b-research-people-logistics-design.md) is unchanged except for the notes in section 7 below.

## 1. Owner decisions (2026-11-12)

| Topic | Decision |
|---|---|
| Platform | A desktop game. The mobile version is dropped. The end goal is a Steam release, much later. |
| Graphics | All current graphics are placeholder. They are redone later. Do not spend work on art until then. |
| Time | Hybrid: pause and speeds while playing, and an optional offline catch-up when the game opens again. |
| App | An Electron desktop app now. The web build stays as the playtest link. |
| Target | Mouse and keyboard. Minimum window 1280×720, designed at 1920×1080, a UI scale setting. Gamepad waits. |

## 2. Time

### 2.1 Pause and speeds

- Four speeds: 1×, 2×, 4× and 8×. At 1×, 1 game hour takes 1 real minute, as before.
- Pause stops the game clock. Commands still work while paused: build, bid, trade orders, research, staffing. Their effects show on the next tick.
- Controls: a pause button and four speed buttons beside the date in the top bar. Space toggles pause. Keys `1`–`4` set the speeds. While paused, the date block shows a "Paused" stamp.
- A new game starts at 1×, running. A loaded game starts paused.
- Speed and pause are not part of the simulation state. They change only how many ticks run each real second, so the same commands still give the same state hash.
- The simulation host's tick budget per pump stays as it is. At 8× it runs 8 fine ticks a real second. If a pump cannot keep up, the clock falls behind and the top bar shows the real speed.
- The dev URL flag `?timescale=` stays for tests (1–600). The test hook `__pmo.freeze(on)` becomes the real pause.

### 2.2 Game-time wording

The simulation already counts in ticks (1 tick = 1 game minute). Only the wording changes:

- Auctions: a lot runs 3 game hours (180 ticks); a bid in the last 30 game minutes adds 30; no lot runs past 10 game hours.
- Every "real minutes" or "real seconds" in data comments, copy, the Codex and the README becomes game time.
- Pacing and bot targets count game days at 1×. "Real day 1" becomes "game days 1–60".

### 2.3 Offline catch-up (optional)

- A setting, "Run the world while closed", default on.
- On load, catch-up runs only if the setting is on and the game was running (not paused) when it was saved. Otherwise the game resumes at the saved tick, paused.
- Cap (8 hours), efficiency (50%), the progress bar and the "While you were away" page do not change.
- A save records whether the clock was paused.

## 3. The desktop app (Electron)

### 3.1 Structure

- `electron/main.ts`, `electron/saveFiles.ts` and `electron/preload.cts` (CommonJS, as sandboxed preloads must be), built with `tsc` into `dist-electron/`.
- The main process serves the Vite build from a custom `app://` protocol. It does not load `file://` URLs and does not open remote pages.
- Security: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, a strict Content-Security-Policy, and no remote content. Links to the web open in the system browser.
- One window: minimum 1280×720, default 1600×900, its size, position and maximised state remembered in the user-data folder. F11 toggles fullscreen. No menu bar.
- The app quits when its window closes. The page saves on `beforeunload`, and the main process waits up to 2 seconds for that save.
- Dev: `npm run app` builds the game and starts the app. For hot reload, run `npm run dev` and start the app with `PMO_DEV_URL=http://localhost:5173 npx electron .`.

### 3.2 Saves

- The preload exposes one small API, `pmoSaves`: `list`, `read`, `write` and `remove`. Each call names a slot. The main process checks the slot name against a fixed pattern before it touches a file.
- Files live in `<userData>/saves/`, one JSON file per slot, written to a temporary file and then renamed, so a crash never leaves half a save.
- `createFileSaveStore()` implements the existing `SaveStore` interface on top of `pmoSaves`. The app uses it when `pmoSaves` exists. The web build keeps `createIdbSaveStore()`.
- Export codes still move a game between the app and the web build.

### 3.3 Packaging

- `electron-builder` makes unpacked directories, the form Steam takes.
- `npm run package` builds the directory for the current OS.
- CI builds the Linux directory and runs the Electron smoke test on it. Windows and macOS builds, signing and the Steamworks SDK wait for the Steam milestone (S1).
- Electron and `electron-builder` are pinned dev dependencies. They add nothing to the web bundle.

## 4. Desktop UI

### 4.1 Removed

- `BottomTabs`, `Sheet`, the More menu and the `isDesktop` breakpoint signal (`useBreakpoint.ts`).
- Phone CSS, the phone layout attribute and every phone branch in the components.
- Pinch and two-finger twist in the camera controller.
- The `phone` Playwright project and the phone branches of the e2e helpers.

### 4.2 Layout and scale

- One layout: the left tab rail, the top bar, the right context panel, the bottom news ticker and companion. It is designed at 1920×1080 and must work at 1280×720 with a tab open and a selection in the context panel.
- **UI scale** in Settings: 80%, 90%, 100%, 110%, 125% and 150%. It scales the whole interface with CSS `zoom` on one HUD layer above the map (the stylesheet sizes in px, so a root font size would scale nothing). The map stays outside the layer, so picks keep their coordinates. Default: 100%, or 90% when the window is under 1440 px wide at first start.
- The 3D view fills the space the panels leave.

### 4.3 Mouse

- Hover tooltips on every icon button, top-bar figure and map chip. They show after 400 ms and name the control and its key.
- Right-click cancels the current tool or clears the selection. It never opens the browser menu over the game.
- Right-drag turns the camera. Left-drag pans. The wheel zooms.

### 4.4 Keys

| Key | Action |
|---|---|
| Space | Pause or resume |
| `1`–`4` | Speed 1×, 2×, 4×, 8× |
| `B` | Build |
| `P` | People |
| `T` | Trade |
| `F` | Finance |
| `C` | Contracts |
| `R` | Research (M2b) |
| `K` | Codex |
| `O` | Settings |
| `W` `A` `S` `D` | Pan |
| `Q` `E` | Turn |
| `N` | Lock north |
| `+` `-` | Zoom |
| Esc | Close the panel, cancel the tool, or clear the selection |

Keys do nothing while a text field has focus. Settings lists every key.

### 4.5 Copy

"Tap", "phone", "swipe" and "sheet" go from the UI copy, the Codex and the companion lines. "Click" replaces "tap".

## 5. Graphics as placeholder

- The parent spec's art direction (section 9.6) and the README say that all current graphics are placeholder.
- The pixel-snapshot tests (`e2e/visual.spec.ts` and its snapshots) go. Render smoke tests (WebGL starts, frames draw, picking works) and motion tests (rovers and crates move) stay.
- No art work until the redo: no new models, shaders, palettes or icons in D1. New UI keeps the current tokens.

## 6. Tests and CI

- Playwright projects: `desktop` at 1920×1080 and `desktop-min` at 1280×720. Each spec runs on both.
- An Electron smoke test: start the packaged app, found a company, save, quit, start again and find the company.
- Unit tests: pause holds the tick; each speed runs its share of ticks; a loaded game starts paused; catch-up runs only when the setting is on and the save was running; the file save store writes atomically and refuses bad slot names.
- The balance bot counts game days at 1×. Its targets do not change.
- CI: check, build, size, e2e on both viewports, and the Linux app build with its smoke test.
- Pages still deploys the web build from `claude/vibrant-goodall-teqhde`.

## 7. Changes to the M2b design

- The Research tab opens with `R`. It shows the six branches as columns. There is no phone layout.
- Bot targets count the first 60 game days at 1× instead of the first real day.
- Patent terms stay 720 game days.
- End-to-end tests run on the two desktop viewports.

## 8. Out of scope

- Steam: Steamworks, achievements on Steam, cloud saves, Windows and macOS builds, signing (S1).
- Gamepad and Steam Deck controls.
- New art, models, shaders or audio.
- Auto-pause rules (for example, pause when outbid).
