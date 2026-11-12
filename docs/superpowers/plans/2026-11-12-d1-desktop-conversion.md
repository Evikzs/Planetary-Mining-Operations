# D1: Desktop Conversion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the browser game into a desktop game: pause and speeds, optional offline catch-up, one desktop layout with mouse and keys, UI scale, an Electron app with file saves, and graphics marked as placeholder.

**Architecture:** The simulation stays untouched and deterministic. The worker's `SimHost` owns the clock: pause and speed only change how many ticks run per real second, and every snapshot carries the effective rate the renderer interpolates with. The phone layout is deleted, not hidden. Electron wraps the same Vite build behind an `app://` protocol; the worker reaches save files through a message bridge to the page, which calls a preload API.

**Tech Stack:** unchanged (TypeScript 6.0.3, Vite 8.3.5, Preact 10.29.8 + Signals, three 0.186.1, GSAP 3.15.0, idb 8.0.4, Vitest 4.1.12 + fast-check, Playwright 1.63.0). New dev dependencies: `electron` 45.1.0 and `electron-builder` 26.18.1.

**Spec:** `docs/superpowers/specs/2026-11-12-d1-desktop-conversion-design.md`, with the desktop sections of `docs/superpowers/specs/2026-10-27-planetary-mining-operations-design.md` (§1–3, §9, §11, §13–15). Executors read both.

**Repository and branch:** `/home/user/Planetary-Mining-Operations`, branch `claude/dazzling-gauss-ukd24u`. Every task ends with a commit and `git push -u origin claude/dazzling-gauss-ukd24u`. After CI is green on a pushed commit, fast-forward the deploy branch: `git push origin claude/dazzling-gauss-ukd24u:claude/vibrant-goodall-teqhde` (owner's standing permission, 2026-11-12; fast-forward only, never force).

## Context

M2a is complete and live. The owner dropped the mobile version on 2026-11-12. D1 comes before M2b; the M2b design is written and waits for its plan.

## Global Constraints

- Desktop only. Minimum window 1280×720; designed at 1920×1080. Mouse and keyboard. No touch gestures, no phone layout.
- Determinism: same seed + same commands → same state hash. Pause and speed are not simulation state. `src/sim/**` and `src/shared/**` never use `Math.random` or `Date`.
- Speeds: 1×, 2×, 4×, 8×. At 1×, 1 tick (1 game minute) = 1 real second. Effective rate = debug `timescale` × speed; 0 while paused.
- Graphics are placeholder: no new models, shaders, palettes or icons. New UI uses existing tokens and icons.
- Electron security: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, a strict CSP, no remote content, no `file://` loads.
- Pinned versions: `electron` 45.1.0, `electron-builder` 26.18.1. They must not enter the web bundle (`npm run size` stays under 1536 KiB).
- UI copy: plain English, short sentences. "Click", never "tap". Game time only; no "real minutes" in copy.
- Strict TypeScript, `noUncheckedIndexedAccess`, no `any`.
- Never push red work: `npm run check`, `npm run bot` and `npx playwright test` pass before every push. Watch CI after each push.

## Review Focus

1. **Right-click on the export-code field and the import field.** The player must still get the browser's copy and paste menu there. Test in D4 (`right-click keeps the text menu in fields`).
2. **Typing in a field.** Space in the proxy-bid field must not pause; `F` in the company name must not open Finance. Test in D2 (`keys do nothing while typing`).
3. **A slow machine at 8×.** The backlog must be dropped, not run under offline rules (which halve the player's production). Test in D1 (`a backlog during play is dropped, not caught up`).
4. **The app is killed during a save write.** The slot keeps its last whole save. Test in D6 (`a failed write leaves the old file whole`).
5. **An M2a save (no `paused` flag) loads.** It catches up as before when the setting is on. Test in D1 (`a save without a paused flag catches up when the setting is on`).

---

## File map

| File | Change | Task |
|---|---|---|
| `src/worker/protocol.ts` | `setClock`, `setPrefs`, `saveNow` ack, store bridge messages; `rate` on snapshot and motion; `freeze` message removed | D1, D6 |
| `src/worker/simHost.ts` | Clock state, rate, backlog drop, gap rule, paused saves | D1 |
| `src/save/types.ts`, `src/save/saveFile.ts` | `SaveFile.paused?: boolean` | D1 |
| `src/client/testApi.ts`, `src/ui/shell/MapCanvas.tsx`, `src/client/store.ts` | `freeze` maps to pause; renderer uses `rate`; `clock` signal | D1 |
| `src/ui/shell/ClockControls.tsx` (new), `src/ui/shell/TopBar.tsx`, `src/ui/shell/tabs.ts`, `src/ui/shell/Shell.tsx` | Pause and speed buttons, keys | D2 |
| `src/client/preferences.ts`, `src/ui/tabs/SettingsTab.tsx` | Offline setting, UI scale | D2, D5 |
| `src/ui/format.ts` and its three callers, `src/data/auctions.ts`, `src/data/codex.ts` | Game time only | D2 |
| `src/ui/shell/BottomTabs.tsx`, `Sheet.tsx`, `useBreakpoint.ts` | Deleted | D3 |
| `src/ui/global.css` | Phone rules deleted; HUD layer; 1280×720 fit | D3, D5 |
| `src/render/camera/controller.ts` | Pinch and twist out; right-drag turns | D4 |
| `src/ui/shell/Tooltip.tsx` (new) | Delayed tooltips from `data-tip` | D4 |
| `electron/main.cts`, `electron/preload.cts`, `electron/saveFiles.cts`, `electron/tsconfig.json` (new) | The desktop app | D6 |
| `src/save/fileStore.ts` (new), `src/worker/storeBridge.ts` (new), `src/main.tsx` | File saves through the bridge | D6 |
| `electron-builder.yml`, `playwright.electron.config.ts`, `e2e-electron/app.spec.ts` (new), `.github/workflows/ci.yml` | Packaging, smoke test, CI | D7 |
| `playwright.config.ts`, `e2e/**` | Two desktop projects; phone branches and visual snapshots out | D3 |
| `README.md`, specs, handover | Desktop docs | D8 |

---

### Task 1 (D1): Pause, speeds and the hybrid catch-up in the sim host

**Files:**
- Modify: `src/worker/protocol.ts`, `src/worker/simHost.ts`, `src/save/types.ts`, `src/save/saveFile.ts`, `src/worker/sim.worker.ts`, `src/client/testApi.ts`, `src/client/store.ts`, `src/ui/shell/MapCanvas.tsx`, `src/main.tsx`
- Test: `tests/worker/simHost.test.ts`, `tests/save/save.test.ts`

**Interfaces:**
- Produces:
  - `export type Speed = 1 | 2 | 4 | 8;` and `export interface ClockState { paused: boolean; speed: Speed; rate: number; actualSpeed: number }` in `protocol.ts`. `rate` = `timescale × speed`, or 0 when paused. `actualSpeed` = ticks run per real second over the last 2 real seconds, divided by `timescale` (0 while paused).
  - `export interface Prefs { offlineCatchUp: boolean }` in `protocol.ts`.
  - `ToWorker` gains `{ t: 'setClock'; paused: boolean; speed: Speed }` and `{ t: 'setPrefs'; prefs: Prefs }`; `init` gains `prefs: Prefs`; `saveNow` gains an optional `id: number`. `freeze` is removed.
  - `FromWorker` gains `{ t: 'saved'; id: number }` (answer to `saveNow` with an id). `snapshot` and `motion` gain `clock: ClockState`.
  - `SaveFile.paused?: boolean`; `toSaveFile(state, savedAtRealMs, paused = false)`; `LoadResult` ok branch gains `paused: boolean` (missing → `false`). `SaveCodec.encode(state, savedAtRealMs, paused)` and `decode(...)` returns `{ state, savedAtRealMs, paused }`. The checksum does not cover `paused`.
  - `clock = signal<ClockState>({ paused: false, speed: 1, rate: 1 })` in `src/client/store.ts`, set from every snapshot.
  - `TestApi.freeze(on)` stays and sends `setClock` with the current speed.

- [ ] **Step 1: Write the failing tests** in `tests/worker/simHost.test.ts` (use the file's existing fake `now`, fake save store and `post` capture):

```ts
test('pause holds the tick; speed 4 runs four ticks a real second', async () => {
  // found a company, then:
  host.handle({ t: 'setClock', paused: true, speed: 1 }); advance(10_000); host.pump();
  expect(tick()).toBe(t0);
  host.handle({ t: 'setClock', paused: false, speed: 4 }); advance(1_000); host.pump();
  expect(tick()).toBe(t0 + 4);
  expect(lastSnapshot().clock).toMatchObject({ paused: false, speed: 4, rate: 4 });
});
test('a paused snapshot has rate 0', ...);           // clock.rate === 0
test('a loaded game starts paused at the saved tick', ...); // init with a save → clock.paused === true, tick === saved tick
test('a new game starts running at 1x', ...);        // init with no save → { paused: false, speed: 1 }
test('a save made while paused does not catch up on load', ...); // save paused, advance 2 h, init → tick unchanged, no 'away'
test('a save made while running catches up only when the setting is on', ...);
  // prefs { offlineCatchUp: true }: 2 h away → tick advanced by catch-up
  // prefs { offlineCatchUp: false }: 2 h away → tick unchanged, paused
test('a save without a paused flag catches up when the setting is on', ...); // delete file.paused before init
test('a backlog during play is dropped, not caught up', ...);
  // running at speed 8, pump at least every 250 ms but make step slow so due > FINE_CATCH_UP_LIMIT:
  // expect no 'catchUp' message, the anchor moves to now, the player's production was not halved
test('a gap with no pumps for over 5 s catches up only when the setting is on', ...);
test('saveNow with an id answers saved after the write', ...); // FromWorker { t: 'saved', id: 7 } after writeAuto resolved
test('a slow pump reports the real speed', ...); // speed 8, step takes 40 ms → clock.actualSpeed well under 8
```

In `tests/save/save.test.ts`: `test('paused round-trips and is not in the checksum')` — `toSaveFile(s, 1, true).paused === true`; flipping `paused` keeps `fromSaveFile(...).ok`.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/worker/simHost.test.ts tests/save/save.test.ts`
Expected: FAIL (`setClock` unknown, `clock` undefined, `paused` undefined).

- [ ] **Step 3: Implement the clock in `SimHost`**

- Fields: `paused`, `speed: Speed`, `prefs: Prefs`, `lastPumpMs`.
- `rate()` = `paused ? 0 : flags.timescale × speed`. `ticksFor` and `realMsOfTick` use the running rate (`timescale × speed`); `advance()` returns early while paused.
- `setClock`: `reanchor()` first, then set; on resume, save at once (the old `freeze` rule: a save while paused must not make a reload count the paused time).
- `init`: `paused = flags.freeze || loaded save` (a loaded save starts paused; a debug scene or a new game starts running unless `?freeze=1`). Catch-up on load only when `prefs.offlineCatchUp && !loaded.paused`.
- `advance()`: if `start − lastPumpMs > 5000` (the machine slept or the worker stalled), the gap goes to `catchUp` when `prefs.offlineCatchUp`, else `reanchor()`. Otherwise, a `due` above `FINE_CATCH_UP_LIMIT` is dropped with `reanchor()`: the clock falls behind. Set `lastPumpMs = start` at the end.
- `save()` passes `paused` to `encode`. `saveNow` with an id posts `{ t: 'saved', id }` after the write, even when the write failed (the error goes out as before).
- `postViews` adds `clock` to `snapshot` and `motion`.
- `sim.worker.ts` passes `paused` through `toSaveFile`/`fromSaveFile`.
- `main.tsx` sends `prefs` in `init` (read in Task 2; until then `{ offlineCatchUp: true }`). `MapCanvas` passes `m.clock.rate` to `setMotion` instead of `flags.timescale`; `store.motion` keeps `clock` beside `anchorRealMs`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tests/worker/simHost.test.ts tests/save/save.test.ts`
Expected: PASS.

- [ ] **Step 5: Keep e2e green.** `e2e/helpers.ts` `bidOnNeighbour` keeps `__pmo.freeze`. Every spec that reloads the page (`settings`, `away`, `core-loop` step 9, `economy-loop`) resumes after the reload with `await page.evaluate(() => window.__pmo.freeze(false))`, because a loaded game now starts paused. `e2e/away.spec.ts` keeps working because the away save was made while running.

- [ ] **Step 6: Verify and commit**

Run: `npm run check && npm run bot && npx playwright test`
Expected: all pass.

```bash
git add -A && git commit -m "feat: pause, speeds and offline catch-up as a choice"
```

---

### Task 2 (D2): Clock controls, new keys and game-time copy

**Files:**
- Create: `src/ui/shell/ClockControls.tsx`, `e2e/clock.spec.ts`
- Modify: `src/ui/shell/TopBar.tsx`, `src/ui/shell/tabs.ts`, `src/ui/shell/Shell.tsx`, `src/client/preferences.ts`, `src/ui/tabs/SettingsTab.tsx`, `src/main.tsx`, `src/ui/format.ts`, `src/ui/components/AuctionPanel.tsx`, `src/ui/tabs/ContractsTab.tsx`, `src/ui/tabs/BuildTab.tsx`, `src/data/auctions.ts`, `src/data/codex.ts`, `e2e/finance.spec.ts`, `e2e/shell.spec.ts`
- Test: `tests/ui/format.test.ts`, `tests/client/preferences.test.ts`

**Interfaces:**
- Consumes: `ClockState`, `Speed`, `Prefs`, `setClock`, `setPrefs` (Task 1).
- Produces:
  - `TABS` keys: `b` Build, `p` People, `t` Trade, `f` Finance, `c` Contracts, `k` Codex, `o` Settings. Matching ignores case. `aria-keyshortcuts` shows the capital letter.
  - `loadOfflinePref(): boolean` (default `true`) and `saveOfflinePref(on: boolean): void` in `preferences.ts`, key `pmo.offlineCatchUp`, with the same try/catch as the motion preference.
  - `ClockControls`: a pause button (`aria-label` "Pause" / "Resume", `aria-pressed`) and four speed buttons ("1×" … "8×", `aria-pressed` on the current one) inside the date slot; while paused the slot shows a "Paused" stamp (`data-testid="paused"`). When running and `actualSpeed < 0.9 × speed`, it shows "Running at N×" (one decimal, `data-testid="real-speed"`).
  - Settings gains a "Keys" section: the D1 spec §4.4 table, read from `TABS` and one list for the clock and camera keys.

- [ ] **Step 1: Write the failing tests**

`e2e/clock.spec.ts`:
```ts
test('space pauses and resumes the clock', ...);   // date stops changing for 2 s; Space again → it moves
test('keys 1 to 4 set the speed', ...);            // press '4' → button '8×' pressed
test('keys do nothing while typing', ...);
  // open Settings (O), focus the new-company name field, type 'f 4' → no tab change, speed unchanged, not paused
test('letter keys open tabs', ...);                // B, P, T, F, C, K, O each open their panel
test('the offline setting persists', ...);         // untick "Run the world while closed", reload → still unticked
test('settings lists every key', ...);             // the Keys section names Space, 1–4, B, P, T, F, C, K, O, W A S D, Q E, N, + -, Esc
```
`tests/ui/format.test.ts`: remove the `formatRealFromGame` cases.
`tests/client/preferences.test.ts`: `loadOfflinePref()` is `true` with no storage, and `false` after `saveOfflinePref(false)`.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/client/preferences.test.ts && npx playwright test e2e/clock.spec.ts --project=desktop`
Expected: FAIL.

- [ ] **Step 3: Implement**

- `Shell.useShortcuts`: Space (`e.code === 'Space'`, `preventDefault`) toggles pause; `1`–`4` set speeds 1, 2, 4, 8; letters open tabs; all ignored while typing (the existing `isTyping`).
- Settings: a "Clock" section with the checkbox "Run the world while closed". On change: `saveOfflinePref` and `simClient.post({ t: 'setPrefs', prefs })`. `main.tsx` sends `loadOfflinePref()` in `init`.
- Delete `formatRealFromGame`; the three callers show `formatGameDuration` only.
- `AUCTION` comments and the auction Codex body: "A lot runs 3 game hours; a late bid adds 30 game minutes, up to 10 game hours."
- `e2e/finance.spec.ts`: "key F opens Finance". `e2e/shell.spec.ts`: keyboard test uses the letters.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tests/client tests/ui && npx playwright test e2e/clock.spec.ts e2e/finance.spec.ts e2e/shell.spec.ts --project=desktop`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

Run: `npm run check && npm run bot && npx playwright test`

```bash
git add -A && git commit -m "feat(ui): clock controls, letter keys for tabs and game-time copy"
```

---

### Task 3 (D3): One desktop layout

**Files:**
- Delete: `src/ui/shell/BottomTabs.tsx`, `src/ui/shell/Sheet.tsx`, `src/ui/shell/useBreakpoint.ts`, `e2e/visual.spec.ts`, `e2e/visual.spec.ts-snapshots/`
- Modify: `src/ui/shell/Shell.tsx`, `src/ui/shell/ContextPanel.tsx`, `src/ui/companion/CompanionBubble.tsx`, `src/ui/tabs/FinanceTab.tsx`, `src/client/store.ts`, `src/ui/global.css`, `playwright.config.ts`, `e2e/helpers.ts`, `e2e/core-loop.spec.ts`, `e2e/economy-loop.spec.ts`, `e2e/finance.spec.ts`, `e2e/founding.spec.ts`, `e2e/news.spec.ts`, `e2e/render.spec.ts`, `e2e/shell.spec.ts`

**Interfaces:**
- Produces: `Shell` renders one layout: `TabRail`, the tab panel (`data-testid="tab-panel"`), `ContextPanel`, `CompanionBubble` (no `desktop` prop), `NewsTicker` always. `.shell` loses `data-layout`. `openTab(page, label)` clicks the rail only.
- Playwright projects: `desktop` (1920×1080) and `desktop-min` (1280×720), both Chromium, no touch.

- [ ] **Step 1: Change the e2e projects and helpers first.** In `playwright.config.ts`, replace `phone` and `desktop` with `desktop` `{ width: 1920, height: 1080 }` and `desktop-min` `{ width: 1280, height: 720 }`. Delete every `info.project.name === 'phone'` branch, the `isMobile` skip in `news.spec.ts`, the 44×44 test in `shell.spec.ts`, and the visual spec with its snapshots. Rename the shell test to `the rail shows every tab`.

- [ ] **Step 2: Run the suite and watch the layout tests fail at 1280×720**

Run: `npx playwright test --project=desktop-min e2e/shell.spec.ts e2e/finance.spec.ts e2e/news.spec.ts`
Expected: FAIL — under 1024 px the old code shows bottom tabs, and above it some tests still assume phone branches.

- [ ] **Step 3: Delete the phone code.** Remove the three files, `isDesktop` everywhere, the More list, the phone `Sheet` paths in `Shell` and `CompanionBubble`, the phone branch in `ContextPanel` (line 199) and the phones-only news block in `FinanceTab` (the ticker shows news). Remove `companionOpen` from `store.ts` if nothing reads it after. Delete every CSS rule under `.shell[data-layout='phone']`, `.bottom-tabs`, `.sheet`, `.more-list`, and rewrite `.shell[data-layout='desktop']…` selectors as plain `.shell…` selectors.

- [ ] **Step 4: Run the suite and watch it pass on both projects**

Run: `npx playwright test`
Expected: PASS on `desktop` and `desktop-min`.

- [ ] **Step 5: Verify and commit**

Run: `npm run check && npm run bot && npx playwright test && npm run build && npm run size`

```bash
git add -A && git commit -m "feat(ui): one desktop layout; the phone layout and pixel snapshots go"
```

---

### Task 4 (D4): Mouse: right-drag, right-click and tooltips

**Files:**
- Create: `src/ui/shell/Tooltip.tsx`
- Modify: `src/render/camera/controller.ts`, `src/ui/shell/Shell.tsx`, `src/ui/shell/TabRail.tsx`, `src/ui/shell/TopBar.tsx`, `src/ui/shell/MapFilters.tsx`, `src/ui/shell/ClockControls.tsx`, `src/ui/shell/Compass.tsx`, `e2e/camera.spec.ts`, `e2e/shell.spec.ts`
- Test: `tests/render/camera/controller.test.ts`

**Interfaces:**
- Produces:
  - Controller: left button (`e.button === 0`) pans; right button (`e.button === 2`) turns, 0.005 radians per pixel of horizontal travel; a second pointer is ignored. `TWIST_START`, `twist` and two-finger zoom go. A right-click without travel (under `TAP_MOVE_PX`) calls a new `o.onCancel()`.
  - `Tooltip`: one element, `role="tooltip"`, shown 400 ms after the pointer rests on an element with `data-tip`, hidden on pointer leave, scroll or key press. Text is the `data-tip` value.
  - `data-tip` on: each rail button (`"Build (B)"` …), clock buttons (`"Pause (Space)"`, `"Speed 2× (2)"` …), compass (`"Lock north (N)"`), every top-bar figure, every map chip.
  - `Shell` listens to `contextmenu` on the window: it calls `preventDefault` unless the target is an `input` or `textarea`. `onCancel` and Esc share one function: cancel the tool if any, else clear the selection, else close the tab.

- [ ] **Step 1: Write the failing tests**

`tests/render/camera/controller.test.ts` (use its synthetic pointer helpers):
```ts
test('right-drag turns the heading and does not pan', ...); // heading changes by ≈ 0.005 × dx; center unchanged
test('a second pointer neither zooms nor turns', ...);      // altitude and heading unchanged
test('a right-click without travel calls onCancel', ...);
```
`e2e/shell.spec.ts`:
```ts
test('hovering a rail button shows its tooltip with the key', ...); // hover 'Finance' → tooltip 'Finance (F)' after 400 ms
test('right-click clears the selection', ...);                      // select a section, right-click the map → context panel empty
test('right-click keeps the text menu in fields', ...);             // dispatch contextmenu on the export-code field → event.defaultPrevented is false
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/render/camera/controller.test.ts && npx playwright test e2e/shell.spec.ts --project=desktop`
Expected: FAIL.

- [ ] **Step 3: Implement** the controller change, `Tooltip`, the `data-tip` attributes and the context-menu rule. `e2e/camera.spec.ts` drops pinch and twist and gains a right-drag turn check.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tests/render && npx playwright test e2e/shell.spec.ts e2e/camera.spec.ts`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

Run: `npm run check && npm run bot && npx playwright test`

```bash
git add -A && git commit -m "feat(ui): right-drag turns, right-click cancels, tooltips name each key"
```

---

### Task 5 (D5): UI scale and the 1280×720 fit

**Files:**
- Modify: `src/ui/shell/Shell.tsx`, `src/client/preferences.ts`, `src/ui/tabs/SettingsTab.tsx`, `src/ui/global.css`, `src/main.tsx`, `docs/superpowers/specs/2026-11-12-d1-desktop-conversion-design.md` (§4.2: zoom, see the ruling)
- Test: `tests/client/preferences.test.ts`, `e2e/layout.spec.ts` (new)

**Interfaces:**
- Produces:
  - `export const UI_SCALES = [0.8, 0.9, 1, 1.1, 1.25, 1.5] as const; export type UiScale = (typeof UI_SCALES)[number];`
  - `loadUiScale(windowWidth: number): UiScale` — the saved choice, else `0.9` when `windowWidth < 1440`, else `1`; `saveUiScale(s: UiScale): void`. Key `pmo.uiScale`; an unknown stored value counts as unset.
  - `uiScale = signal<UiScale>(1)` in `store.ts`.
  - Every UI element except the map canvas sits in `<div class="hud">` with `zoom: var(--ui-scale)`. `.hud` is `position: fixed; inset: 0; pointer-events: none`; its children get `pointer-events: auto`.
- **Ruling to record:** the scale uses CSS `zoom` on the HUD, not the root font size the spec names: the stylesheet sizes in px (245 px values, 4 rem), so a root font size would scale nothing. The map canvas is outside the HUD, so picking keeps its coordinates. Update the D1 spec §4.2 to say so.

- [ ] **Step 1: Write the failing tests**

`tests/client/preferences.test.ts`:
```ts
test('ui scale defaults to 90% under 1440 px and 100% above', () => {
  expect(loadUiScale(1280)).toBe(0.9);
  expect(loadUiScale(1920)).toBe(1);
});
test('a saved ui scale wins, and a bad value is ignored', ...); // save 1.25 → 1.25; store '3' → default
```
`e2e/layout.spec.ts` (both projects):
```ts
test('a tab and a selection fit side by side', ...);
  // found, open Build, select a section; tab panel and context panel boxes do not overlap,
  // both lie inside the viewport, and the top bar and the rail do not overlap them
test('ui scale 150% still fits at 1280x720', ...); // set 1.5 in Settings; same checks; the clock buttons are visible
test('ui scale does not move map picks', ...);      // at 1.25, clicking a section's screen point still selects that section
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/client/preferences.test.ts && npx playwright test e2e/layout.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** the HUD wrapper, the Settings choice ("Interface size": 80% … 150%), the CSS variable set from `uiScale`, and the CSS fixes the layout test asks for at 1280×720 (panel widths and the map-chip row beside an open panel; spec: no overlap).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tests/client && npx playwright test e2e/layout.spec.ts`
Expected: PASS on both projects.

- [ ] **Step 5: Verify and commit**

Run: `npm run check && npm run bot && npx playwright test`

```bash
git add -A && git commit -m "feat(ui): interface size setting; the layout fits 1280x720"
```

---

### Task 6 (D6): The Electron app and file saves

**Files:**
- Create: `electron/main.cts`, `electron/preload.cts`, `electron/saveFiles.cts`, `electron/tsconfig.json`, `src/save/fileStore.ts`, `src/worker/storeBridge.ts`, `src/types/pmoDesktop.d.ts`
- Modify: `package.json`, `src/worker/protocol.ts`, `src/worker/sim.worker.ts`, `src/main.tsx`, `tsconfig.json` (exclude `electron/`), `eslint.config.js` (lint `electron/` as Node), `.gitignore` (`dist-electron/`, `release/`)
- Test: `tests/save/fileStore.test.ts`, `tests/electron/saveFiles.test.ts`

**Interfaces:**
- Produces:
  - `electron/saveFiles.cts` (pure Node, no Electron import):
    - `export const SLOT_PATTERN = /^(auto-[0-2]|manual-[1-5])$/;`
    - `listSlots(dir: string): Promise<string[]>`, `readSlot(dir, slot): Promise<string | null>`, `writeSlot(dir, slot, text): Promise<void>` (write `<slot>.json.tmp`, then `rename`), `removeSlot(dir, slot): Promise<void>`. Each throws `Error('bad slot name')` when `SLOT_PATTERN` fails.
  - Preload exposes `window.pmoSaves: { list(): Promise<string[]>; read(slot: string): Promise<string | null>; write(slot: string, text: string): Promise<void>; remove(slot: string): Promise<void> }` and `window.pmoApp: { onCloseRequest(cb: () => void): void; closeReady(): void }`, typed in `src/types/pmoDesktop.d.ts` as optional globals.
  - `export interface SlotIo { list(): Promise<string[]>; read(slot: string): Promise<string | null>; write(slot: string, text: string): Promise<void> }` and `createFileSaveStore(io: SlotIo): SaveStore` (all optional methods present) in `src/save/fileStore.ts`. `writeAuto` writes the auto slot that is missing or has the oldest `savedAtRealMs`. Reads go through `fromSaveFile` like the IDB store.
  - `protocol.ts`: `ToWorker` gains `{ t: 'storeResult'; id: number; ok: boolean; value?: unknown; error?: string }`; `FromWorker` gains `{ t: 'storeCall'; id: number; op: 'list' | 'read' | 'write'; slot?: string; text?: string }`. `init` gains `fileSaves: boolean`.
  - `createBridgeSlotIo(post: (msg: FromWorker) => void): { io: SlotIo; settle(msg: Extract<ToWorker, { t: 'storeResult' }>): void }` in `src/worker/storeBridge.ts`.
  - `sim.worker.ts` builds its `SaveStore` on `init`: `fileSaves` → `createFileSaveStore(bridge.io)`, else IDB as now. (The store moves from construction to `init`; `SimHost` gains `setSaves(store)` or takes a store factory.)
  - `main.tsx`: when `window.pmoSaves` exists, sends `fileSaves: true`, answers `storeCall` messages from `window.pmoSaves`, and on `pmoApp.onCloseRequest` sends `saveNow` with an id and calls `closeReady()` on the `saved` answer.
  - `electron/main.cts`: registers `app` as a standard, secure scheme with fetch support; serves `dist/` through `protocol.handle('app', …)` with a path-traversal check and CSP header `default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'`. Window: `minWidth 1280, minHeight 720`, default `1600×900`, `autoHideMenuBar: true` and `Menu.setApplicationMenu(null)`, F11 toggles fullscreen, bounds and maximised state in `<userData>/window.json`. `will-navigate` and `setWindowOpenHandler` send `http(s)` links to `shell.openExternal` and deny the rest. Close: the first `close` is prevented, `app:close-request` goes to the page, and the window is destroyed on `app:close-ready` or after 2000 ms. IPC handlers for `saves:list|read|write|remove` call `saveFiles.cts` with `<userData>/saves`. If `PMO_DEV_URL` is set, the window loads that URL instead of `app://game/` (for `npm run dev` beside the app).
  - **Ruling to record:** `npm run app` starts the app on a fresh production build; hot reload is `npm run dev` in one terminal and `PMO_DEV_URL=http://localhost:5173 npx electron .` in another. The spec's "against the Vite dev server" would need a process runner as a new dependency. Update D1 spec §3.1 to match.
  - `app.on('window-all-closed', () => app.quit())` on every OS, macOS included (spec: the app quits when its window closes).
  - `package.json`: `"main": "dist-electron/main.cjs"`; scripts `"build:electron": "tsc -p electron/tsconfig.json"` and `"app": "npm run build && npm run build:electron && electron ."`; dev dependencies `electron` 45.1.0, `electron-builder` 26.18.1.
  - `electron/tsconfig.json`: `module` and `moduleResolution` `node16`, `outDir` `../dist-electron`, `strict`, types `node`.

- [ ] **Step 1: Write the failing tests**

`tests/electron/saveFiles.test.ts` (a temp dir from `fs.mkdtemp`):
```ts
test('writes, lists and reads a slot', ...);          // write auto-0 → list ['auto-0'] → read returns the text
test('refuses bad slot names', ...);                   // '../x', 'auto-3', 'manual-0' → rejects 'bad slot name'
test('a failed write leaves the old file whole', ...); // write v1; stub `fs.promises.rename` with `vi.spyOn` to reject (saveFiles.cts calls it through `require('node:fs').promises` so the spy reaches it) → the write rejects and read still returns v1
```
`tests/save/fileStore.test.ts` (an in-memory `SlotIo`):
```ts
test('autosaves rotate through three slots, oldest first', ...);
test('loadLatestValid skips a corrupt newest slot', ...);  // newest slot has a bad checksum → returns the next one
test('manual slots round-trip and list with company names', ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/electron tests/save/fileStore.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement** `saveFiles.cts`, `fileStore.ts`, `storeBridge.ts`, the worker and page wiring, `main.cts` and `preload.cts` (CommonJS, sandbox-safe: only `contextBridge` and `ipcRenderer`).

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tests/electron tests/save`
Expected: PASS.

- [ ] **Step 5: Start the app by hand once**

Run: `npm run app` (on a headless host: `xvfb-run -a npx electron . --no-sandbox` after the build steps)
Expected: the founding screen; found a company; quit; start again → the company is there and the game opens paused. Record the check in the ledger.

- [ ] **Step 6: Verify and commit**

Run: `npm run check && npm run bot && npx playwright test && npm run build && npm run size`
Expected: all pass; size unchanged (Electron code is not in `dist/`).

```bash
git add -A && git commit -m "feat(app): an Electron desktop app with file saves"
```

---

### Task 7 (D7): Packaging, the app smoke test and CI

**Files:**
- Create: `electron-builder.yml`, `playwright.electron.config.ts`, `e2e-electron/app.spec.ts`
- Modify: `package.json`, `.github/workflows/ci.yml`, `tsconfig.json` (include `e2e-electron`), `eslint.config.js`

**Interfaces:**
- Consumes: the app from Task 6.
- Produces:
  - `electron-builder.yml`: `appId: io.github.evikzs.pmo`, `productName: Planetary Mining Operations`, `directories.output: release`, `files: [dist/**, dist-electron/**, package.json]`, `linux.target: dir`, `win.target: dir`, `mac.target: dir`, `asar: true`.
  - Scripts: `"package": "npm run build && npm run build:electron && electron-builder --dir"`, `"test:app": "playwright test -c playwright.electron.config.ts"`.
  - The smoke test launches `release/linux-unpacked/planetary-mining-operations` (or `PMO_APP_PATH`) with `_electron.launch({ executablePath, args: ['--no-sandbox'], env: { ...process.env, PMO_USER_DATA: tmpDir } })`. `main.cts` honours `PMO_USER_DATA` with `app.setPath('userData', …)` before `ready`, so tests never touch a real profile.
  - CI job `app` (ubuntu-latest): `npm ci`, `npm run package`, `xvfb-run -a npm run test:app`; uploads the report on failure.

- [ ] **Step 1: Write the failing smoke test** `e2e-electron/app.spec.ts`:
```ts
test('the app founds a company, saves on quit and loads it paused', async () => {
  // launch → founding screen visible → found 'Selene Rock Co' through the form
  // → close the app (app.close()) → a file exists in <tmp>/saves/
  // → launch again with the same PMO_USER_DATA → top bar shows 'Selene Rock Co' → the 'paused' stamp shows
});
test('the window refuses to shrink below 1280x720', ...); // setSize(800, 600) via app.evaluate → getSize() ≥ [1280, 720]
test('an external link opens outside the app', ...);      // window.open('https://example.com') → no new BrowserWindow
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm run package && xvfb-run -a npm run test:app`
Expected: FAIL until the builder config and `PMO_USER_DATA` exist.

- [ ] **Step 3: Implement** the builder config, the `PMO_USER_DATA` override, the scripts and the CI job.

- [ ] **Step 4: Run it and watch it pass**

Run: `npm run package && xvfb-run -a npm run test:app`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

Run: `npm run check && npm run bot && npx playwright test`

```bash
git add -A && git commit -m "build(app): unpacked desktop builds, an app smoke test and a CI job"
```

---

### Task 8 (D8): Desktop documentation and the copy pass

**Files:**
- Modify: `README.md`, `src/ui/shell/ContextPanel.tsx`, `src/client/testApi.ts`, `src/render/renderer.ts`, `src/render/world/roverLayer.ts`, `docs/superpowers/plans/2026-11-05-m2a-handover.md`
- Create: `docs/superpowers/plans/2026-11-12-d1-handover.md`
- Test: `tests/data/copy.test.ts` (new)

**Interfaces:** none new.

- [ ] **Step 1: Write the failing copy test** `tests/data/copy.test.ts`:
```ts
test('no player-facing copy says tap, phone, swipe or real minutes', () => {
  const texts = [...Object.values(CODEX).map((e) => e.body), ...allCompanionLines(), ...Object.values(ERROR_COPY), ...beatTexts()];
  for (const t of texts) expect(t).not.toMatch(/\b(tap|taps|tapping|phone|phones|swipe|real (minute|second)s?)\b/i);
});
```
Use the existing exports of `src/data/codex.ts`, `src/data/companions/*`, `src/data/copy.ts` and the story beats; add a small export where none exists.

- [ ] **Step 2: Run it and watch it fail or pass.** If it passes at once, the copy is already clean; keep the test as a guard.

Run: `npx vitest run tests/data/copy.test.ts`

- [ ] **Step 3: Edit the copy and comments.** "tap" → "click" in comments and copy. README:
  - Intro: a desktop game, Steam as the end goal; graphics are placeholder.
  - Play: the web playtest link; "Run the desktop app": `npm run app`; packaged builds: `npm run package`.
  - Controls: the D1 key table (spec §4.4) and the mouse rules.
  - Auctions: game time ("3 game hours", "30 game minutes", "10 game hours").
  - Finance: key `F`; no "under More on phones".
  - Develop: new scripts (`app`, `package`, `test:app`), the `desktop` and `desktop-min` e2e projects.
  - Documentation: link the D1 design and plan.
- [ ] **Step 4: Write `2026-11-12-d1-handover.md`** for the next session: what D1 changed, how to run the app, the branch rule (develop on the session's branch; fast-forward `claude/vibrant-goodall-teqhde` after green CI), and that M2b's design waits for its plan. Mark the M2a handover as complete with one line at its top.

- [ ] **Step 5: Verify and commit**

Run: `npm run check && npm run bot && npx playwright test`

```bash
git add -A && git commit -m "docs: the desktop game in the README; D1 handover"
```

---

## After Task 8

Follow `superpowers:executing-plans`' final review: one fresh reviewer on the most capable model gets this plan's Review Focus and the ledger's rulings; one fix pass, each fix test-first; then `superpowers:finishing-a-development-branch`. The final message lists every `Ruling:` line and every deferred minor.
