# M0–M1: Foundations and Moon Vertical Slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the project foundations (M0) and a playable Moon slice (M1). In the slice, the core loop feels great on phone and desktop: build, extract, move goods, refine, sell, complete contracts, expand.

**Architecture:** A pure, deterministic TypeScript simulation runs in a Web Worker. Three.js draws a cube-sphere Moon, streamed in chunks by worker threads, with a poster post-processing pass. The UI is Preact + Signals. Saves go to IndexedDB. GitHub Pages hosts every push.

**Tech Stack:**

| Area | Packages |
|---|---|
| Language and build | typescript 6.0.3 (typescript-eslint does not support TS 7 yet), vite 8.3.5, Node ≥ 22.12 |
| UI | preact 10.29.8, @preact/signals 2.11.4, @preact/preset-vite 2.10.6 (+ @babel/core 7) |
| 3D and motion | three 0.186.1 (+ @types/three 0.186.0), gsap 3.15.0, simplex-noise 4.0.3 |
| Storage | idb 8.0.4 |
| Fonts | @fontsource-variable/jost 5.3.0, @fontsource/ibm-plex-sans 5.3.0, @fontsource/ibm-plex-mono 5.3.0 |
| Tests | vitest 4.1.12, fast-check 4.10.2, fake-indexeddb 6.2.6, @playwright/test 1.63.0 (matches the browsers installed in this container) |
| Lint and format | eslint 10.13.0 + @eslint/js 10.x, typescript-eslint 8.72.1, prettier 3.9.10, @types/node 22.x |

**Spec:** `docs/superpowers/specs/2026-10-27-planetary-mining-operations-design.md`. Executors read both documents.

**Plan location after approval:** Task A1 copies this file to `docs/superpowers/plans/2026-10-27-m0-m1-foundations-moon-slice.md`.

**Repository and branch:** `Planetary-Mining-Operations` only, at `/home/user/Planetary-Mining-Operations`. Branch `claude/vibrant-goodall-teqhde`, which is the repo's default branch. Every task ends with a commit and `git push -u origin claude/vibrant-goodall-teqhde`.

## Owner decisions for this plan (2026-10-27)

- **M1 companion:** Old miner veteran. Name: Oskar "Ox" Varga.
- **Hosting:** GitHub Pages deploys on every push to `claude/vibrant-goodall-teqhde`, and later to `main`. The owner enables it once: Settings → Pages → Source: GitHub Actions.
- **Expansion in M1:** the Lunar Authority land office sells sections next to yours at a listed price. M2 replaces it with auctions.
- **Research:** moves to M2. This fills a spec gap.

## Scope

**In M0:** the scaffold, CI, Pages deploy, deterministic RNG and clock, the engine, the simulation worker, the save system, design tokens and the app shell.

**In M1:** Luna only. 60 sections. 22 goods. 17 building types. Roads, belts, power, production, and people (housing; air, water, food and power needs; morale; migration; wages; jobs; 3 shifts; commuter bus rovers). One Lunar market with order books in Lunar Marks (LM). Ore delivery and infrastructure contracts, with reputation and colony growth. The land office. The veteran's chapter 1 and the Codex. Offline catch-up. The globe renderer, poster look, and phone and desktop UI.

**Deferred** (target milestone in brackets):
- Rivals, auctions, stocks, loans, financial statements, research and patents [M2].
- Medical and recreation needs, the training centre, scientist/pilot/crew skills, hauler routes between sections, manual road editing [M2].
- Other bodies, FX, freight, the Solar map [M3]. Voyage mode [M4].
- The other 83 goods and 17 contract types. Fission plants: the spec defines no fission fuel good (spec gap) [M5].
- PWA install, audio, colour-blind palette, the other 3 companions [M7].

**Spec gap filled here:** offline catch-up (spec §11.1) was in no milestone. It is task B15.

## Global Constraints

- Mobile first. The desktop layout starts at 1024 px width. Touch targets are at least 44 × 44 px.
- Browsers: the latest 2 versions of Chrome, Edge, Firefox and Safari (iOS 16+). WebGL 2 is required. Without it, show: "This game needs WebGL 2. Update your browser, or try Chrome, Edge, Firefox or Safari 16+."
- Time: 1 game hour = 1 real minute. 1 tick = 1 game minute = 1 real second. Shifts start at 06:00, 14:00 and 22:00. Tick 0 = 2091-03-01 05:00. The calendar has no leap years.
- Players can never pause or speed up the world clock. A debug `timescale` exists only in dev and e2e builds.
- Determinism: the same seed and the same commands give the same state hash. `src/sim/**` and `src/shared/**` never use `Math.random` or `Date`. ESLint enforces this.
- Units: money is integer cents of LM. Goods are integer kg. Prices are cents per tonne. Value = `Math.round(kg * priceCentsPerT / 1000)`.
- Performance budgets (spec §13.5):

  | Item | Budget |
  |---|---|
  | Frame rate on a mid-range 2021 phone | 60 fps target, never below 30 |
  | Main thread per frame | < 8 ms |
  | Simulation tick at 10,000 workers | < 4 ms |
  | Draw calls at bird's-eye | < 300 |
  | Triangles | < 1.5 M |
  | Initial JS (gzip) | < 1.5 MiB |
  | Time to interactive on 4G | < 4 s |

- Look:
  - Colours come only from the palette tokens (task A6).
  - Fonts: Jost, IBM Plex Sans, IBM Plex Mono with tabular figures, all self-hosted.
  - Never: `backdrop-filter`, purple gradients, emoji, default UI kits.
  - Reduced motion is respected everywhere.
- Motion: nothing teleports. Machines use the ease `cubic-bezier(0.65, 0, 0.25, 1)` ("industrial"). Panels use GSAP `back.out(1.2)`.
- No server. Static hosting. Saves in IndexedDB. Export codes start with `PMO1.`.
- Strict TypeScript, with `noUncheckedIndexedAccess`. No `any`.
- UI copy is plain English in short sentences. The game title is "Planetary Mining Operations".

## Review Focus

1. **The tab is hidden or the phone is locked mid-session.** On return, the clock catches up: fine ticks for gaps ≤ 300 ticks, catch-up above that. Time is never applied twice. Test in A4: `catches up after a 3-minute and a 2-hour gap without double counting`.
2. **The browser dies while saving, so the newest slot is corrupt.** Loading uses the previous valid slot. Test in A5: `falls back to the previous valid autosave`.
3. **A building is placed where no road can reach.** The command fails with `NO_ROAD_ACCESS` and charges nothing. Test in B6: `road-locked plot fails with NO_ROAD_ACCESS and charges nothing`.
4. **The depot is full.** Belts jam visibly and production blocks. No goods vanish. Test in B9: `full depot jams the out lane and blocks production without losing goods`.
5. **The player dumps 100× the hourly volume into a thin market.** The market clears at the lower price bound, the unfilled rest returns to the depot, and no NaN or negative values appear. Test in B12: `selling 100x hourly volume clears at the lower bound and returns the rest`.

---

## File structure

| Path | Responsibility |
|---|---|
| `src/main.tsx` | Entry: tokens, fonts, worker, renderer, `<App/>` |
| `src/shared/` | Pure code shared by the simulation, the renderer and the workers: `vec3.ts`, `scale.ts`, `noise.ts`, `terrain.ts`, `ease.ts`, `trips.ts`, `lanes.ts` |
| `src/sim/` | Deterministic simulation. No DOM, no three: `rng.ts`, `hash.ts`, `clock.ts`, `state.ts`, `events.ts`, `commands.ts`, `engine.ts`, `ledger.ts`, `inventory.ts`, `views.ts`, `offline.ts` |
| `src/sim/world/` | `sections.ts`, `plots.ts`, `luna.ts`, `roads.ts` |
| `src/sim/build/` | `construction.ts`, `landOffice.ts`, `power.ts`, `belts.ts`, `production.ts` |
| `src/sim/people/` | `store.ts`, `names.ts`, `needs.ts`, `morale.ts`, `migration.ts`, `payroll.ts`, `jobs.ts`, `commute.ts` |
| `src/sim/market/` | `curves.ts`, `clearing.ts`, `orders.ts`, `market.ts` |
| `src/sim/contracts/` | `rewards.ts`, `generate.ts`, `contracts.ts` |
| `src/sim/story/` | `beats.ts`, `story.ts`, `codex.ts` |
| `src/data/` | `goods.ts`, `buildings.ts`, `balance.ts`, `names.ts`, `codex.ts`, `copy.ts`, `companions/veteran.ts`, `companions/narrator.ts` |
| `src/worker/` | `protocol.ts`, `simHost.ts` (pure host logic), `sim.worker.ts` (thin shell) |
| `src/save/` | `serialize.ts`, `saveFile.ts`, `migrations.ts`, `slots.ts`, `exportCode.ts` |
| `src/client/` | `simClient.ts`, `store.ts` (signals), `debugFlags.ts`, `testApi.ts` |
| `src/render/` | `renderer.ts`, `webgl.ts`, `materials.ts`, `sky.ts`, `globe/`, `camera/`, `overlays/`, `world/`, `post/` |
| `src/ui/` | `tokens.ts`, `global.css`, `App.tsx`, `format.ts`, `icons.tsx`, `shell/`, `tabs/`, `screens/`, `companion/`, `components/`, `motion/` |
| `tests/` | Vitest unit, property and perf tests. Mirrors `src/` |
| `bot/` | `scenes.ts` (demo and bench states), `strategy.ts`, `bot.test.ts` |
| `e2e/` | Playwright specs, `helpers.ts`, screenshot baselines |
| `scripts/check-bundle-size.mjs` | Gzip budget for initial JS |
| `.github/workflows/` | `ci.yml`, `pages.yml` |

**Simulation system order.** `src/sim/engine.ts` keeps an explicit array. Each task inserts its system at the stated place:

`clock` → `construction` → `power` → `needs` → `morale` → `migration` → `payroll` → `jobs` → `commute` → `belts` → `production` → `market` → `contracts` → `story`

---

# Part A — M0 Foundations

### Task 1 (A1): Project scaffold and tooling

**Files:**
- Create:
  - `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.bot.config.ts`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.gitignore`, `index.html`
  - `src/main.tsx`, `src/ui/App.tsx`, `src/vite-env.d.ts`
  - `docs/superpowers/plans/2026-10-27-m0-m1-foundations-moon-slice.md` (a copy of this plan)
- Test: `tests/app.test.ts`

**Interfaces:**
- Produces:
  - `APP_TITLE = 'Planetary Mining Operations'` and `App(): JSX.Element` from `src/ui/App.tsx`
  - npm scripts:
    - `dev`, `build` (`vite build`), `build:e2e` (`vite build --mode e2e`), `preview`
    - `typecheck` (`tsc --noEmit`), `lint` (`eslint . && prettier --check .`), `format`
    - `test` (`vitest run`), `test:e2e` (`playwright test`), `bot` (`vitest run --config vitest.bot.config.ts`)
    - `size` (`node scripts/check-bundle-size.mjs`), `check` (`npm run typecheck && npm run lint && npm run test`)

- [ ] **Step 1: Copy this plan into the repo**

  Copy it to `docs/superpowers/plans/2026-10-27-m0-m1-foundations-moon-slice.md`.

- [ ] **Step 2: Install exact versions**

  Use the versions in the Tech Stack table. Run `npm init -y`, then `npm i -E` for dependencies and `npm i -DE` for devDependencies. Add `"type": "module"` and `"engines": { "node": ">=22.12" }`.

- [ ] **Step 3: Write the failing test** in `tests/app.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { APP_TITLE } from '../src/ui/App';

describe('app', () => {
  it('has the game title', () => {
    expect(APP_TITLE).toBe('Planetary Mining Operations');
  });
});
```

- [ ] **Step 4: Run it**

  Run: `npx vitest run tests/app.test.ts`
  Expected: FAIL, "Cannot find module '../src/ui/App'".

- [ ] **Step 5: Configure TypeScript, Vite and ESLint**

  - **`tsconfig.json`:**
    - `target` and `lib`: ES2022, with `lib` `["ES2023","DOM","DOM.Iterable"]`
    - `module: "ESNext"`, `moduleResolution: "bundler"`
    - `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`
    - `jsx: "react-jsx"`, `jsxImportSource: "preact"`
    - `types: ["vite/client"]`
    - include `src`, `tests`, `bot`, `e2e`, `scripts`
  - **`vite.config.ts`:**
    - `plugins: [preact()]`
    - `base: process.env.PMO_BASE ?? '/'`
    - `worker: { format: 'es' }`
    - `build: { target: 'es2022', manifest: true, sourcemap: true }`
    - `test: { include: ['tests/**/*.test.ts'], environment: 'node' }`
  - **`vitest.bot.config.ts`:** includes `bot/**/*.test.ts`, with `testTimeout: 120000`.
  - **`eslint.config.js`:**
    - `typescript-eslint` `recommendedTypeChecked`
    - `@typescript-eslint/no-explicit-any: error`
    - For `src/sim/**` and `src/shared/**`:
      - `no-restricted-properties` on `Math.random` (message "Use the seeded rng")
      - `no-restricted-globals` on `Date` (message "Use the game clock")
    - Ignore `dist`, `coverage`, `playwright-report`.
  - **`.prettierrc.json`:** `{ "singleQuote": true, "printWidth": 100 }`.

- [ ] **Step 6: Implement `src/ui/App.tsx` and `src/main.tsx`**

  - `App` renders `<main data-testid="app">` with the title.
  - `main.tsx` renders into `#app` in `index.html`. The page `<title>` is "Planetary Mining Operations". Use `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.

- [ ] **Step 7: Verify**

  Run: `npm run check && npm run build`
  Expected: all PASS, and `dist/index.html` exists.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "chore: scaffold Vite, TypeScript and Preact project" && git push -u origin claude/vibrant-goodall-teqhde
```

---

### Task 2 (A2): Seeded RNG and state hashing

**Files:**
- Create: `src/sim/rng.ts`, `src/sim/hash.ts`
- Test: `tests/sim/rng.test.ts`, `tests/sim/hash.test.ts`

**Interfaces:**
- Produces (`src/sim/rng.ts`):

```ts
export type RngState = readonly [number, number, number, number];
export interface Rng {
  next(): number;
  int(minIncl: number, maxIncl: number): number;
  pick<T>(items: readonly T[]): T;
  normal(): number;
  getState(): RngState;
}
export function createRng(seed: number): Rng;
export function rngFromState(state: RngState): Rng;
export function deriveSeed(seed: number, label: string): number;
```

- Produces (`src/sim/hash.ts`):

```ts
export function cyrb53(text: string, seed?: number): number;
export function canonicalStringify(value: unknown): string;
export function hashState(value: unknown): string;
```

- [ ] **Step 1: Write failing tests**

```ts
// tests/sim/rng.test.ts
it('pins the first values for seed 42', () => {
  const r = createRng(42);
  expect([r.next(), r.next(), r.next()].map((x) => x.toFixed(12))).toEqual([
    '0.563356057974', '0.288961866871', '0.005916276248',
  ]);
});
it('same seed gives the same 1000 values', () => {
  const a = createRng(7), b = createRng(7);
  for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
});
it('next() stays in [0,1) and int(1,6) covers exactly 1..6', () => {
  const r = createRng(1); const seen = new Set<number>();
  for (let i = 0; i < 10000; i++) {
    const x = r.next(); expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1);
    seen.add(r.int(1, 6));
  }
  expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
});
it('state round-trip continues identically', () => {
  const a = createRng(9); a.next(); const b = rngFromState(a.getState());
  expect(b.next()).toBe(a.next());
});
it('derived streams differ', () => {
  expect(deriveSeed(42, 'terrain')).not.toBe(deriveSeed(42, 'people'));
});
// tests/sim/hash.test.ts
it('pins cyrb53', () => { expect(cyrb53('pmo')).toBe(5460725301389868); expect(cyrb53('')).toBe(3338908027751811); });
it('sorts keys and encodes Maps and typed arrays', () => {
  expect(canonicalStringify({ b: 1, a: [1, 2] })).toBe('{"a":[1,2],"b":1}');
  expect(canonicalStringify(new Map([['z', 1], ['a', 2]]))).toBe('{"$map":[["a",2],["z",1]]}');
  expect(canonicalStringify(new Uint8Array([1, 2]))).toBe('{"$ta":"Uint8Array","v":[1,2]}');
});
it('throws on NaN and Infinity', () => {
  expect(() => canonicalStringify({ x: NaN })).toThrow();
});
it('hashState ignores key order', () => {
  expect(hashState({ a: 1, b: 2 })).toBe(hashState({ b: 2, a: 1 }));
});
```

- [ ] **Step 2: Run them**

  Run: `npx vitest run tests/sim`
  Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

  - **RNG algorithm:** sfc32. Seed its 4 state words with 4 successive outputs of `splitmix32(seed >>> 0)`. Discard the first 12 outputs. `next() = raw() / 2^32`.
  - `normal()`: Box–Muller using two `next()` values.
  - `deriveSeed(seed, label)`: `(seed ^ (cyrb53(label) >>> 0)) >>> 0`.
  - `cyrb53`: the standard 53-bit version (two `Math.imul` lanes, seeds `0xdeadbeef ^ seed` and `0x41c6ce57 ^ seed`).
  - `hashState`: `cyrb53(canonicalStringify(v)).toString(16).padStart(14, '0')`.
  - Treat `-0` as `0`.

- [ ] **Step 4: Run them**

  Run: `npx vitest run tests/sim && npm run check`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "feat(sim): seeded rng and canonical state hashing"`, then push.

---

### Task 3 (A3): Game clock, state, events, commands, engine

**Files:**
- Create: `src/sim/clock.ts`, `src/sim/state.ts`, `src/sim/events.ts`, `src/sim/commands.ts`, `src/sim/engine.ts`
- Test: `tests/sim/clock.test.ts`, `tests/sim/engine.test.ts`

**Interfaces:**
- Consumes: A2 `createRng`, `deriveSeed`, `hashState`.
- Produces:

```ts
// clock.ts
export const TICKS_PER_HOUR = 60, HOURS_PER_DAY = 24, SHIFT_START_HOURS = [6, 14, 22] as const;
export const START = { year: 2091, month: 3, day: 1, hour: 5 } as const;
export interface GameDate { year: number; month: number; day: number; hour: number; minute: number }
export function tickToDate(tick: number): GameDate;
export function formatGameDate(tick: number): string;          // 'YYYY-MM-DD HH:MM'
export function shiftAt(tick: number): 0 | 1 | 2;               // shift whose start is the latest ≤ tick
export function nextShiftStartTick(tick: number): number;       // first tick > tick at 06/14/22:00
// state.ts
export type CompanionId = 'veteran' | 'shipAi' | 'coFounder' | 'pirate';
export interface Company { name: string; companionId: CompanionId }
export interface GameState { version: 1; seed: number; tick: number; rng: RngState; company: Company | null; nextId: number }
export function createInitialState(seed: number): GameState;
// events.ts  (later tasks add members to this union)
export type SimEvent = { t: 'shiftChange'; shift: 0 | 1 | 2 } | { t: 'founded' };
// commands.ts  (later tasks add members)
export type Command = { t: 'foundCompany'; name: string; companionId: CompanionId };
export type CommandError = 'ALREADY_FOUNDED' | 'NOT_FOUNDED' | 'INVALID_NAME' | 'COMPANION_UNAVAILABLE' | 'UNKNOWN_ID';
export type CommandResult = { ok: true } | { ok: false; error: CommandError };
// engine.ts
export type StepMode = 'fine' | 'coarse';
export interface StepContext { dtMinutes: number; mode: StepMode; offlineEfficiency: number; events: SimEvent[]; rng: Rng }
export interface System { id: string; step(state: GameState, ctx: StepContext): void }
export const SYSTEMS: System[];                                  // ordered; A3 registers 'clock' only
export function createGame(seed: number): GameState;
export function applyCommand(state: GameState, cmd: Command): CommandResult;
export function step(state: GameState, opts: { mode: StepMode; offlineEfficiency?: number }): SimEvent[];
```

- [ ] **Step 1: Write failing tests**

```ts
// tests/sim/clock.test.ts
it('tick 0 is 2091-03-01 05:00', () => expect(formatGameDate(0)).toBe('2091-03-01 05:00'));
it('rolls days and years', () => {
  expect(formatGameDate(19 * 60)).toBe('2091-03-02 00:00');
  expect(formatGameDate(365 * 24 * 60)).toBe('2092-03-01 05:00');
  expect(formatGameDate((365 - 59) * 24 * 60 - 5 * 60)).toBe('2092-01-01 00:00');
});
it('shifts start at 06, 14, 22', () => {
  expect(shiftAt(59)).toBe(2); expect(shiftAt(60)).toBe(0); expect(shiftAt(540)).toBe(1); expect(shiftAt(1020)).toBe(2);
  expect(nextShiftStartTick(0)).toBe(60); expect(nextShiftStartTick(60)).toBe(540);
});
// tests/sim/engine.test.ts
it('founds a company once, with validation', () => {
  const s = createGame(42);
  expect(applyCommand(s, { t: 'foundCompany', name: 'ab', companionId: 'veteran' })).toEqual({ ok: false, error: 'INVALID_NAME' });
  expect(applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'pirate' })).toEqual({ ok: false, error: 'COMPANION_UNAVAILABLE' });
  expect(applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' })).toEqual({ ok: true });
  expect(applyCommand(s, { t: 'foundCompany', name: 'Other', companionId: 'veteran' })).toEqual({ ok: false, error: 'ALREADY_FOUNDED' });
});
it('fine adds 1 tick, coarse adds 60 and must start on the hour', () => {
  const s = createGame(1); step(s, { mode: 'fine' }); expect(s.tick).toBe(1);
  expect(() => step(s, { mode: 'coarse' })).toThrow('coarse step must start on the hour');
  const t = createGame(1); step(t, { mode: 'coarse' }); expect(t.tick).toBe(60);
});
it('emits shiftChange at 06:00, 14:00, 22:00', () => {
  const s = createGame(1); const at: number[] = [];
  for (let i = 0; i < 1440; i++) for (const e of step(s, { mode: 'fine' })) if (e.t === 'shiftChange') at.push(s.tick);
  expect(at).toEqual([60, 540, 1020]);
});
it('is deterministic', () => {
  const run = (seed: number) => { const s = createGame(seed);
    applyCommand(s, { t: 'foundCompany', name: 'Selene Rock Co', companionId: 'veteran' });
    for (let i = 0; i < 2000; i++) step(s, { mode: 'fine' }); return hashState(s); };
  expect(run(42)).toBe(run(42)); expect(run(42)).not.toBe(run(43));
});
```

- [ ] **Step 2: Run them**

  Run: `npx vitest run tests/sim`
  Expected: FAIL.

- [ ] **Step 3: Implement**

  - **Calendar:** pure arithmetic. Month lengths are `[31,28,31,30,31,30,31,31,30,31,30,31]`. No `Date`.
  - **Company name rule:** after trimming, it must match `/^[\p{L}\p{N} '.&-]{3,32}$/u`.
  - **Companion:** only `'veteran'` is accepted in M1.
  - **Ticking:** `step` advances only when `company !== null`. `step` never throws for that case; it returns `[]`.
  - **`clock` system:** emits `shiftChange` when `[tick, tick+dt)` crosses a shift start.
  - **Fine step:** `dt = 1`.
  - **Coarse step:** `dt = 60`. It requires `tick % 60 === 0`.

- [ ] **Step 4: Run them**

  Run: `npx vitest run tests/sim && npm run check`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(sim): game clock, state, commands and engine`, then push.

---

### Task 4 (A4): Simulation worker, protocol, client and real-time loop

**Files:**
- Create: `src/save/types.ts` (types only; A5 implements them), `src/worker/protocol.ts`, `src/worker/simHost.ts`, `src/worker/sim.worker.ts`, `src/client/simClient.ts`, `src/client/store.ts`, `src/client/debugFlags.ts`
- Modify: `src/main.tsx`
- Test: `tests/worker/simHost.test.ts`, `tests/client/debugFlags.test.ts`

**Interfaces:**
- Consumes: A3 engine.
- Produces (`src/save/types.ts`, used by A5):

```ts
export interface SaveFile { format: 'pmo-save'; version: number; savedAtRealMs: number; seed: number; tick: number; state: unknown; checksum: string }
export interface SaveStore { writeAuto(file: SaveFile): Promise<void>; loadLatestValid(): Promise<SaveFile | null> }
```
- Produces:

```ts
// protocol.ts (later tasks add members)
export interface DebugFlags { timescale: number; freeze: boolean; seed: number | null; scene: 'none' | 'demo' | 'bench'; noWebgl: boolean }
export type ToWorker =
  | { t: 'init'; nowMs: number; debug: DebugFlags }
  | { t: 'command'; id: number; cmd: Command }
  | { t: 'saveNow' }
  | { t: 'advanceRealMs'; ms: number };                       // e2e/dev only
export type FromWorker =
  | { t: 'ready'; founded: boolean }
  | { t: 'snapshot'; tick: number; anchorRealMs: number; ui: UiSnapshot }
  | { t: 'events'; events: SimEvent[] }
  | { t: 'commandResult'; id: number; result: CommandResult }
  | { t: 'error'; message: string };
export interface UiSnapshot { tick: number; date: string; company: Company | null }   // B16 extends
// simHost.ts
export class SimHost {
  constructor(deps: { post(msg: FromWorker, transfer?: Transferable[]): void; now(): number; saves: SaveStore });
  handle(msg: ToWorker): Promise<void>;
  pump(): void;                                               // called every 250 ms by the worker shell
}
// debugFlags.ts
export function parseDebugFlags(search: string, enabled: boolean): DebugFlags;
// simClient.ts
export interface SimClient { send(cmd: Command): Promise<CommandResult>; on<T extends FromWorker['t']>(t: T, fn: (m: Extract<FromWorker, { t: T }>) => void): () => void; saveNow(): void }
export function createSimClient(worker: Worker): SimClient;
// store.ts
export const ui: Signal<UiSnapshot | null>;
```

**Loop rule:**
- Before the company is founded, no ticks run.
- `due = anchorTick + floor((now − anchorRealMs) × timescale / 1000) − state.tick`.
- **If `0 < due ≤ 300`:** run fine ticks until caught up, or until 50 ms of `now()` has passed in this pump.
- **If `due > 300`:** call `catchUp(due)` (in M0: fine ticks to the hour, then coarse, then fine), and then re-anchor.
- **After any command:** post `commandResult` and a fresh snapshot.
- **Autosave:** every 30,000 ms of `now()`, and on `saveNow`.
- **`freeze`:** never tick.

- [ ] **Step 1: Write failing tests**

```ts
// tests/worker/simHost.test.ts — fake now(), fake post(), in-memory SaveStore
it('runs one tick per real second after founding', async () => { /* init, found, now += 1000, pump → last snapshot.tick === 1 */ });
it('applies commands at once and posts commandResult then snapshot', async () => { /* order of posted types */ });
it('catches up after a 3-minute and a 2-hour gap without double counting', async () => {
  // found at now=0; now=180_000 → pump → tick 180; now=180_000+7_200_000 → pump → tick 180+7200;
  // now += 1000 → pump → tick 7381
});
it('timescale 60 runs 60 ticks per real second; freeze runs none', async () => {});
it('autosaves every 30 s and on saveNow', async () => {});
// tests/client/debugFlags.test.ts
it('ignores flags when disabled', () => expect(parseDebugFlags('?timescale=60&seed=5', false)).toEqual({ timescale: 1, freeze: false, seed: null, scene: 'none', noWebgl: false }));
it('parses and clamps when enabled', () => expect(parseDebugFlags('?timescale=9999&seed=5&scene=demo&freeze=1', true)).toEqual({ timescale: 600, freeze: true, seed: 5, scene: 'demo', noWebgl: false }));
```

- [ ] **Step 2: Run them**

  Run: `npx vitest run tests/worker tests/client`
  Expected: FAIL.

- [ ] **Step 3: Implement**

  - **Worker shell:** `sim.worker.ts` builds a `SimHost` with `post: (m, t) => self.postMessage(m, t ?? [])`, `now: () => Date.now()` (the worker shell is outside `src/sim`) and the IndexedDB store. It runs `setInterval(pump, 250)`.
  - **Debug flags:** allowed only when `import.meta.env.DEV || import.meta.env.MODE === 'e2e'`. Timescale is clamped to [1, 600].
  - **Main thread** (`main.tsx`):
    - Create the worker with `new Worker(new URL('./worker/sim.worker.ts', import.meta.url), { type: 'module' })`.
    - Post `saveNow` on `visibilitychange` → hidden.
    - Show `formatGameDate` in `[data-testid=game-date]`.

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run check`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat: simulation worker, protocol and real-time loop`, then push.

---

### Task 5 (A5): Save system

**Files:**
- Create: `src/save/serialize.ts`, `src/save/saveFile.ts`, `src/save/migrations.ts`, `src/save/slots.ts`, `src/save/exportCode.ts`, `tests/fixtures/saves/v1-founding.json` (generated in Step 3)
- Modify: `src/worker/simHost.ts` (load on init; catch up for `now − savedAtRealMs`)
- Test: `tests/save/save.test.ts`

**Interfaces:**
- Consumes: A2 `hashState`, `cyrb53`, `canonicalStringify`; A3 `GameState`.
- Produces:

```ts
export const SAVE_VERSION = 1;                                // SaveFile and SaveStore come from src/save/types.ts (A4)
export type LoadError = 'BAD_FORMAT' | 'BAD_CHECKSUM' | 'TOO_NEW' | 'INVALID_STATE';
export function serializeState(state: GameState): unknown;   // typed arrays → {$ta, b64}; omits keys in DERIVED_KEYS
export function deserializeState(data: unknown): GameState;  // rebuilds derived keys (B2 adds 'world': regenerated from seed)
export const DERIVED_KEYS: string[];                          // A5: []; B2 adds 'world'
export function toSaveFile(state: GameState, savedAtRealMs: number): SaveFile;
export function fromSaveFile(file: unknown): { ok: true; state: GameState; savedAtRealMs: number } | { ok: false; error: LoadError };
export const MIGRATIONS: Record<number, (s: Record<string, unknown>) => Record<string, unknown>>;
export function migrate(file: SaveFile, registry?: typeof MIGRATIONS, target?: number): SaveFile;
export function createIdbSaveStore(dbName?: string): SaveStore & {
  writeManual(slot: 1 | 2 | 3 | 4 | 5, file: SaveFile): Promise<void>;
  readManual(slot: 1 | 2 | 3 | 4 | 5): Promise<SaveFile | null>;
  list(): Promise<{ slot: string; savedAtRealMs: number; tick: number; company: string }[]>;
};
export function encodeExportCode(file: SaveFile): Promise<string>;   // 'PMO1.' + base64url(gzip(JSON))
export function decodeExportCode(code: string): Promise<{ ok: true; file: SaveFile } | { ok: false; error: 'BAD_PREFIX' | 'BAD_DATA' }>;
```

- **Autosave slots:** `auto-0`, `auto-1`, `auto-2`, used in turn. A meta record holds the next index.
- **`loadLatestValid`:** tries the slots newest first by `savedAtRealMs` and returns the first that passes `fromSaveFile`.
- **Checksum:** `cyrb53(canonicalStringify({version, savedAtRealMs, seed, tick, state}))` in hex.

- [ ] **Step 1: Write failing tests** (`import 'fake-indexeddb/auto'`)

```ts
it('round-trips a state', () => { /* found + 200 ticks; hashState(deserialize(serialize(s))) === hashState(s) */ });
it('rejects a tampered checksum and a newer version', () => { /* BAD_CHECKSUM; version 99 → TOO_NEW */ });
it('rotates autosaves auto-0..2 and loads the newest', async () => {});
it('falls back to the previous valid autosave', async () => {
  // write 3 autosaves, then overwrite the newest record with '{"format":"pmo-save",' (truncated) → loadLatestValid returns the 2nd newest
});
it('export code round-trips and rejects junk', async () => {
  const code = await encodeExportCode(file); expect(code.startsWith('PMO1.')).toBe(true);
  expect((await decodeExportCode(code)).ok).toBe(true);
  expect(await decodeExportCode('hello')).toEqual({ ok: false, error: 'BAD_PREFIX' });
  expect(await decodeExportCode('PMO1.@@@')).toEqual({ ok: false, error: 'BAD_DATA' });
});
it('migrate applies steps in order', () => { /* registry {1: v→v+field a, 2: …} target 3 → version 3 with both changes */ });
it('loads the v1 fixture', () => { /* fromSaveFile(fixture).ok === true */ });
```

- [ ] **Step 2: Run them**

  Run: `npx vitest run tests/save`
  Expected: FAIL.

- [ ] **Step 3: Implement**

  - Use `CompressionStream('gzip')` and `DecompressionStream` (global in Node 22 and browsers).
  - `fromSaveFile` validates the shape before deserializing. Saves are untrusted input.
  - Generate the fixture: `createGame(42)`, found "Selene Rock Co" with the veteran, then `toSaveFile(s, 0)`. Write it with a one-off `npx vite-node` script, and delete the script.

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run check`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(save): versioned saves, IndexedDB slots, export codes`, then push.

---

### Task 6 (A6): Design tokens, fonts and app shell

**Files:**
- Create:
  - `src/ui/tokens.ts`, `src/ui/global.css`, `src/ui/icons.tsx`
  - `src/ui/shell/Shell.tsx`, `src/ui/shell/TopBar.tsx`, `src/ui/shell/TabRail.tsx`, `src/ui/shell/BottomTabs.tsx`, `src/ui/shell/Sheet.tsx`, `src/ui/shell/ContextPanel.tsx`, `src/ui/shell/NewsTicker.tsx`
  - `src/ui/shell/useBreakpoint.ts`, `src/ui/shell/tabs.ts`
- Modify: `src/ui/App.tsx`, `src/main.tsx` (font imports, `applyTokens`)
- Test: `tests/ui/contrast.test.ts`, `tests/ui/styleRules.test.ts`, `e2e/shell.spec.ts` (runs after A7)

**Interfaces:**
- Produces:

```ts
export const palette = { navy: '#1B2A41', burntOrange: '#C8551F', mustard: '#E1A730', teal: '#2A7F7A',
  cream: '#F2E8D5', rust: '#9C3D23', offBlack: '#1A1A1A', dustyPink: '#D89A8E' } as const;
export const bodyAccent = { luna: '#9A9A94', mars: '#B5482A', europa: '#7FB9C2', titan: '#C98A2E' } as const;
export const font = { display: '"Jost Variable", sans-serif', text: '"IBM Plex Sans", sans-serif', mono: '"IBM Plex Mono", monospace' };
export const space = [0, 4, 8, 12, 16, 24, 32, 48] as const;
export const radius = { card: 2, pill: 999 } as const;
export const motion = { fastMs: 120, baseMs: 220, slowMs: 420, industrial: 'cubic-bezier(0.65, 0, 0.25, 1)' } as const;
export function mix(a: string, b: string, t: number): string;   // sRGB hex lerp, lowercase hex out
export function contrast(fg: string, bg: string): number;         // WCAG 2.1
export function applyTokens(root: HTMLElement): void;             // --c-<name>, --font-*, --space-n, --motion-*
// tabs.ts
export type TabId = 'build' | 'people' | 'trade' | 'contracts' | 'codex' | 'settings';
export const TABS: { id: TabId; label: string; key: string }[];   // keys '1'..'6'
export const activeTab: Signal<TabId | null>;
```

- **Desktop layout (≥ 1024 px):**
  - top bar 48 px, navy background
  - left rail 72 px
  - tab panel 380 px wide, sliding over the map
  - right context panel 340 px
  - news ticker 28 px
- **Mobile layout:**
  - top strip 44 px
  - bottom tabs 56 px: build, people, trade, contracts, more (more opens codex and settings)
  - bottom sheets that snap to 50vh or 92vh
- **Test IDs:** `top-bar`, `tab-rail`, `bottom-tabs`, `tab-panel`, `context-panel`, `news-ticker`, `map-canvas`, `game-date`, `cash`.
- **Keyboard:** `1`–`6` open tabs, `Esc` closes.
- **Focus ring:** 2 px mustard, on `:focus-visible`.
- **Reduced motion:** `document.documentElement.dataset.motion = 'reduced'` follows the `(prefers-reduced-motion: reduce)` media query.
- **Fonts:** import `@fontsource-variable/jost`, `@fontsource/ibm-plex-sans/{400,500,600}.css` and `@fontsource/ibm-plex-mono/{400,500}.css`. Numbers use `font-variant-numeric: tabular-nums`.

- [ ] **Step 1: Write failing tests**

```ts
// tests/ui/contrast.test.ts
const TEXT: [string, string, number][] = [['offBlack','cream',14.32],['cream','navy',11.88],['rust','cream',5.56],['offBlack','mustard',8.10],['navy','mustard',6.72],['offBlack','dustyPink',7.40]];
const LARGE: [string, string, number][] = [['burntOrange','cream',3.62],['teal','cream',3.91]];
it.each(TEXT)('%s on %s is body-text safe', (f, b, v) => { const c = contrast(palette[f], palette[b]); expect(c).toBeCloseTo(v, 1); expect(c).toBeGreaterThanOrEqual(4.5); });
it.each(LARGE)('%s on %s is large-text safe', (f, b, v) => { const c = contrast(palette[f], palette[b]); expect(c).toBeCloseTo(v, 1); expect(c).toBeGreaterThanOrEqual(3); });
// tests/ui/styleRules.test.ts — read every file under src/ui and src/data
it('uses no backdrop-filter and no emoji', () => { /* no 'backdrop-filter'; no /\p{Extended_Pictographic}/u */ });
```

```ts
// e2e/shell.spec.ts
test('desktop shows the rail, phone shows bottom tabs', async ({ page }, info) => { /* by project name */ });
test('phone tab buttons are at least 44x44', async ({ page }) => { /* boundingBox of each button */ });
test('keyboard 2 opens People and Esc closes', async ({ page }) => {});
test('reduced motion is mirrored on <html>', async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); /* data-motion=reduced */ });
```

- [ ] **Step 2: Run them**

  Run: `npx vitest run tests/ui`
  Expected: FAIL.

- [ ] **Step 3: Implement**

  - Icons are inline SVG with a 2 px stroke and `currentColor`: build, people, trade, contracts, codex, settings, more, alert, power, workforce, reputation, trendUp, trendDown, trendFlat, close, compass.
  - Every icon-only button has an `aria-label`.

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run check`
  Expected: PASS. The e2e spec runs in A7.

- [ ] **Step 5: Commit**

  `feat(ui): design tokens, fonts and responsive shell`, then push.

---

### Task 7 (A7): CI, Pages deploy, Playwright and bundle budget

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/pages.yml`, `playwright.config.ts`, `scripts/check-bundle-size.mjs`, `e2e/helpers.ts`, `e2e/smoke.spec.ts`

**Interfaces:**
- Produces:
  - `e2e/helpers.ts`:
    - `gotoGame(page, params?: Record<string,string>)`: goes to `/?<params>`. The default params are `timescale=60&seed=42`.
    - `api(page)`: typed access to `window.__pmo` (B16 fills it in).
  - Playwright projects `phone` (390×844, `isMobile`, `hasTouch`, DPR 2) and `desktop` (1440×900).

- **Playwright config:**
  - `webServer`: `npm run build:e2e && npx vite preview --mode e2e --port 4173 --strictPort`.
  - `expect.toHaveScreenshot: { maxDiffPixelRatio: 0.01 }`, `retries: 0`.
- **`ci.yml`** runs on push and pull_request. It has 4 jobs on `ubuntu-latest` with Node 22 and `npm ci`:
  1. `check`: `npm run check`.
  2. `build`: `npm run build && npm run size`.
  3. `e2e`: `npx playwright install --with-deps chromium && npm run test:e2e`, uploading the report on failure.
  4. `bot`: `npm run bot`.
- **`pages.yml`:**
  - Triggers: push to `claude/vibrant-goodall-teqhde` or `main`, and `workflow_dispatch`.
  - Permissions: `pages: write`, `id-token: write`, `contents: read`. Concurrency group `pages`.
  - Steps: build with `PMO_BASE=/Planetary-Mining-Operations/`, then `actions/configure-pages@v6`, `actions/upload-pages-artifact@v5` (path `dist`), `actions/deploy-pages@v5`.
  - Use `actions/checkout@v7` and `actions/setup-node@v7`. If one of these majors fails, drop to the previous major (v6, v6, v5, v4, v4).
- **`check-bundle-size.mjs`:**
  - Read `dist/.vite/manifest.json`.
  - From the `index.html` entry, collect the entry file and its static `imports`, recursively. Workers and dynamic imports are excluded.
  - Gzip each file with `zlib.gzipSync` level 9 and sum.
  - Print a table. Exit 1 if the sum exceeds 1,572,864 bytes.

- [ ] **Step 1: Write the failing smoke test**

```ts
// e2e/smoke.spec.ts
test('the app boots and the date element exists', async ({ page }) => {
  await gotoGame(page);
  await expect(page.getByTestId('app')).toBeVisible();
});
```

- [ ] **Step 2: Run it**

  Run: `npx playwright test e2e/smoke.spec.ts`
  Expected: FAIL (no config yet).

- [ ] **Step 3: Implement the config, the workflows and the size script**

- [ ] **Step 4: Run everything**

  Run: `npm run build && npm run size && npx playwright test`
  Expected: PASS for the smoke and shell specs. Size is printed and under budget.

- [ ] **Step 5: Commit and verify the deploy**

  `ci: GitHub Actions checks, Pages deploy, e2e and bundle budget`, then push.
  - Check that the `ci` workflow is green on GitHub.
  - Ask the owner to enable Pages (Source: GitHub Actions) if `pages` fails with "Pages not enabled". Then re-run it.

---

# Part B — M1 Moon vertical slice

### Task 8 (B1): Shared vector math, noise and lunar terrain

**Files:**
- Create: `src/shared/vec3.ts`, `src/shared/scale.ts`, `src/shared/noise.ts`, `src/shared/terrain.ts`
- Test: `tests/shared/vec3.test.ts`, `tests/shared/terrain.test.ts`

**Interfaces:**
- Consumes: A2 `createRng`, `deriveSeed`.
- Produces:

```ts
// vec3.ts
export type Vec3 = readonly [number, number, number];
export function add(a: Vec3, b: Vec3): Vec3; export function sub(a: Vec3, b: Vec3): Vec3; export function scale(a: Vec3, k: number): Vec3;
export function dot(a: Vec3, b: Vec3): number; export function cross(a: Vec3, b: Vec3): Vec3; export function len(a: Vec3): number;
export function normalize(a: Vec3): Vec3; export function angleBetween(a: Vec3, b: Vec3): number;
export function tangentBasis(dir: Vec3): { east: Vec3; north: Vec3 };     // north = +Y projected; at poles east = +X
export function localToDir(center: Vec3, basis: { east: Vec3; north: Vec3 }, x: number, y: number, radius: number): Vec3; // gnomonic
export function dirToLocal(center: Vec3, basis: { east: Vec3; north: Vec3 }, dir: Vec3, radius: number): { x: number; y: number };
export function latLon(dir: Vec3): { lat: number; lon: number };          // radians
export function fromLatLon(lat: number, lon: number): Vec3;
// scale.ts
export const LUNA_RADIUS = 100, BIRD_EYE_MIN_ALT = 1.5, LOCAL_MAX_ALT = 30, PLANETARY_ALT = 60, MAX_ALT = 400;
export const ROVER_SPEED = 0.3, BELT_SPEED = 0.5, WALK_SPEED = 0.05;     // world units per game minute
export const SETTLEMENT_RADIUS = 10, PLOT_SPACING = 2.2, MAX_ROAD_SLOPE = 0.35, MAX_PLOT_SLOPE = 0.25;
// noise.ts
export type Noise3 = (x: number, y: number, z: number) => number;
export function createNoise(seed: number, label: string): Noise3;         // simplex-noise createNoise3D(rng.next)
export function fbm(n: Noise3, p: Vec3, octaves: number, lacunarity?: number, gain?: number): number;
// terrain.ts
export type SurfaceClass = 0 | 1 | 2 | 3 | 4;                              // highland, maria, craterFloor, rim, polarFrost
export const HEIGHT_MIN = -1.2, HEIGHT_MAX = 1.6;
export interface Terrain { height(dir: Vec3): number; mariaMask(dir: Vec3): number; surfaceClass(dir: Vec3): SurfaceClass; slopeAt(dir: Vec3, step?: number): number }
export function createTerrain(seed: number): Terrain;
```

**Terrain recipe (pinned):**
- `base = 0.55 × fbm(n('base'), dir × 1.6, 5)`.
- `m = smoothstep(0.05, 0.25, fbm(n('maria'), dir × 0.9, 3))`, then `h −= 0.35 × m`.
- **Craters:** 420 craters.
  - Centres: a Fibonacci sphere, jittered by rng `'craters'` (±0.35 of the mean spacing).
  - Radius: `r = 0.6 + 5.4 × u³` world units.
  - Depth: `d = 0.22 × r^0.55`.
  - For `x = arcDistance / r`: if `x < 1`, `h += d(x² − 1)`. If `0.6 < x < 1.8`, `h += 0.35 d × exp(−((x − 1)/0.22)²)`.
  - Find craters through a bucket grid of 8×8 cells per cube face, checking neighbouring cells by angular radius.
- Clamp to `[HEIGHT_MIN, HEIGHT_MAX]`.
- **`surfaceClass`:**
  - 4 (polar frost) if `|lat| > 80°` and `h < 0`
  - 2 (crater floor) if inside a crater with `x < 0.7`
  - 3 (rim) if `0.85 < x < 1.25`
  - 1 (maria) if `m > 0.5`
  - 0 (highland) otherwise
- **`slopeAt`:** the maximum `|Δh| / step` over 4 tangent directions, with `step` 0.05.

- [ ] **Step 1: Write failing tests**

```ts
it('is deterministic across instances', () => { const a = createTerrain(7), b = createTerrain(7); /* 100 dirs equal */ });
it('is continuous', () => { /* 1000 random dirs: |h(d) − h(rotate(d, 1e-4 rad))| < 0.05 */ });
it('stays in range and never NaN', () => { /* 20,000 samples within [HEIGHT_MIN, HEIGHT_MAX] */ });
it('is safe at the poles', () => { /* finite at (0,±1,0); tangentBasis orthonormal at poles */ });
it('has maria on 15–45% of the surface', () => {});
it('samples 10,000 heights in < 60 ms', () => {});
it('gnomonic local round-trip', () => { /* dirToLocal(localToDir(c,b,3,-2,100)) ≈ {3,-2} within 1e-9 */ });
```

- [ ] **Step 2: Run them**

  Run: `npx vitest run tests/shared`
  Expected: FAIL.

- [ ] **Step 3: Implement** the pinned recipe.

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run check`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(shared): vector math, seeded noise and lunar terrain`, then push.

---

### Task 9 (B2): Sections and plots

**Files:**
- Create: `src/sim/world/sections.ts`, `src/sim/world/plots.ts`, `src/sim/world/luna.ts`
- Modify: `src/sim/state.ts` (adds `world`), `src/save/serialize.ts` (`DERIVED_KEYS.push('world')`)
- Test: `tests/sim/world/sections.test.ts`, `tests/sim/world/plots.test.ts`

**Interfaces:**
- Consumes: B1 everything.
- Produces:

```ts
export type RawGoodId = 'regolith' | 'ilmenite' | 'anorthite' | 'helium3' | 'kreep' | 'polarVolatiles';
export interface Section { id: number; center: Vec3; neighbors: number[]; polygon: Vec3[]; hubPlotId: number }
export type PlotKind = 'hub' | 'deposit' | 'build' | 'public';
export interface Plot { id: number; sectionId: number; kind: PlotKind; dir: Vec3; slope: number; deposit: { goodId: RawGoodId; richness: number } | null }
export interface World { bodyId: 'luna'; radius: number; sections: Section[]; plots: Plot[]; foundingSectionId: number; terrain: Terrain }
export function generateSections(seed: number, count: number): Omit<Section, 'hubPlotId'>[];
export function sectionAt(sections: readonly { center: Vec3 }[], dir: Vec3): number;
export function generatePlots(seed: number, terrain: Terrain, sections: Omit<Section, 'hubPlotId'>[],
  accept?: (sectionId: number, hub: Vec3, candidate: Vec3) => boolean): { plots: Plot[]; hubPlotIds: number[] };
export function generateLuna(seed: number): World;
```

**Algorithms (pinned):**
- **Sections:** 60 centres on a Fibonacci sphere, jittered by rng `'sections'` (±0.35 of the mean spacing angle).
  - **Delaunay:** brute force. A triple (i, j, k) is a hull face if every other point lies on one side of its plane.
  - **Neighbours:** the hull edges.
  - **Polygon:** the normalised outward face normals around each centre, sorted by angle.
- **Plots for each section,** in this order:
  1. **Hub:** the flattest of 16 candidates within 3 units of the centre.
  2. **Build plots:** 12, by Poisson-disk sampling. Each lies within `SETTLEMENT_RADIUS` of the hub, has slope < `MAX_PLOT_SLOPE`, lies inside its section, and passes `accept`.
  3. **Public plots:** 2, by the same rules.
  4. **Deposits:** for each raw good, evaluate its richness field at 64 candidates. Take up to 2 local maxima above the threshold.

  | Good | Deposit rule |
  |---|---|
  | regolith | Exactly 1 in every section, richness 1.0 |
  | polarVolatiles | Only where \|lat\| ≥ 60° |
  | ilmenite, helium3 | Field weighted by `mariaMask` |
  | anorthite | Field weighted by `1 − mariaMask` |
  | kreep | Only within 50° of a seeded "terrane" direction |

  - All plots keep at least `PLOT_SPACING` from each other.
  - Richness is in [0.6, 1.6].
- **Founding section:** among sections with centre latitude ≤ −60°, the one with the highest summed richness of polarVolatiles, ilmenite and regolith. If it has no ilmenite deposit, convert its build plot nearest the hub into ilmenite with richness 1.0.

- [ ] **Step 1: Write failing tests**

```ts
it('builds 60 sections with 116 Delaunay triangles', () => { /* Euler 2N−4 */ });
it('neighbors are symmetric and ≥ 3', () => {});
it('sectionAt(center_i) === i', () => {});
it('polygon vertices are equidistant to the centre and two neighbours (1e-9)', () => {});
it('every plot lies in its section; per section 1 hub, 12 build, 2 public, ≥ 1 regolith deposit', () => {});
it('plots keep 2.2 units apart', () => {});
it('polar volatiles only at |lat| ≥ 60°', () => {});
it('founding section has regolith, ilmenite and polarVolatiles deposits', () => {});
it('is deterministic and seed-sensitive', () => { /* hashState(world without terrain) */ });
it('generateLuna runs in < 1500 ms', () => {});
```

- [ ] **Step 2: Run them**

  Run: `npx vitest run tests/sim/world`
  Expected: FAIL.

- [ ] **Step 3: Implement**

  `createGame` calls `generateLuna(seed)` into `state.world`. `world` is not saved; `deserializeState` regenerates it.

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run check`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(sim): Luna sections and plots`, then push.

---

### Task 10 (B3): Data tables

**Files:**
- Create: `src/data/goods.ts`, `src/data/buildings.ts`, `src/data/balance.ts`, `src/data/names.ts`
- Test: `tests/data/integrity.test.ts`

**Interfaces:**
- Produces:

```ts
export type GoodId = RawGoodId | 'steel' | 'titaniumAlloy' | 'aluminium' | 'sinteredConcrete' | 'glass' | 'siliconWafers'
  | 'rareEarthOxides' | 'oxygen' | 'potableWater' | 'hydrogen' | 'fertiliser' | 'hydroponicProduce'
  | 'electronics' | 'machinery' | 'prefabStructures' | 'solarPanels';
export type GoodGroup = 'raw' | 'refined' | 'component';
export interface GoodDef { id: GoodId; name: string; group: GoodGroup; basePriceCents: number; npc: { volumeTph: number; demandElasticity: number; supplyElasticity: number }; crate: 'ore' | 'ingot' | 'liquid' | 'crate' | 'panel'; necessity: 'air' | 'water' | 'food' | null }
export const GOODS: Record<GoodId, GoodDef>; export const GOOD_IDS: GoodId[];
export type Skill = 'miner' | 'technician' | 'engineer'; export const SKILLS: Skill[];
export type RecipeId = string;
export interface RecipeDef { id: RecipeId; name: string; inputs: Partial<Record<GoodId, number>>; outputs: Partial<Record<GoodId, number>> } // tonnes per game hour at L1
export type BuildingTypeId = 'depot' | 'regolithScoop' | 'mine' | 'iceDrill' | 'he3Harvester' | 'smelter' | 'waferFab' | 'chemicalRefinery'
  | 'electrolysisPlant' | 'airPlant' | 'waterPlant' | 'hydroponicsFarm' | 'assemblyWorks' | 'solarArray' | 'crewQuarters' | 'habitatDome' | 'warehouse' | 'roverGarage';
export interface BuildingDef { id: BuildingTypeId; name: string; plot: 'hub' | 'deposit' | 'build'; depositGoods: RawGoodId[]; extractTph: number; recipes: RecipeId[];
  jobs: Partial<Record<Skill, number>>; powerKw: number; housing: { capacity: number; quality: number } | null; storageT: number; buses: number;
  cost: { cents: number; materials: Partial<Record<GoodId, number>> }; buildHours: number; belt: boolean }
export const BUILDINGS: Record<BuildingTypeId, BuildingDef>; export const RECIPES: Record<RecipeId, RecipeDef>;
// balance.ts — functions and constants listed under "Balance" below
```

**Goods.** Prices are in LM per tonne; store them ×100 as cents. NPC columns are volume (t/h), demand elasticity εd and supply elasticity εs.

| id | name | group | LM/t | NPC t/h | εd | εs | crate |
|---|---|---|---|---|---|---|---|
| regolith | Lunar regolith | raw | 15 | 120 | 0.8 | 0.5 | ore |
| ilmenite | Ilmenite | raw | 60 | 40 | 0.8 | 0.5 | ore |
| anorthite | Anorthite | raw | 45 | 40 | 0.8 | 0.5 | ore |
| helium3 | Helium-3 | raw | 60000 | 0.05 | 1.5 | 0.5 | liquid |
| kreep | KREEP ore | raw | 180 | 10 | 0.8 | 0.5 | ore |
| polarVolatiles | Polar volatiles | raw | 120 | 15 | 0.8 | 0.5 | liquid |
| steel | Steel | refined | 400 | 12 | 1.0 | 0.6 | ingot |
| titaniumAlloy | Titanium alloy | refined | 2400 | 1.5 | 1.0 | 0.6 | ingot |
| aluminium | Aluminium | refined | 900 | 4 | 1.0 | 0.6 | ingot |
| sinteredConcrete | Sintered concrete | refined | 80 | 30 | 1.0 | 0.6 | crate |
| glass | Glass | refined | 300 | 8 | 1.0 | 0.6 | panel |
| siliconWafers | Silicon wafers | refined | 6000 | 0.4 | 1.0 | 0.6 | panel |
| rareEarthOxides | Rare-earth oxides | refined | 3500 | 0.8 | 1.0 | 0.6 | crate |
| oxygen | Oxygen | refined | 350 | 6 | 0.15 | 0.6 | liquid (necessity air) |
| potableWater | Potable water | refined | 250 | 8 | 0.15 | 0.6 | liquid (necessity water) |
| hydrogen | Hydrogen | refined | 1800 | 1.2 | 1.0 | 0.6 | liquid |
| fertiliser | Fertiliser | refined | 1500 | 1 | 1.0 | 0.6 | crate |
| hydroponicProduce | Hydroponic produce | refined | 4000 | 0.6 | 0.15 | 0.6 | crate (necessity food) |
| electronics | Electronics | component | 45000 | 0.3 | 1.2 | 0.8 | crate |
| machinery | Machinery | component | 12000 | 1.5 | 1.2 | 0.4 | crate |
| prefabStructures | Prefab structures | component | 400 | 10 | 1.2 | 0.4 | crate |
| solarPanels | Solar panels | component | 9000 | 0.6 | 1.2 | 0.4 | panel |

**Recipes** (tonnes per game hour at L1):

| id | building | inputs → outputs |
|---|---|---|
| steel | smelter | ilmenite 4 → steel 1.5 |
| titaniumAlloy | smelter | ilmenite 4 → titaniumAlloy 0.3 |
| aluminium | smelter | anorthite 4 → aluminium 0.8 |
| glass | smelter | anorthite 3 → glass 1.5 |
| sinteredConcrete | smelter | regolith 8 → sinteredConcrete 6 |
| siliconWafers | waferFab | glass 0.5 → siliconWafers 0.08 |
| rareEarthOxides | chemicalRefinery | kreep 2 → rareEarthOxides 0.25 |
| fertiliser | chemicalRefinery | kreep 1 + polarVolatiles 0.5 → fertiliser 0.3 |
| electrolysis | electrolysisPlant | polarVolatiles 3 → oxygen 1.2 + hydrogen 0.15 |
| airFromIlmenite | airPlant | ilmenite 4 → oxygen 0.9 |
| water | waterPlant | polarVolatiles 2 → potableWater 1.6 |
| produce | hydroponicsFarm | potableWater 0.2 + fertiliser 0.02 → hydroponicProduce 0.06 |
| solarPanels | assemblyWorks | siliconWafers 0.05 + aluminium 0.2 + glass 0.2 → solarPanels 0.08 |
| prefab | assemblyWorks | sinteredConcrete 1.5 + steel 0.5 → prefabStructures 1.2 |
| machinery | assemblyWorks | steel 0.4 + electronics 0.01 → machinery 0.08 |

The fertiliser recipe takes nitrogen from polar volatiles. The spec appendix lists only Jovian and Venus sources, so note this as an extension.

**Buildings** (L1 values). Jobs are per shift. Power: + produces, − consumes. Cost: LM plus tonnes of materials.

| id | plot | extracts / recipes | jobs (m/t/e) | kW | housing / storage / buses | cost | hours | belt |
|---|---|---|---|---|---|---|---|---|
| depot | hub | — | 0/0/0 | −50 | storage 3000 t | not buildable | — | no |
| regolithScoop | deposit regolith | 12 t/h | 3/0/0 | −120 | — | 2,500 + prefab 10, machinery 1 | 2 | yes |
| mine | deposit ilmenite, anorthite, kreep | 6 t/h (kreep ×0.5) | 6/1/0 | −250 | — | 6,000 + prefab 20, machinery 2 | 4 | yes |
| iceDrill | deposit polarVolatiles | 5 t/h | 4/1/0 | −300 | — | 5,000 + prefab 15, machinery 2 | 4 | yes |
| he3Harvester | deposit helium3 | 0.01 t/h | 8/2/1 | −900 | — | 40,000 + prefab 40, machinery 6, electronics 2 | 10 | yes |
| smelter | build | steel, titaniumAlloy, aluminium, glass, sinteredConcrete | 0/4/1 | −600 | — | 12,000 + prefab 40, machinery 4 | 6 | yes |
| waferFab | build | siliconWafers | 0/3/2 | −500 | — | 30,000 + prefab 30, machinery 4, electronics 2 | 8 | yes |
| chemicalRefinery | build | rareEarthOxides, fertiliser | 0/3/1 | −400 | — | 18,000 + prefab 35, machinery 4 | 6 | yes |
| electrolysisPlant | build | electrolysis | 0/2/1 | −700 | — | 10,000 + prefab 25, machinery 3 | 5 | yes |
| airPlant | build | airFromIlmenite | 0/2/0 | −300 | — | 7,000 + prefab 20, machinery 2 | 4 | yes |
| waterPlant | build | water | 0/2/0 | −200 | — | 6,000 + prefab 20, machinery 2 | 3 | yes |
| hydroponicsFarm | build | produce | 0/3/0 | −250 | — | 8,000 + prefab 25, glass 10 | 5 | yes |
| assemblyWorks | build | solarPanels, prefab, machinery | 0/4/2 | −450 | — | 20,000 + prefab 40, machinery 6 | 8 | yes |
| solarArray | build | — | 0/1/0 | +400 | — | 3,000 + solarPanels 2 | 2 | no |
| crewQuarters | build | — | 0/0/0 | −60 | housing 36, quality 5 | 4,000 + prefab 30 | 3 | no |
| habitatDome | build | — | 0/0/0 | −150 | housing 96, quality 15 | 15,000 + prefab 80, glass 20 | 8 | no |
| warehouse | build | — | 0/1/0 | −20 | storage 8000 t | 5,000 + prefab 30 | 3 | no |
| roverGarage | build | — | 0/1/0 | −80 | buses 4 | 6,000 + prefab 20, machinery 3 | 4 | no |

**Balance (`balance.ts`):**
- **Level scaling:**
  - `levelOutput(L) = 1 + 0.35(L − 1)`. Housing capacity and storage scale with it too.
  - `levelJobs(L, n) = ceil(n × (1 + 0.25(L − 1)))`.
  - `levelPower(L) = 1 + 0.3(L − 1)`.
  - `levelBuses(L) = 4 + (L − 1)`.
  - Upgrading from level L costs `cost × 0.6 × L` (cash and materials) and takes `buildHours × 0.5 × L` hours. `MAX_LEVEL = 10`.
- **Start:**
  - `START_CASH_CENTS = 25_000_000`.
  - `START_WORKERS = { miner: 18, technician: 12, engineer: 3 }`.
  - `START_STOCK_T = { prefabStructures: 150, machinery: 12, solarPanels: 10, electronics: 2, oxygen: 6, potableWater: 10, hydroponicProduce: 1.5, glass: 20 }`.
  - `START_BUILDINGS = ['crewQuarters', 'roverGarage', 'solarArray', 'solarArray']`, on the build plots nearest the hub, in this order.
- **People:**
  - `NEEDS_KG_PER_DAY = { oxygen: 0.84, potableWater: 3.0, hydroponicProduce: 1.8 }`.
  - `HOUSING_POWER_KW_PER_RESIDENT = 0` (housing uses its building kW).
  - `WAGE_CENTS_PER_DAY = { miner: 9000, technician: 13000, engineer: 20000 }`.
  - `WAGE_LEVEL = { low: { factor: 0.8, morale: -10 }, standard: { factor: 1, morale: 0 }, high: { factor: 1.25, morale: 10 } }`.
  - `MORALE = { base: 30, air: 15, water: 15, food: 15, power: 10, unpaid: -20, longCommuteMin: 45, longCommute: -5, driftPerHour: 2, strikeBelow: 25, strikeHours: 6, strikeResume: 35, emigrateBelow: 15, emigrateChancePerHour: 0.02, migrateMinMorale: 50 }`.
  - `migrationPerDay(pop) = 2 + 0.05 × pop`.
  - `moraleProductivity(m) = 0.85 + 0.003 × m`.
  - `commuteProductivity(min) = 1 − clamp((min − 20)/200, 0, 0.3)`.
- **Transport:**
  - `BUS_CAPACITY = 24`, `BUS_LEAD_MINUTES = 40`, `STOP_DWELL_MINUTES = 1`, `MAX_STOPS = 4`.
  - `BELT_CAPACITY_TPH = 30` (scaled by `levelOutput`), `BUFFER_HOURS = 2`.
- **Land and market:**
  - `LAND_PRICE = { baseCents: 6_000_000, growth: 1.6 }`.
  - `MARKET = { meanReversion: 0.03, momentum: 0.6, noiseSigma: 0.01, boundsFactor: 20, historyHours: 168 }`.
  - `COLONY = { startPop: 1200, demandExponent: 0.8 }`.
- **Offline:** `OFFLINE = { capMs: 28_800_000, efficiency: 0.5, fineThresholdTicks: 300, awayScreenMinHours: 10 }`.

**`names.ts`:** 160 first names and 160 surnames. International, Latin script with diacritics allowed, no famous people, all unique.

- [ ] **Step 1: Write failing tests**

```ts
it('has 22 goods with positive prices and volumes', () => {});
it('every recipe good exists and every building recipe exists', () => {});
it('every recipe adds value at base prices', () => { for (const r of Object.values(RECIPES)) expect(value(r.outputs)).toBeGreaterThan(value(r.inputs)); });
it('deposit buildings only list raw goods', () => {});
it('levelOutput(10) = 4.15, levelJobs(10, 6) = 20, levelPower(10) = 3.7', () => {});
it('has 160 unique first and last names', () => {});
```

- [ ] **Step 2: Run them**

  Run: `npx vitest run tests/data`
  Expected: FAIL.

- [ ] **Step 3: Implement** the tables exactly as above.

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run check`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(data): M1 goods, buildings, recipes and balance`, then push.

---

### Task 11 (B4): Ledger and inventories

**Files:**
- Create: `src/sim/ledger.ts`, `src/sim/inventory.ts`, `src/sim/invariants.ts`
- Test: `tests/sim/ledger.test.ts`

**Interfaces:**
- Produces:

```ts
export type AccountId = 'player' | 'world' | `escrow:${number}`;
export interface Ledger { balances: Record<string, number> }          // integer cents
export function createLedger(): Ledger;
export function transfer(l: Ledger, from: AccountId, to: AccountId, cents: number): boolean; // false if from ≠ 'world' and insufficient; throws if not a safe non-negative integer
export function balance(l: Ledger, id: AccountId): number;
export type Inventory = Partial<Record<GoodId, number>>;               // integer kg
export function add(inv: Inventory, g: GoodId, kg: number): void;     // kg integer ≥ 0
export function take(inv: Inventory, g: GoodId, kg: number): boolean; // false and no change if short
export function totalKg(inv: Inventory): number;
export function moveKg(from: Inventory, to: Inventory, g: GoodId, kg: number): number; // moves min(kg, available), returns moved
export function checkInvariants(state: GameState): string[];          // debug: negative stock, unsafe money, NaN
```

- The world account may go negative. The sum of all balances stays constant.
- `createGame` mints the starting cash with `transfer(world → player)`.

- [ ] **Step 1: Write failing tests**

```ts
it('conserves money across random transfers (fast-check)', () => { /* Σ balances constant */ });
it('refuses overdraft except for world', () => {});
it('rejects fractional cents', () => { expect(() => transfer(l, 'world', 'player', 1.5)).toThrow(); });
it('never makes stock negative (fast-check take/add/move)', () => {});
```

- [ ] **Step 2: Run them**

  Run: `npx vitest run tests/sim/ledger.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement**

  In dev builds, the worker runs `checkInvariants` after each tick and posts an `error` for any finding.

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run check`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(sim): ledger, inventories and invariants`, then push.

---

### Task 12 (B5): Roads

**Files:**
- Create: `src/sim/world/roads.ts`
- Modify: `src/sim/world/luna.ts` (passes a reachability `accept` to `generatePlots`)
- Test: `tests/sim/world/roads.test.ts`

**Interfaces:**
- Consumes: B1 `Terrain` and local projection; B2 `World` and `sectionAt`.
- Produces:

```ts
export const GRID_CELL = 0.25, GRID_SIZE = 129;                       // ±16 units around the hub
export interface SectionGrid { sectionId: number; hub: Vec3; basis: { east: Vec3; north: Vec3 }; passable: Uint8Array; cost: Float32Array; hubComponent: Uint8Array }
export interface Polyline { id: number; cells: number[]; points: Vec3[] }   // points: smoothed unit dirs
export interface RoadNet { sectionId: number; roadCells: number[]; polylines: Polyline[] }
export function buildSectionGrid(world: World, sectionId: number, hub: Vec3): SectionGrid;
export function cellOf(g: SectionGrid, dir: Vec3): number | null;
export function createRoadNet(g: SectionGrid): RoadNet;                // seeds the hub cell
export function connectToNetwork(g: SectionGrid, net: RoadNet, from: Vec3, newId: () => number): Polyline | null;
export function roadPath(g: SectionGrid, net: RoadNet, from: Vec3, to: Vec3): { points: Vec3[]; length: number } | null; // A* restricted to road cells
export function smooth(points: Vec3[], radius: number): Vec3[];        // RDP 0.15 + centripetal Catmull-Rom at 0.2 spacing
```

**Rules:**
- **Passable cell:** slope ≤ `MAX_ROAD_SLOPE` and `sectionAt(cell) === sectionId`.
- **Step cost:** `length × (1 + 4 × slope²)`. Cells within 0.6 units of a plot that is not an endpoint cost ×3.
- **Search:** 8-connected A* with the octile heuristic. `connectToNetwork` stops at the first road cell reached, using Dijkstra from `from`.
- **Grids are not saved.** `buildSectionGrid` is pure from the world, so it is rebuilt on load and cached in a non-saved `Map` on the engine.

- [ ] **Step 1: Write failing tests**

```ts
it('never routes through a cell steeper than 0.35', () => {});
it('returns null when the target is walled off', () => { /* fake Terrain: steep ring around a point */ });
it('grows the network: the second road ends on an existing road cell', () => {});
it('roadPath follows road cells only and length ≥ straight distance', () => {});
it('smooth keeps endpoints', () => {});
it('generated build, deposit and public plots are all reachable from the hub', () => {});
it('builds a grid in < 40 ms and connects in < 15 ms', () => {});
```

- [ ] **Step 2: Run them**

  Run: `npx vitest run tests/sim/world/roads.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement**

  In `generateLuna`, pass `accept = (sid, hub, c) => hubComponent[cellOf(c)] === 1`. Plot counts stay exact because the sampler draws more candidates.

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run check`
  Expected: PASS. B2 tests still pass.

- [ ] **Step 5: Commit**

  `feat(sim): section road grids and A* road network`, then push.

---

### Task 13 (B6): Founding charter, ownership, land office and construction

**Files:**
- Create: `src/sim/build/construction.ts`, `src/sim/build/landOffice.ts`
- Modify: `src/sim/state.ts`, `src/sim/commands.ts`, `src/sim/events.ts`, `src/sim/engine.ts` (system `construction` after `clock`)
- Test: `tests/sim/build/construction.test.ts`

**Interfaces:**
- Consumes: B2–B5.
- Produces:

```ts
export type BuildingStatus = 'constructing' | 'upgrading' | 'active' | 'blocked' | 'unpowered' | 'unstaffed' | 'striking';
export interface Building { id: number; plotId: number; sectionId: number; type: BuildingTypeId; level: number; status: BuildingStatus; progress: number;
  recipeId: RecipeId | null; priority: 'high' | 'normal' | 'low'; input: Inventory; output: Inventory; remainders: Partial<Record<GoodId, number>>; beltId: number | null }
export interface SectionState { id: number; owner: 'player' | 'authority'; depot: Inventory; storageCapKg: number; roadNet: RoadNet | null }
// GameState gains: ledger: Ledger; sections: SectionState[]; buildings: Building[]; landPurchases: number
export function landPrice(purchases: number): number;                   // round(6_000_000 × 1.6^n)
export function buyableSections(state: GameState): number[];            // authority-owned, adjacent to an owned section
// Command union gains:
// | { t: 'build'; plotId: number; type: BuildingTypeId; recipeId?: RecipeId } | { t: 'upgrade'; buildingId: number }
// | { t: 'demolish'; buildingId: number } | { t: 'setRecipe'; buildingId: number; recipeId: RecipeId }
// | { t: 'setPriority'; buildingId: number; priority: 'high' | 'normal' | 'low' } | { t: 'buySection'; sectionId: number }
// CommandError gains: 'NOT_OWNED' | 'PLOT_OCCUPIED' | 'WRONG_PLOT_KIND' | 'NO_DEPOSIT_MATCH' | 'INSUFFICIENT_CASH'
//   | 'INSUFFICIENT_MATERIALS' | 'NO_ROAD_ACCESS' | 'MAX_LEVEL' | 'NOT_ADJACENT' | 'INVALID_RECIPE' | 'BUSY'
// SimEvent gains: { t: 'constructionStarted'; buildingId: number } | { t: 'buildingCompleted'; buildingId: number }
//   | { t: 'sectionBought'; sectionId: number }
```

**Rules:**
- **`foundCompany`:**
  - The founding section becomes player-owned, with a depot (3,000 t) on its hub and a road net seeded at the hub.
  - The `START_BUILDINGS` are created active on the build plots nearest the hub, each with a road.
  - Starting cash and stock are added. (Workers come in B10.)
- **`build` checks, in this order:**
  1. founded
  2. plot exists (`UNKNOWN_ID`)
  3. section owned
  4. plot empty
  5. plot kind
  6. deposit good
  7. cash
  8. materials in that section's depot
  9. road (`connectToNetwork` must succeed)

  Only when all pass does it deduct cash (to world), remove materials (consumed), add the road and create the building in `constructing`.
- **Construction progress:** `progress += dt / (buildHours × 60)` while constructing or upgrading. At 1 the building turns `active`.
- **Upgrade:** charges the upgrade cost and status becomes `upgrading`. The building does not produce until done.
- **Demolish:** refunds 25% of the build cost in cash. Buffers return to the depot up to free space; the rest is lost. The road stays.
- **`buySection`:**
  - Check order: founded, adjacent (`NOT_ADJACENT`), cash.
  - Effect: price to world, `landPurchases += 1`, a depot on the hub, a road net, and the `sectionBought` event.

- [ ] **Step 1: Write failing tests**

```ts
it('founding grants the charter section, depot, 4 buildings, LM 250,000 and the starting stock', () => {});
it('builds a mine on an ilmenite plot: −LM 6,000, −20 t prefab, −2 t machinery, constructing', () => {});
it('completes after 4 game hours (240 fine ticks) with a buildingCompleted event', () => {});
it.each(['NOT_OWNED','PLOT_OCCUPIED','WRONG_PLOT_KIND','NO_DEPOSIT_MATCH','INSUFFICIENT_CASH','INSUFFICIENT_MATERIALS'])('rejects with %s and charges nothing', () => {});
it('road-locked plot fails with NO_ROAD_ACCESS and charges nothing', () => {
  // move the target plot's dir outside its section (all cells impassable) → NO_ROAD_ACCESS; cash and depot unchanged
});
it('upgrade 1→2 costs 0.6× build cost and 0.5× build hours', () => {});
it('land office: LM 60,000 then LM 96,000; only adjacent sections', () => {});
```

- [ ] **Step 2: Run them**

  Run: `npx vitest run tests/sim/build`
  Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run check`
  Expected: PASS. The A3 determinism test still passes.

- [ ] **Step 5: Commit**

  `feat(sim): founding charter, construction and land office`, then push.

---

### Task 14 (B7): Power grid

**Files:**
- Create: `src/sim/build/power.ts`
- Modify: `src/sim/engine.ts` (`power` after `construction`), `src/sim/events.ts`, `src/sim/state.ts`
- Test: `tests/sim/build/power.test.ts`

**Interfaces:**
- Produces:
  - `SectionState` gains `power: { supplyKw: number; demandKw: number; factor: number }`.
  - `export function sectionPower(state, sectionId): { supplyKw; demandKw; factor }`.
  - New event: `{ t: 'brownout'; sectionId: number; factor: number }`. It fires when the factor first falls below 1. It re-arms once the factor is back to 1.

**Rules:**
- **Supply:** the sum over active solar arrays of `400 × levelOutput(L) × staffing` (staffing from B11; assume 1 until then).
- **Demand:** the sum over active and blocked consumers of `|kW| × levelPower(L)`.
- **Factor:** `demand === 0 ? 1 : min(1, supply / demand)`.
- **Status:** buildings whose section has factor < 1 get status `unpowered` unless they are constructing or upgrading.

- [ ] **Step 1: Write failing tests**

```ts
it('two arrays supply 800 kW; depot+quarters+garage demand 190 kW; factor 1', () => {});
it('adding a smelter (600) gives factor 800/790 → 1; adding a mine too gives 800/1040', () => {});
it('fires brownout once and re-arms after recovery', () => {});
```

- [ ] **Step 2: Run them**

  Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run check`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(sim): section power grid and brownouts`, then push.

---

### Task 15 (B8): Conveyor belts

**Files:**
- Create: `src/sim/build/belts.ts`, `src/shared/lanes.ts`
- Modify: `src/sim/build/construction.ts` (build creates a belt when `def.belt`; demolish removes it), `src/sim/engine.ts` (`belts` before `production`), `src/sim/events.ts`
- Test: `tests/sim/build/belts.test.ts`, `tests/shared/lanes.test.ts`

**Interfaces:**
- Produces:

```ts
export interface Batch { enterTick: number; arriveTick: number; goodId: GoodId; kg: number }
export interface Lane { batches: Batch[]; jammed: boolean }
export interface Belt { id: number; buildingId: number; sectionId: number; points: Vec3[]; length: number; transitTicks: number; out: Lane; in: Lane }
// GameState gains belts: Belt[]
export function beltCapacityKgPerTick(level: number): number;         // 30 t/h × levelOutput(L) / 60 × 1000
export function stepBelts(state: GameState, ctx: StepContext): void;
// SimEvent gains { t: 'beltJammed'; beltId: number }   (edge-triggered)
// src/shared/lanes.ts (used by the renderer)
export function cratePositions(lane: { batches: { enterTick: number }[]; jammed: boolean }, gameTime: number, transitTicks: number, length: number, spacing: number): number[];
```

**Rules:**
- **Belt path:** a straight great-circle path from the building plot to the hub, sampled every 0.2 units. `length` is the arc length in world units. `transitTicks = ceil(length / BELT_SPEED)`.
- **Fine mode, for each lane:**
  1. **Deliver:** while the head batch has `arriveTick ≤ tick`, deliver it if the destination has space. Otherwise set `jammed = true` and stop.
  2. **Enter:** if the lane is not jammed and the queue length is under `transitTicks + 1`, push one batch of up to the per-tick capacity.
     - **Out lane:** takes from the building output (largest good first).
     - **In lane:** takes from the depot the input with the largest deficit. Deficit = input target (`BUFFER_HOURS ×` recipe input rate) minus buffer minus in-transit.
- **Destination space:** depot `storageCapKg − totalKg(depot)`. Building input buffer: `BUFFER_HOURS ×` hourly input.
- **Coarse mode:** first deliver all queued batches where space allows. Then move `min(capacity × dt, available, space)` directly, with no batches.
- **`cratePositions`:**
  - The batch at queue index i (head = 0) sits at `min(length, (gameTime − enterTick)/transitTicks × length)`.
  - If jammed, it is capped at `length − i × spacing`.
  - Results are clamped to [0, length] and are non-increasing from the head.

- [ ] **Step 1: Write failing tests**

```ts
it('a batch arrives exactly transitTicks after entering', () => {});
it('moves at most the per-tick capacity', () => {});
it('jams when the depot is full and stops new entries', () => {});
it('conserves goods across 500 ticks without production (fast-check over lengths)', () => {});
it('coarse moves capacity×60 within one step', () => {});
it('cratePositions: monotonic, within [0,length], jam spacing respected', () => {});
```

- [ ] **Step 2: Run them**

  Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run check`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(sim): conveyor belts with transit and jams`, then push.

---

### Task 16 (B9): Production

**Files:**
- Create: `src/sim/build/production.ts`
- Modify: `src/sim/engine.ts` (`production` after `belts`), `src/sim/state.ts` (`stats.producedKg`)
- Test: `tests/sim/build/production.test.ts`

**Interfaces:**
- Consumes: B6 `Building`, B7 power, B8 belts. B11 later provides `staffing(state, building): number`; until then a stub returns 1.
- Produces:
  - `export function productionRateTph(state, b): Partial<Record<GoodId, number>>`
  - `export function stepProduction(state, ctx): void`
  - `GameState.stats = { producedKg: Partial<Record<GoodId, number>>; soldKg; boughtKg; incomeCents: number }`

**Rules:**
- **Rate multiplier** = `levelOutput(L) × richness × staffing × powerFactor × moraleProductivity × commuteProductivity × offlineEfficiency × (striking ? 0 : 1)`.
- **Extraction:** `extractTph × multiplier`. For a mine on kreep, multiply by 0.5 as well.
- **Recipes:** the outputs per hour × multiplier, limited by:
  - the input buffers: the scale is the minimum over inputs of `available / need`
  - output buffer space: `BUFFER_HOURS ×` the hourly output
- **Per tick:** amount (kg) = rate × 1000 × dt / 60. Carry fractions in `remainders`, and move only whole kg.
- **Status:**
  - `blocked` if output space limited the scale to 0
  - `unstaffed` if staffing = 0
  - otherwise `active`
- Power and construction statuses keep priority over these.

- [ ] **Step 1: Write failing tests**

```ts
it('a full-staffed L1 mine on richness 1.2 makes 7.2 t in 60 ticks (±1 kg)', () => {});
it('a smelter turns 4 t ilmenite into 1.5 t steel per hour', () => {});
it('missing inputs scale output down proportionally', () => {});
it('coarse step matches 60 fine steps within 1%', () => {});
it('offline efficiency 0.5 halves output', () => {});
it('full depot jams the out lane and blocks production without losing goods', () => {
  // storageCapKg = current total; run 180 ticks; status 'blocked'; depot+buffers+in-transit total equals produced total
});
```

- [ ] **Step 2: Run them**

  Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run check`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(sim): extraction and recipe production`, then push.

---

### Task 17 (B10): People — store, housing, needs, morale, migration, wages

**Files:**
- Create: `src/sim/people/store.ts`, `src/sim/people/names.ts`, `src/sim/people/needs.ts`, `src/sim/people/morale.ts`, `src/sim/people/migration.ts`, `src/sim/people/payroll.ts`
- Modify: `src/sim/state.ts`, `src/sim/engine.ts` (`needs`, `morale`, `migration`, `payroll` after `power`), `src/sim/commands.ts`, `src/sim/build/construction.ts` (founding adds `START_WORKERS`), `src/sim/events.ts`
- Test: `tests/sim/people/people.test.ts`, `tests/perf/people.perf.test.ts`

**Interfaces:**
- Produces:

```ts
export const SKILL_CODE: Record<Skill, number>;                       // miner 0, technician 1, engineer 2
export interface People { count: number; nextId: number; id: Uint32Array; first: Uint16Array; last: Uint16Array; skill: Uint8Array; level: Uint8Array;
  home: Int32Array; job: Int32Array; shift: Uint8Array; locked: Uint8Array; morale: Float32Array; present: Uint8Array; commuteMin: Float32Array; lowMoraleHours: Uint16Array }
export function createPeople(capacity?: number): People;
export function addWorker(p: People, w: { first: number; last: number; skill: number; level: number; home: number }): number; // returns id
export function removeWorkerAt(p: People, index: number): void;       // swap-with-last
export function indexOfId(p: People, id: number): number;             // via a non-saved Map, rebuilt lazily
export function workerName(p: People, index: number): string;
// GameState gains people: People; wageLevel: Record<Skill, 'low' | 'standard' | 'high'>; payrollShortfall: boolean;
// SectionState gains needsMet: { air: number; water: number; food: number; power: number }; consumeRemainder: Partial<Record<GoodId, number>>
// Command gains { t: 'setWageLevel'; skill: Skill; level: 'low' | 'standard' | 'high' }
// SimEvent gains { t: 'shortage'; sectionId: number; need: 'air' | 'water' | 'food'; daysLeft: number }
//   | { t: 'arrivals'; sectionId: number; count: number } | { t: 'emigration'; count: number }
//   | { t: 'strike'; buildingId: number } | { t: 'strikeEnded'; buildingId: number }
export function targetMorale(input: { housingQuality: number; met: { air: number; water: number; food: number; power: number }; wage: 'low' | 'standard' | 'high'; unpaid: boolean; commuteMin: number }): number;
```

**Rules:**
- **Needs:** residents of a section consume `NEEDS_KG_PER_DAY × dt / 1440` per resident from the section depot, carrying fractions. `met` = taken / needed. The power need = the section power factor.
- **Shortage event:** fires when the days of stock left for a need fall below 3. It re-arms above 5.
- **Target morale:** `base + quality + 15·air + 15·water + 15·food + 10·power + wage morale + (unpaid ? −20 : 0) + (commuteMin > 45 ? −5 : 0)`, clamped to [0, 100].
- **Drift:** morale moves toward the target by `2 × dt/60` points.
- **Strike:**
  - A building strikes when the average morale of its workers stays < 25 for 6 consecutive hours. It ends when the average reaches ≥ 35.
  - Workers who emigrate are unassigned at once.
- **Migration** (hourly):
  - Only when a section has free housing and its average morale is ≥ 50.
  - Arrivals = `floor(migrationPerDay(pop)/24 + rng.next())`, capped by free housing.
  - New workers take the skill with the highest open-slot ratio (ties go miner, then technician, then engineer).
- **Emigration** (hourly): each worker with morale < 15 leaves with probability 0.02 (rng `'people'`).
- **Payroll** (hourly):
  - Each worker costs `WAGE_CENTS_PER_DAY × factor / 24`, rounded. It goes to the world account.
  - If cash is short, pay what is possible and set `payrollShortfall = true`. It clears after a full payment.

- [ ] **Step 1: Write failing tests**

```ts
it('ids stay stable after swap-remove; grows to 10,000', () => {});
it('100 residents consume 84 kg O2, 300 kg water, 180 kg food per day (±1)', () => {});
it('targetMorale: crew quarters, all met, standard, short commute = 90', () => expect(targetMorale({ housingQuality: 5, met: { air: 1, water: 1, food: 1, power: 1 }, wage: 'standard', unpaid: false, commuteMin: 30 })).toBe(90));
it('morale drifts 2 points per game hour', () => {});
it('arrivals only with free housing and morale ≥ 50', () => {});
it('emigration is seeded and deterministic', () => {});
it('10 miners cost LM 900 per game day; shortfall sets the flag', () => {});
// tests/perf/people.perf.test.ts
it('needs+morale+payroll at 10,000 workers: median fine tick < 2 ms', () => {});
```

- [ ] **Step 2: Run them**

  Expected: FAIL.

- [ ] **Step 3: Implement**

  Serialization: typed arrays are saved through A5's `$ta` encoding. Truncate them to `count` on save.

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run check`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(sim): people, needs, morale, migration and wages`, then push.

---

### Task 18 (B11): Jobs, shifts and commuter trips

**Files:**
- Create: `src/sim/people/jobs.ts`, `src/sim/people/commute.ts`, `src/shared/trips.ts`, `src/shared/ease.ts`
- Modify: `src/sim/engine.ts` (`jobs` and `commute` after `payroll`), `src/sim/build/production.ts` and `src/sim/build/power.ts` (real staffing), `src/sim/commands.ts`
- Test: `tests/sim/people/jobs.test.ts`, `tests/shared/trips.test.ts`, `tests/shared/ease.test.ts`

**Interfaces:**
- Produces:

```ts
export function slotsPerShift(b: Building): Partial<Record<Skill, number>>;   // levelJobs
export function staffing(state: GameState, b: Building): number;              // Σ min(present_s, req_s) / Σ req_s; coarse: assigned instead of present
export interface Trip { id: number; sectionId: number; departTick: number; points: Vec3[]; cum: number[]; stops: { s: number; buildingId: number; workerIds: number[]; dwell: number }[]; speed: number; kind: 'toWork' | 'toHome' }
// GameState gains trips: Trip[]; buses: Record<number /*sectionId*/, { total: number; busyUntil: number[] }>
// Command gains { t: 'assignWorker'; workerId: number; buildingId: number | null; shift?: 0 | 1 | 2; lock: boolean }
// shared/ease.ts
export function cubicBezierEase(x1: number, y1: number, x2: number, y2: number): (t: number) => number;
export const industrialEase: (t: number) => number;                         // (0.65, 0, 0.25, 1)
// shared/trips.ts
export function tripDuration(trip: Pick<Trip, 'cum' | 'stops' | 'speed'>): number;   // game minutes
export function tripState(trip: Pick<Trip, 'departTick' | 'cum' | 'stops' | 'speed'>, gameTime: number): { s: number; moving: boolean; stopIndex: number | null } | null;
export function pointAt(points: Vec3[], cum: number[], s: number): { pos: Vec3; tangent: Vec3 };
```

**Rules:**
- **Auto-assignment** (hourly, and after any building or worker change):
  - Fill open slots in this order: building priority high → normal → low, then building id.
  - Take an unemployed, unlocked worker of the matching skill who lives in the same section.
  - Put them on the shift with the lowest fill ratio for that building.
  - Never move a locked worker.
- **`assignWorker`:** sets the job and shift and locks the worker if `lock` is set. `buildingId: null` unassigns.
- **Trips to work** depart at shift start − 40 minutes, for workers on that shift with a job and a home:
  - Group riders by home building.
  - Order the workplaces by road distance, nearest neighbour first.
  - Each bus takes ≤ 24 riders and ≤ 4 stops.
  - The path joins `roadPath` segments: home → stop 1 → … → stop k.
  - A bus is free once `tick ≥ busyUntil`. With no free bus, the group waits for the first bus to free up, so its workers arrive late.
- **Trips home** depart at the shift end from each workplace, with that building's off-going workers, routed to their homes.
- **Presence:** a worker becomes present when the trip reaches their stop. They stop being present at the shift end.
- **Coarse mode:** no trips are made. All assigned workers on the current shift count as present.
- **Commute time per worker:** `roadLength / ROVER_SPEED + STOP_DWELL_MINUTES`, recomputed when the job or home changes.
- **`tripState` easing:**
  - Between stops, the progress `u` on each segment is eased with `industrialEase`. The segment duration is `segLen / speed`.
  - The bus holds at each stop for `dwell`.
  - The result is `null` before `departTick` and after the end + 1 minute.
- **Pinned ease values:** `industrialEase(0.25) = 0.0759`, `(0.5) = 0.6173`, `(0.75) = 0.9484` (±1e-4).

- [ ] **Step 1: Write failing tests**

```ts
it('fills a high-priority mine 4/4/4 from 12 miners before a normal one', () => {});
it('never moves locked workers', () => {});
it('first buses leave at 05:20 (tick 20) for the 06:00 shift', () => {});
it('a bus carries ≤ 24 riders and ≤ 4 stops; each shift worker rides exactly one trip', () => {});
it('with 4 buses and 150 riders, the rest leave when buses come back', () => {});
it('trip points lie on road polylines', () => {});
it('workers become present at their stop time', () => {});
it('commuteProductivity: 30 min → 0.95, 80 min → 0.7', () => {});
it('tripState: s=0 at depart, holds at stops, monotonic, null after end', () => {});
it('industrialEase pins', () => { expect(industrialEase(0.5)).toBeCloseTo(0.6173, 4); });
```

- [ ] **Step 2: Run them**

  Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run check`
  Expected: PASS. Earlier tests are updated for real staffing: founding workers fill the start buildings.

- [ ] **Step 5: Commit**

  `feat(sim): jobs, shifts and commuter bus trips`, then push.

---

### Task 19 (B12): Lunar market — curves, order book and hourly clearing

**Files:**
- Create: `src/sim/market/curves.ts`, `src/sim/market/clearing.ts`, `src/sim/market/orders.ts`, `src/sim/market/market.ts`
- Modify: `src/sim/state.ts`, `src/sim/commands.ts`, `src/sim/engine.ts` (`market` after `production`), `src/sim/events.ts`
- Test: `tests/sim/market/market.test.ts`

**Interfaces:**
- Produces:

```ts
export interface GoodMarket { goodId: GoodId; pRefCents: number; lastCents: number; history: number[]; volume24hKg: number }
export interface Order { id: number; goodId: GoodId; side: 'buy' | 'sell'; kind: 'market' | 'limit' | 'standing'; qtyKg: number; filledKg: number;
  limitCents: number | null; sectionId: number; dailyQtyKg: number | null; escrowKg: number; escrowCents: number }
// GameState gains market: Record<GoodId, GoodMarket>; orders: Order[]; colonyPop: number
export function npcDemandTph(g: GoodDef, pCents: number, pRef: number, colonyScale: number): number;
export function npcSupplyTph(g: GoodDef, pCents: number, pRef: number): number;
export function clear(g: GoodDef, m: GoodMarket, colonyScale: number, orders: Order[]): { priceCents: number; fills: { orderId: number; kg: number }[] };
export function quote(state: GameState, goodId: GoodId, side: 'buy' | 'sell', kg: number): { priceCents: number; filledKg: number };
// Command gains { t: 'placeOrder'; goodId; side; kind; qtyKg; limitCents?; sectionId } | { t: 'cancelOrder'; orderId }
// CommandError gains 'INSUFFICIENT_STOCK' | 'INVALID_ORDER' | 'STORAGE_FULL'
// SimEvent gains { t: 'trade'; orderId: number; goodId: GoodId; side: 'buy' | 'sell'; kg: number; cents: number }
//   | { t: 'income'; plotId: number | null; cents: number; source: 'trade' | 'contract' } | { t: 'priceMove'; goodId: GoodId; pct24h: number }
```

**Rules:**
- **NPC curves** (t/h), with `x = p / pRef`:
  - `D = V × colonyScale × x^(−εd)`
  - `S = V × x^(εs)`
  - `colonyScale = (colonyPop / 1200)^0.8`
- **Clearing** runs on each game hour boundary (both modes):
  - Find p in `[base/20, base×20]` such that the excess `D(p) + Σ active buys − S(p) − Σ active sells` crosses 0. Bisect log p to a relative 1e-6.
  - A buy is active if `limit ≥ p` (market buys always are). A sell is active if `limit ≤ p` (market sells always are).
  - **At a bound:** clear at the bound. The player side is rationed to what the NPC curve absorbs.
  - **At a limit-price jump:** clear at that limit. Ration the marginal side pro rata.
  - All fills are at the uniform price.
- **Money and goods:**
  - Sell orders reserve their goods on placement, moving them from the depot to the order's escrow.
  - Buy orders reserve cash: `limit × qty`, or `5 × pRef × qty` for market buys, into `escrow:<id>`. They also need depot space. The rest is refunded after the fill.
  - Market orders cancel any unfilled rest after one clearing and return the escrow.
  - Standing orders re-arm `dailyQtyKg` at 00:00.
- **pRef update** after each clearing:
  - `ln pRef += 0.6 × ln(p/pRef) − 0.03 × ln(pRef/(base × colonyScale^0.5)) + 0.01 × rng.normal()`
  - Keep `history` at 168 entries.
  - Emit `priceMove` when the 24 h change first passes ±30%.
- **Income:** each player sell fill emits `income` with `plotId = hub of sectionId`.

- [ ] **Step 1: Write failing tests**

```ts
it('clears at pRef with only NPC curves (±0.1%)', () => {});
it('selling 0.5×V of a raw good clears at 0.697×pRef (±0.002)', () => {});
it('buying 0.5×V clears at 1.498×pRef (±0.002)', () => {});
it('colony ×2 raises the curve-only clearing price to 1.532×pRef (±0.002)', () => {});
it('a limit sell above the clearing price does not fill', () => {});
it('selling 100x hourly volume clears at the lower bound and returns the rest', () => {
  // helium3 V=0.05 t/h; market sell 5 t → price = base/20; filled ≈ 4.46 t (±0.5%); rest back in depot; all cents integers; no NaN
});
it('conserves money and goods between player and world', () => {});
it('cancel returns escrow; standing orders re-arm daily', () => {});
it('pRef returns within 10% of base within 72 game hours after a 30% shock', () => {});
```

- [ ] **Step 2: Run them**

  Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run check`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(sim): Lunar market with order books and hourly clearing`, then push.

---

### Task 20 (B13): Contracts, reputation and colony growth

**Files:**
- Create: `src/sim/contracts/rewards.ts`, `src/sim/contracts/generate.ts`, `src/sim/contracts/contracts.ts`
- Modify: `src/sim/state.ts`, `src/sim/commands.ts`, `src/sim/engine.ts` (`contracts` after `market`), `src/sim/events.ts`, `src/sim/people/jobs.ts` (contract-site job slots)
- Test: `tests/sim/contracts/contracts.test.ts`

**Interfaces:**
- Produces:

```ts
export type ContractType = 'oreDelivery' | 'infrastructure';
export type Stage = { kind: 'deliver'; needKg: Partial<Record<GoodId, number>>; doneKg: Partial<Record<GoodId, number>> }
  | { kind: 'build'; engineerHours: number; done: number } | { kind: 'staff'; technicians: number; hours: number; done: number };
export interface Contract { id: number; type: ContractType; issuer: 'Lunar Authority' | 'Shackleton Colony' | 'Peary Settlement'; status: 'offered' | 'active' | 'completed' | 'failed' | 'abandoned';
  offeredTick: number; deadlineTick: number; rewardCents: number; repGain: number; repLoss: number; stages: Stage[]; stageIndex: number;
  plotId: number | null; asset: 'landingPad' | 'commMast' | 'roadDepot' | 'publicSolar' | null }
// GameState gains contracts: Contract[]; reputation: number (start 20, 0..100); clientAssets: { plotId: number; asset: string }[]
export function boardSize(rep: number): number;                     // min(8, 3 + floor(rep/20))
export function maxActive(rep: number): number;                     // min(6, 2 + floor(rep/25))
export function oreDeliveryReward(i: { amountT: number; pRefCents: number; margin: number; deadlineHours: number; reputation: number }): number;
export function infrastructureReward(i: { materialsCents: number; labourCents: number; margin: number; deadlineHours: number; reputation: number }): number;
// Command gains { t: 'acceptContract'; contractId } | { t: 'deliverContract'; contractId; sectionId } | { t: 'abandonContract'; contractId }
// CommandError gains 'CONTRACT_LIMIT' | 'NOT_ACTIVE'
// SimEvent gains { t: 'contractOffered' | 'contractCompleted' | 'contractFailed'; contractId: number }
```

**Rules:**
- **Rewards:**
  - `urgency = 1 + 0.2 × clamp((48 − deadlineHours)/48, 0, 1)`
  - `repBonus = 1 + rep/500`
  - Ore delivery reward = `round(amountT × pRef × margin × urgency × repBonus)`
  - Infrastructure reward = `round((materials + labour) × margin × urgency × repBonus)`
- **Board:** each hour, while the board is below its size, spawn an offer with probability 0.25. Offers expire after 48 hours.
- **Ore delivery offer:**
  - Good weights: regolith 3, ilmenite 3, anorthite 2, polarVolatiles 2, kreep 1, helium3 0.3.
  - Amount: U(30, 150) t, or U(0.05, 0.3) t for helium3.
  - `deadlineHours = ceil(amount / refRate × U(1.5, 3)) + 24`, with refRate = that good's L1 extraction rate.
  - Margin U(1.1, 1.3). Reputation +3 on success, −5 on failure.
- **Infrastructure offer:**
  - Asset: one of the 4. Issuer: one of the 3.
  - Stages:
    1. deliver: prefab U(20, 60) t and steel U(5, 15) t
    2. build: U(48, 144) engineer-hours
    3. staff: 2 technicians for 24 hours
  - Deadline 72–168 h. Margin U(1.2, 1.5).
  - `labour` = engineer-hours × the hourly engineer wage, plus 48 × the hourly technician wage.
  - Reputation +5 on success, −8 on failure.
  - It uses a free public plot in an owned section. With none free, no infrastructure offer spawns.
- **Delivery:** `deliverContract` moves min(needed, depot stock) from that depot. The goods are consumed.
- **Build and staff stages** create job slots on the contract plot: 2 engineers per shift (build) or 2 technicians per shift (staff). Workers are auto-assigned there after buildings of the same priority, and they commute there.
  - Build progress: + the present engineers × dt/60.
  - Staff progress: + dt/60 when 2 technicians are present.
- **Completion:** pay the reward to the player (an `income` event at the plot). Record the client asset. `colonyPop += U(40, 120)`.
- **Failure:** the deadline passes. **Abandon:** reputation −4. Delivered goods are never returned.

- [ ] **Step 1: Write failing tests**

```ts
it('board size 3 at rep 20, 8 at rep 100; active limit 2 at rep 20', () => {});
it('oreDeliveryReward(100 t, 6000¢, 1.2, 100 h, rep 20) = 748800', () => expect(oreDeliveryReward({ amountT: 100, pRefCents: 6000, margin: 1.2, deadlineHours: 100, reputation: 20 })).toBe(748800));
it('partial then full delivery completes and pays', () => {});
it('missed deadline fails with −5 rep', () => {});
it('infrastructure runs deliver → build → staff and grows the colony', () => {});
it('offers expire after 48 hours; accept beyond the limit → CONTRACT_LIMIT', () => {});
```

- [ ] **Step 2: Run them**

  Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run check`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(sim): ore delivery and infrastructure contracts`, then push.

---

### Task 21 (B14): Story beats, veteran chapter 1 and the Codex

**Files:**
- Create: `src/sim/story/beats.ts`, `src/sim/story/story.ts`, `src/sim/story/codex.ts`, `src/data/companions/veteran.ts`, `src/data/companions/narrator.ts`, `src/data/codex.ts`
- Modify: `src/sim/state.ts`, `src/sim/commands.ts`, `src/sim/engine.ts` (`story` last)
- Test: `tests/sim/story/story.test.ts`, `tests/data/companions.test.ts`

**Interfaces:**
- Produces:

```ts
export type BeatId = 'ch1.founding' | 'ch1.camera' | 'ch1.firstMine' | 'ch1.belts' | 'ch1.shiftChange' | 'ch1.firstSale' | 'ch1.lifeSupport'
  | 'ch1.firstContract' | 'ch1.power' | 'ch1.firstRefinery' | 'ch1.expansion' | 'ch1.end'
  | 'ev.brownout' | 'ev.shortageAir' | 'ev.shortageWater' | 'ev.shortageFood' | 'ev.strike' | 'ev.emigration' | 'ev.contractFailed' | 'ev.priceCrash';
export type HintCategory = 'tutorial' | 'economy' | 'alerts';
export interface StoryState { seen: BeatId[]; done: BeatId[]; queue: BeatId[]; muted: HintCategory[]; codex: string[]; cameraTaught: { panned: boolean; zoomed: boolean } }
export function currentLine(state: GameState, lines: Record<BeatId, string[]>, narrator: Record<BeatId, string[]>): { beatId: BeatId; speaker: string; lines: string[] } | null;
// Command gains { t: 'storyAck'; beatId: BeatId } | { t: 'setHintMute'; category: HintCategory; muted: boolean } | { t: 'cameraTaught'; panned?: boolean; zoomed?: boolean }
export const CODEX: Record<string, { title: string; category: 'goods' | 'buildings' | 'contracts' | 'mechanics' | 'concepts'; body: string; realWorld?: string }>;
```

**Beats** (`trigger` → `completed when`). Tutorial beats run in order: each waits for the previous one to complete.

| Beat | Trigger | Completed when | Codex unlocked |
|---|---|---|---|
| ch1.founding | `founded` | `storyAck` | mech.sections, mech.plots |
| ch1.camera | after founding | camera taught: panned and zoomed | mech.camera |
| ch1.firstMine | after camera | `constructionStarted` of a mine, iceDrill or regolithScoop | building.mine |
| ch1.belts | first `buildingCompleted` | `storyAck` | mech.belts, mech.storage |
| ch1.shiftChange | first `shiftChange` after belts | `storyAck` | mech.shifts, mech.commute |
| ch1.firstSale | after shiftChange | first player sell `trade` | concept.orderBook, concept.priceImpact |
| ch1.lifeSupport | any `shortage`, or after firstSale | `storyAck` | mech.needs, mech.morale |
| ch1.firstContract | after lifeSupport | first `contractCompleted` | mech.reputation |
| ch1.power | first `brownout` (may interrupt) | `storyAck` | mech.power |
| ch1.firstRefinery | after firstContract | first steel produced | concept.valueAdded |
| ch1.expansion | after firstRefinery and cash ≥ land price | `sectionBought` | mech.landOffice |
| ch1.end | after expansion | `storyAck` | mech.offline |

- Event beats (`ev.*`) fire on their events, at most once per 6 game hours each.
- **Codex entries:**
  - `good.<id>` for all 22 goods, unlocked when first held or quoted
  - `building.<id>` for all buildable types, unlocked when first built or listed as affordable
  - `contract.oreDelivery`, `contract.infrastructure`
  - the `mech.*` entries above
  - concepts: `concept.orderBook`, `concept.priceImpact`, `concept.elasticity`, `concept.meanReversion`, `concept.temporalArbitrage` (unlocked by building a warehouse), `concept.valueAdded`
- Each body is ≤ 80 words. Concepts add a `realWorld` paragraph ≤ 60 words.

**Veteran voice guide:**
- Ox Varga, 30 years a Belt miner, now your operations chief.
- Dry humour, blunt, warm under it. Calls the player "boss". Short sentences.
- Ties lessons to rock and hard work.
- Never uses emoji and never breaks the fourth wall.
- Every line is ≤ 220 characters, with 2–6 lines per beat.

**Exact first lines of `ch1.founding`:**
1. "Name's Ox Varga. Thirty years cutting rock in the Belt, and now I run your operations. Welcome to the Moon, boss."
2. "This is the founding charter: one section near the south pole. Ice in the shadows, iron in the dirt, and a lot of nothing in between."

**Narrator fallback:** a neutral one-line summary for every beat.

- [ ] **Step 1: Write failing tests**

```ts
it('founding queues ch1.founding first', () => {});
it('tutorial beats fire once and in order', () => {});
it('ch1.power interrupts on the first brownout', () => {});
it('a missing veteran line falls back to the narrator', () => {});
it('muted categories record beats but show nothing', () => {});
it('first sale unlocks concept.orderBook and concept.priceImpact', () => {});
// tests/data/companions.test.ts
it('every BeatId has 2–6 veteran lines ≤ 220 chars and a narrator line', () => {});
it('founding lines match the pinned copy', () => {});
it('every codex id referenced by beats exists; bodies ≤ 80 words', () => {});
```

- [ ] **Step 2: Run them**

  Expected: FAIL.

- [ ] **Step 3: Implement and write the lines in the veteran voice**

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run check`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(story): veteran chapter 1, event beats and Codex`, then push.

---

### Task 22 (B15): Offline catch-up and the away summary

**Files:**
- Create: `src/sim/offline.ts`
- Modify: `src/worker/simHost.ts` (uses `runCatchUp` for `due > 300` and on load), `src/worker/protocol.ts` (`{ t: 'catchUp'; progress }`, `{ t: 'away'; summary }`)
- Test: `tests/sim/offline.test.ts`

**Interfaces:**
- Produces:

```ts
export interface AwaySummary { realMsAway: number; gameHours: number; capped: boolean; cashDeltaCents: number; producedKg: Partial<Record<GoodId, number>>;
  soldKg: Partial<Record<GoodId, number>>; contractsCompleted: number; contractsFailed: number; arrivals: number; departures: number; alerts: SimEvent[] }
export function runCatchUp(state: GameState, realMsAway: number, timescale: number, onProgress?: (p: number) => void): AwaySummary;
```

**Rules:**
- `ms = clamp(realMsAway, 0, 28_800_000)`, so a negative value means no catch-up.
- `minutes = floor(ms × timescale / 1000)`.
- **Stepping:** fine ticks until the next hour, then coarse ticks while ≥ 60 minutes remain, then fine ticks for the rest. All of these use `offlineEfficiency 0.5`.
- **Away screen:** the host posts `away` only when `gameHours ≥ 10`.
- **Progress:** posted every 24 coarse steps, then 1.
- **Alerts:** keeps `shortage`, `strike`, `emigration`, `contractFailed` and `brownout`, deduplicated by type and section.

- [ ] **Step 1: Write failing tests**

```ts
it('negative time does nothing', () => {});
it('30 real minutes adds exactly 1,800 ticks', () => {});
it('10 hours is capped at 8 (28,800 ticks), capped=true', () => {});
it('production during catch-up is 50% (±2%) of the same span online in coarse mode', () => {});
it('is deterministic and reports progress up to 1', () => {});
it('catch-up of 480 game hours with 10,000 workers takes < 10 s', () => {});   // uses bot/scenes makeBenchState once B17 exists; until then skip with it.todo
```

- [ ] **Step 2: Run them**

  Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run check`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(sim): offline catch-up with away summary`, then push.

---

### Task 23 (B16): Views, protocol extension and the e2e test API

**Files:**
- Create: `src/sim/views.ts`, `src/client/testApi.ts`
- Modify: `src/worker/protocol.ts`, `src/worker/simHost.ts`, `src/client/store.ts`, `src/main.tsx`
- Test: `tests/sim/views.test.ts`

**Interfaces:**
- Produces:

```ts
export interface WorldView { version: number; seed: number; radius: number;
  sections: { id: number; center: Vec3; polygon: Vec3[]; owner: 'player' | 'authority'; buyable: boolean }[];
  plots: { id: number; sectionId: number; kind: PlotKind; dir: Vec3; deposit: { goodId: RawGoodId; richness: number } | null }[];
  buildings: { id: number; plotId: number; type: BuildingTypeId; level: number; status: BuildingStatus; progress: number }[];
  roads: { id: number; sectionId: number; points: Vec3[] }[]; belts: { id: number; buildingId: number; points: Vec3[]; length: number }[];
  clientAssets: { plotId: number; asset: string }[]; contractSites: { contractId: number; plotId: number }[] }
export interface MotionView { tick: number; trips: Trip[]; lanes: { beltId: number; lane: 'out' | 'in'; transitTicks: number; batches: { enterTick: number; goodId: GoodId }[]; jammed: boolean }[] }
export interface UiSnapshot { tick: number; date: string; company: Company | null; cashCents: number; reputation: number; landPriceCents: number;
  sections: { id: number; owned: boolean; powerSupplyKw: number; powerDemandKw: number; residents: number; housingCap: number; stockKg: Inventory; storageUsedKg: number; storageCapKg: number; needsMet: { air: number; water: number; food: number; power: number } }[];
  workforce: { total: number; employed: number; bySkill: Record<Skill, { total: number; employed: number }> };
  buildings: { id: number; type: BuildingTypeId; level: number; status: BuildingStatus; staffing: number; powerFactor: number; avgMorale: number; outputTph: Partial<Record<GoodId, number>>; recipeId: RecipeId | null; priority: 'high' | 'normal' | 'low' }[];
  market: { goodId: GoodId; lastCents: number; change24h: number; history: number[]; volume24hKg: number }[]; orders: Order[];
  contracts: Contract[]; story: { line: { beatId: BeatId; speaker: string; lines: string[] } | null; codex: string[]; muted: HintCategory[] };
  alerts: SimEvent[]; wageLevel: Record<Skill, 'low' | 'standard' | 'high'> }
export function buildWorldView(state: GameState, version: number): WorldView;
export function buildMotionView(state: GameState): MotionView;
export function buildUiSnapshot(state: GameState): UiSnapshot;
// protocol additions
// ToWorker: | { t: 'queryPeople'; id; filter: { sectionId?: number; skill?: Skill; morale?: 'lt25' | '25to50' | '50to75' | 'ge75' }; offset; limit }
//           | { t: 'quote'; id; goodId; side; kg } | { t: 'exportSave'; id } | { t: 'importSave'; id; code } | { t: 'newGame'; seed }
//           | { t: 'manualSave'; slot } | { t: 'manualLoad'; slot }
// FromWorker: | { t: 'world'; world: WorldView } | { t: 'motion'; motion: MotionView; anchorRealMs: number }
//             | { t: 'peoplePage'; id; total; rows: { id; name; skill; level; home: string; job: string | null; shift; morale; locked }[] }
//             | { t: 'quoteResult'; id; priceCents; filledKg } | { t: 'exportResult'; id; code } | { t: 'importResult'; id; ok: boolean; error?: string }
// testApi (DEV/e2e only): window.__pmo = { send(cmd), ui(), world(), advanceRealMs(ms) }
//   later tasks add: renderStats() (B18), camera() and setCamera(lat, lon, alt, heading) (B20), project(plotId) (B22), select(pick) (B26)
```

**Rules:**
- **World view:** posted only when `version` changes. The version bumps on build, complete, demolish, upgrade, section bought, road added, contract site created, or asset completed.
- **Motion and snapshot:** posted after every pump that advanced the tick.
- **Alerts:** the latest 20.
- **Budgets:** for the bench state, the snapshot JSON is < 200 KB and `buildUiSnapshot` takes < 2 ms.
- **All views must pass `structuredClone`:** no typed arrays, no functions, no Maps.

- [ ] **Step 1: Write failing tests**

```ts
it('views survive structuredClone and hold no typed arrays', () => {});
it('world version bumps only on world changes', () => {});
it('ui snapshot for the bench state is < 200 KB JSON and builds in < 2 ms', () => {}); // it.todo until B17, then enable
```

- [ ] **Step 2: Run them**

  Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run check`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat: world, motion and UI views; e2e test API`, then push.

---

### Task 24 (B17): Demo and bench scenes, and the balance bot

**Files:**
- Create: `bot/scenes.ts`, `bot/strategy.ts`, `bot/bot.test.ts`
- Modify: `src/worker/simHost.ts` (`scene=demo|bench` builds these states in e2e/dev); enable the `it.todo` tests in B15 and B16
- Test: `bot/bot.test.ts`, `tests/bot/scenes.test.ts`

**Interfaces:**
- Produces:

```ts
export function makeDemoState(seed: number): GameState;
export function makeBenchState(seed: number): GameState;
export function botDecide(state: GameState): Command[];
```

**`makeDemoState`:**
- Found "Selene Rock Co".
- Build a mine (ilmenite), an ice drill, a smelter (steel), a water plant and 1 extra crew quarters.
- Run coarse steps until all are complete.
- Add workers via migration rules.
- Accept 1 ore delivery offer.
- End at 05:30 on the following game day, so buses are mid-commute.
- Stock includes 30 t ilmenite.

**`makeBenchState`:**
- 16 owned sections, with buildings at level 10: 26 habitat domes and ≥ 140 workplaces.
- Exactly 10,000 workers, all housed and assigned.

**Bot rules** (each game hour):
1. Build the next affordable item in this order: mine (ilmenite), ice drill, water plant, crew quarters, smelter (steel), solar array, hydroponics farm, chemical refinery (fertiliser), habitat dome, solar array, mine (anorthite).
2. Sell output above 2 game days of needs.
3. Accept ore delivery offers the bot can fill from stock, and deliver them.
4. Buy a section when cash > 1.5 × the land price.

**Bot targets after 1,440 coarse ticks (1 real day):**
- ≥ 2 owned sections, and ≤ 6
- ≥ 1 active smelter
- population ≥ 60
- ≥ 3 contracts completed
- cash > starting cash
- no section with air or water `met < 0.9` for more than 24 consecutive hours

- [ ] **Step 1: Write failing tests**

```ts
// tests/bot/scenes.test.ts
it('bench has exactly 10,000 workers and ≥ 150 buildings; demo has trips in flight', () => {});
// bot/bot.test.ts
it('meets the M1 day-1 pacing targets in < 60 s', () => {});
```

- [ ] **Step 2: Run them**

  Run: `npx vitest run tests/bot && npm run bot`
  Expected: FAIL.

- [ ] **Step 3: Implement**

  If a pacing target fails, tune only the `balance.ts` constants. Record each change in the commit message.

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run bot && npm run check`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(bot): demo and bench scenes, M1 balance bot`, then push.

---

### Task 25 (B18): Renderer bootstrap, materials, sky and the no-WebGL screen

**Files:**
- Create: `src/render/webgl.ts`, `src/render/renderer.ts`, `src/render/materials.ts`, `src/render/sky.ts`, `src/ui/screens/NoWebGL.tsx`
- Modify: `src/main.tsx`, `src/ui/App.tsx`
- Test: `tests/render/materials.test.ts`, `e2e/render.spec.ts`

**Interfaces:**
- Consumes: A6 `palette`, `bodyAccent`, `mix`; B16 views.
- Produces:

```ts
export function isWebGL2Available(): boolean;
export interface RenderStats { drawCalls: number; triangles: number; frameMsAvg: number; dpr: number; chunksVisible: number; chunksPending: number; rovers: number; crates: number; walkers: number }
export type Pick = { kind: 'plot' | 'building' | 'rover' | 'section'; id: number };
export interface GameRenderer { setWorld(w: WorldView): void; setMotion(m: MotionView, anchorRealMs: number, timescale: number): void; freezeAt(gameTime: number | null): void;
  project(dir: Vec3, lift?: number): { x: number; y: number } | null; pick(x: number, y: number): Pick | null; stats(): RenderStats; dispose(): void }
// B21 adds setFilter(f: MapFilter): void; B20 adds the camera controller
export function createRenderer(canvas: HTMLCanvasElement, opts: { seed: number; reducedMotion: boolean }): GameRenderer;
export const TERRAIN_COLORS: Record<SurfaceClass, string>;   // derived from tokens
export function bandsTexture(steps?: number[]): THREE.DataTexture; // default [0.42, 0.7, 1.0], NearestFilter
```

**Pinned colours and setup:**
- **Terrain colours:**
  - highland = `mix(cream, luna, 0.45)`
  - maria = `mix(navy, luna, 0.35)`
  - craterFloor = `mix(luna, navy, 0.25)`
  - rim = `mix(cream, luna, 0.15)`
  - polarFrost = `mix(cream, teal, 0.2)`
- **Background:** navy, with 600 seeded cream star points on a radius-3000 sphere.
- **Lights:** a key `DirectionalLight` fixed to the camera, coming from camera-space (−0.5, 0.8, 0.3), intensity 1.6. An `AmbientLight` in cream, intensity 0.35.
- **Device pixel ratio:** start at `min(devicePixelRatio, 2)`. Lower by 0.25 (minimum 1) when the average frame time is > 20 ms for 2 s. Raise by 0.25 when it is < 12 ms for 5 s.
- **Hidden tab:** stop the rAF loop when the document is hidden.
- **Camera clip planes:** near = `max(0.02, alt × 0.02)`, far = `alt + 3R`.
- **Game time for interpolation:** `tick + (performance.now() − anchorRealMs) × timescale / 1000`, capped at `tick + 1`.

- [ ] **Step 1: Write failing tests**

```ts
it('terrain colours are the pinned token mixes', () => {});
it('bands texture has 3 nearest-filtered steps', () => {});
// e2e/render.spec.ts
test('the globe renders chunks', async ({ page }) => { /* gotoGame; expect.poll(api.renderStats().chunksVisible) > 0 */ });
test('?nowebgl=1 shows the WebGL 2 message', async ({ page }) => { /* exact copy */ });
```

- [ ] **Step 2: Run them**

  Expected: FAIL.

- [ ] **Step 3: Implement** (the globe layer arrives in B19, so `chunksVisible` stays 0 until then; mark that e2e `test.fixme` until B19)

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run check && npx playwright test e2e/render.spec.ts`
  Expected: PASS (the fixme is skipped).

- [ ] **Step 5: Commit**

  `feat(render): renderer bootstrap, palette materials and sky`, then push.

---

### Task 26 (B19): Cube-sphere quadtree, chunk workers and streaming

**Files:**
- Create: `src/render/globe/cubeSphere.ts`, `src/render/globe/quadtree.ts`, `src/render/globe/chunkGeometry.ts`, `src/render/globe/chunk.worker.ts`, `src/render/globe/chunkStreamer.ts`
- Modify: `src/render/renderer.ts`; un-fixme the B18 e2e test
- Test: `tests/render/globe.test.ts`

**Interfaces:**
- Produces:

```ts
export type Face = 0 | 1 | 2 | 3 | 4 | 5;                             // +X −X +Y −Y +Z −Z
export function cubeToSphere(face: Face, u: number, v: number): Vec3; // spherified cube, u,v ∈ [−1,1]
export interface ChunkKey { face: Face; level: number; x: number; y: number }
export const keyOf: (k: ChunkKey) => string;                          // 'f/l/x/y'
export const LOD = { maxLevel: 8, splitFactor: 2.2 } as const;
export function selectChunks(camPos: Vec3, radius: number, visible?: (center: Vec3, r: number) => boolean): ChunkKey[];
export const CHUNK_RES = 32;
export interface ChunkMeshData { key: string; center: Vec3; positions: Float32Array; normals: Float32Array; colors: Float32Array; indices: Uint16Array }
export function buildChunk(key: ChunkKey, radius: number, terrain: Terrain, colors: Record<SurfaceClass, [number, number, number]>): ChunkMeshData;
export class ChunkStreamer { constructor(parent: THREE.Object3D, o: { seed: number; radius: number; workers: number; cacheSize: number; material: THREE.Material }); update(camera: THREE.PerspectiveCamera): void; stats(): { visible: number; pending: number; cached: number }; dispose(): void }
```

**Rules:**
- **Node size:** `(π/2) R / 2^level`.
- **Split:** when `dist(cam, centre) < 2.2 × size` and `level < 8`.
- **Horizon cull:** skip a node if `dot(n̂, ĉam) < cos(acos(R/|cam|) + nodeAngle)`.
- **Vertices:** a grid of 33×33 plus a skirt ring of 4×33. Skirt depth = `0.5 × size`, at least 0.05. Positions are relative to the chunk centre.
- **Normals:** from terrain samples at ±0.02 units, so normals match across seams.
- **Workers:** `min(4, max(1, hardwareConcurrency − 2))`, with at most 8 requests in flight, nearest first.
- **Cache:** LRU of 512 chunks. Evicting a chunk disposes its geometry.
- **No holes:** show a cached ancestor until all 4 children are ready.
- **Material:** `MeshToonMaterial({ vertexColors: true, gradientMap: bandsTexture() })`.

- [ ] **Step 1: Write failing tests**

```ts
it('cubeToSphere is unit length and continuous across face edges (1e-9)', () => {});
it('altitude 400: no leaf deeper than level 2 and no back-face leaves', () => {});
it('bird’s-eye altitude 1.5: the leaf under the camera is level 8; ≤ 220 leaves without frustum', () => {});
it('no emitted key is an ancestor of another', () => {});
it('chunk has 1221 vertices and 6912 indices', () => {});
it('shared edge vertices of neighbouring chunks on different faces coincide (1e-4)', () => {});
```

- [ ] **Step 2: Run them**

  Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run check && npx playwright test e2e/render.spec.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(render): streamed cube-sphere terrain with LOD`, then push.

---

### Task 27 (B20): Globe camera and input

**Files:**
- Create: `src/render/camera/globeCamera.ts`, `src/render/camera/controller.ts`, `src/ui/shell/Compass.tsx`
- Modify: `src/render/renderer.ts`, `src/client/testApi.ts` (`camera()`, `setCamera()`)
- Test: `tests/render/globeCamera.test.ts`, `e2e/camera.spec.ts`

**Interfaces:**
- Produces:

```ts
export interface GlobeCameraState { pos: Vec3; fwd: Vec3; altitude: number; lockNorth: boolean }
export function createCameraState(dir: Vec3, altitude: number): GlobeCameraState;
export function pan(s: GlobeCameraState, rightUnits: number, forwardUnits: number, radius: number): GlobeCameraState;
export function rotate(s: GlobeCameraState, radians: number): GlobeCameraState;   // turns lockNorth off
export function setLockNorth(s: GlobeCameraState, on: boolean): GlobeCameraState;
export function zoom(s: GlobeCameraState, factor: number): GlobeCameraState;      // clamp [1.5, 400]
export function heading(s: GlobeCameraState): number;                              // radians clockwise from local north
export function tiltForAltitude(alt: number): number;                             // 55° at ≤ 1.5 → 0° at ≥ 60, smoothstep in log alt
export function cameraPose(s: GlobeCameraState, radius: number, ground: number): { position: Vec3; target: Vec3; up: Vec3 };  // never below ground + 0.5
```

**Input mapping:**
- **One-finger drag or mouse drag:** pan by `px × altitude × 1.15 / canvasHeight`.
- **Pinch:** zoom by the ratio of finger distances. **Two-finger twist:** rotate by the angle change. **Wheel:** zoom by `1.0015^deltaY`.
- **Keyboard** (ignored while an input has focus): W/A/S/D pan at `0.6 × altitude` units/s, Q/E rotate at 90°/s, +/− zoom, N toggles lock north.
- **Inertia:** time constant 250 ms. None in reduced motion.
- **Tap:** pointerup after < 6 px of movement and < 300 ms → `pick`.
- **Story hook:** the first pan and the first zoom send `cameraTaught`.
- **Compass:** shows the heading. Tapping it toggles lock north. It uses `aria-pressed` and the label "Lock north".

- [ ] **Step 1: Write failing tests**

```ts
it('pan keeps |pos| = 1 and fwd ⟂ pos', () => {});
it('panning 2πR forward returns to the start (1e-6)', () => {});
it('crossing the north pole with lock north gives no NaN and heading 0', () => {});
it('rotate then lock north gives heading 0', () => {});
it('zoom clamps to [1.5, 400]; tilt is 55° at 1.5 and 0° at 60', () => {});
it('pose never goes below ground + 0.5', () => {});
// e2e/camera.spec.ts: drag changes camera pos; synthetic two-pointer pinch changes altitude; N toggles lockNorth
```

- [ ] **Step 2: Run them**

  Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run check && npx playwright test e2e/camera.spec.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(render): globe camera with pan, rotate, zoom and lock north`, then push.

---

### Task 28 (B21): Section overlays and map filters

**Files:**
- Create: `src/render/overlays/geometry.ts`, `src/render/overlays/sectionOverlay.ts`, `src/render/overlays/filters.ts`, `src/ui/shell/MapFilters.tsx`
- Modify: `src/client/store.ts` (`mapFilter`), `src/render/renderer.ts` (adds `setFilter(f: MapFilter): void` to `GameRenderer`)
- Test: `tests/render/overlays.test.ts`

**Interfaces:**
- Produces:

```ts
export function greatCircleArc(a: Vec3, b: Vec3, segments: number): Vec3[];
export function sectionFill(polygon: Vec3[], center: Vec3, subdiv: number): { positions: Float32Array; indices: Uint32Array }; // unit-sphere vertices
export type MapFilter = { planetary: 'ownership' | 'contracts' | { resource: RawGoodId }; local: 'none' | 'power' | 'morale' | 'throughput' | 'jams' };
export const mapFilter: Signal<MapFilter>;   // default { planetary: 'ownership', local: 'none' }
```

**Rules:**
- **Borders:**
  - At altitude ≥ 30: cream lines at `R + HEIGHT_MAX + 0.05`.
  - Below 30: draped lines (terrain height + 0.03, sampled every 0.2 units) for sections within 30 units of the camera target.
- **Ownership fill:** burntOrange at opacity 0.35. Buyable sections get a mustard outline.
- **Resource filter:** deposit markers sized by richness and coloured by good group.
- **Contracts filter:** mustard pins on contract plots.
- **Local filters** (altitude < 30):
  - **power:** tint buildings teal at factor 1, mustard from 0.5 to 1, rust below 0.5
  - **morale:** tint housing the same way, by average morale/100
  - **throughput:** tint belts by queue fill
  - **jams:** jammed belts in rust, pulsing unless reduced motion
- **Chips:** the planetary chips show at altitude ≥ 30, the local chips below 30.

- [ ] **Step 1: Write failing tests**

```ts
it('arc endpoints match and points are unit length', () => {});
it('fill vertices lie on the unit sphere; triangles = polygon.length × subdiv²', () => {});
```

- [ ] **Step 2: Run them**

  Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run check`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(render): section borders, ownership and map filters`, then push.

---

### Task 29 (B22): Plots, buildings, construction visuals and picking

**Files:**
- Create: `src/render/world/models.ts`, `src/render/world/buildingLayer.ts`, `src/render/world/plotLayer.ts`, `src/render/world/picking.ts`, `src/render/world/lod.ts`
- Modify: `src/render/renderer.ts`
- Test: `tests/render/models.test.ts`, `tests/render/lod.test.ts`, `e2e/picking.spec.ts`

**Interfaces:**
- Produces:

```ts
export const MODEL_FOOTPRINT = 0.45;
export function buildModel(type: BuildingTypeId | `asset:${'landingPad' | 'commMast' | 'roadDepot' | 'publicSolar'}`, level: number): THREE.BufferGeometry; // vertex colours from tokens
export function scaffoldGeometry(): THREE.BufferGeometry;
export function visibleLayers(alt: number): { walkers: boolean; crates: boolean; rovers: boolean; traffic: boolean; plotMarkers: boolean; buildings: boolean };
// walkers < 4, crates < 8, rovers < 30, traffic ≥ 30, plotMarkers < 30, buildings < 60
```

**Silhouettes** (primitives merged with `mergeGeometries`):

| Type | Silhouette |
|---|---|
| depot | Wide low hall and a round pad |
| mine | Headframe tower and a hopper |
| regolithScoop | Low tracked box with a scoop |
| iceDrill | Derrick and an insulated tank |
| he3Harvester | Wide wheeled crawler |
| smelter | Hall with two stacks |
| waferFab | Clean box with roof units |
| chemicalRefinery | Three columns |
| electrolysisPlant | Twin tanks and pipes |
| airPlant | Dome with fans |
| waterPlant | Three tanks |
| hydroponicsFarm | Long greenhouse in teal glass |
| assemblyWorks | Sawtooth-roof hall |
| solarArray | 3×4 tilted panels on posts |
| crewQuarters | 3 stacked boxes |
| habitatDome | Hemisphere on a ring base |
| warehouse | Long box |
| roverGarage | Arched hangar |
| landingPad (asset) | Flat disc with markings |
| commMast (asset) | Lattice mast |
| roadDepot (asset) | Small yard with a shed |
| publicSolar (asset) | Single panel row |

**Rendering:**
- One `InstancedMesh` per model.
- **Placement:** height scales by `1 + 0.05(L − 1)`. Yaw = a seeded angle from `cyrb53('plot' + id)`. The model sits on the terrain height at the plot.
- **Scaffold:** height ∝ progress. A crane arm turns at 20°/s (static in reduced motion).
- **Status stamps:** a billboard icon above unpowered, unstaffed, blocked and striking buildings.
- **Plot markers** (rings): cream for build plots, the good group's colour for deposits, mustard for public plots.
- **Picking:** an invisible instanced sphere (radius 0.45) per plot. A building's pick resolves to the building id.

- [ ] **Step 1: Write failing tests**

```ts
it.each(ALL_MODEL_KEYS)('%s: ≤ 600 triangles, footprint ≤ 0.45, y ≥ 0', () => {});
it('level 10 is ≤ 1.45× the level-1 height', () => {});
it('visibleLayers pins thresholds', () => {});
// e2e/picking.spec.ts: setCamera over the founding hub (alt 3); tap at api.project(plotId) → context panel shows the plot kind
```

- [ ] **Step 2: Run them**

  Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run check && npx playwright test e2e/picking.spec.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(render): building models, plot markers and picking`, then push.

---

### Task 30 (B23): Roads, belts and crates

**Files:**
- Create: `src/render/world/ribbon.ts`, `src/render/world/roadLayer.ts`, `src/render/world/beltLayer.ts`
- Modify: `src/render/renderer.ts`
- Test: `tests/render/ribbon.test.ts`

**Interfaces:**
- Consumes: B8 `cratePositions`; B11 `pointAt`.
- Produces: `export function ribbonGeometry(points: Vec3[], normals: Vec3[], width: number): { positions: Float32Array; normals: Float32Array; indices: Uint32Array }`.

**Rules:**
- **Roads:** width 0.18, colour `mix(luna, offBlack, 0.35)`, lifted 0.02 above the terrain.
- **Belts:** width 0.08, colour rust, lifted 0.05.
- **Crates:** an instanced box of 0.07, coloured by goods group: raw = burntOrange, refined = teal, component = mustard.
  - Crate spacing = `BELT_SPEED × 1`.
  - Out lanes run building → hub. In lanes run the reversed path.
- **Per frame:** update crates only for lanes within 12 units of the camera target, and only at altitude < 8.

- [ ] **Step 1: Write failing tests**

```ts
it('ribbon has 2 vertices per point and (n−1)×6 indices', () => {});
it('ribbon vertices sit width/2 from the centreline', () => {});
```

- [ ] **Step 2: Run them**

  Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run check`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(render): roads, belts and moving crates`, then push.

---

### Task 31 (B24): Rovers, walking workers and traffic lines

**Files:**
- Create: `src/render/world/roverLayer.ts`, `src/render/world/walkerLayer.ts`, `src/render/world/trafficLayer.ts`
- Modify: `src/render/renderer.ts`
- Test: `tests/render/walkers.test.ts`, `e2e/motion.spec.ts`

**Interfaces:**
- Consumes: B11 `tripState`, `pointAt`; B22 `visibleLayers`.
- Produces: `export function walkerPositions(trip: Trip, gameTime: number, doors: Map<number, Vec3>): { pos: Vec3; skill: number }[]`. Walkers appear at a stop and walk to the building door at `WALK_SPEED`. At most 400 walkers are visible.

**Rules:**
- **Bus model:** length 0.22. A mustard body with a teal stripe and 6 wheels. It faces along the path tangent.
- **Walkers:** capsules of radius 0.03 and height 0.08, coloured by skill: miner rust, technician teal, engineer navy.
- **Traffic lines** (altitude ≥ 30): roads drawn as mustard lines whose width follows the number of trips in the last game hour.

- [ ] **Step 1: Write failing tests**

```ts
it('walkers start at the stop and reach the door after distance / WALK_SPEED minutes', () => {});
// e2e/motion.spec.ts: ?scene=demo&freeze=1 at bird's-eye over the founding section → renderStats().rovers > 0 and crates > 0
```

- [ ] **Step 2: Run them**

  Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run check && npx playwright test e2e/motion.spec.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(render): commuter rovers, walking workers and traffic lines`, then push.

---

### Task 32 (B25): Poster post-processing and visual baselines

**Files:**
- Create: `src/render/post/posterPass.ts`, `src/render/post/posterShader.ts`, `src/render/post/paperTexture.ts`, `e2e/visual.spec.ts`, `e2e/visual.spec.ts-snapshots/*`
- Modify: `src/render/renderer.ts`
- Test: `tests/render/paperTexture.test.ts`

**Interfaces:**
- Produces: `export function createPosterComposer(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): { render(): void; setSize(w: number, h: number, dpr: number): void }` and `export function paperTexture(seed: number, size?: number): THREE.DataTexture` (256², values 200–255).

**Pipeline:**
- **Passes:** `RenderPass` into a `WebGLRenderTarget` with a `DepthTexture` → `ShaderPass(Poster)` → `OutputPass`.
- **Poster shader order:**
  1. depth-Sobel outline in offBlack, threshold 0.0025 on linear depth
  2. halftone where luminance < 0.45: 5 px cells × DPR at 15°, dot radius ∝ (0.45 − L), darkened toward navy
  3. print offset: R sampled at +0.6 px, B at −0.6 px
  4. paper grain: multiply by `0.94 + 0.06 × paper(uv)`
- **Visual baselines** (in `e2e/visual.spec.ts`):
  - demo scene, bird's-eye, phone and desktop
  - planetary altitude 200, phone and desktop
  - all with `?scene=demo&freeze=1`

- [ ] **Step 1: Write failing test**

```ts
it('paper texture is deterministic and light (200–255)', () => {});
```

- [ ] **Step 2: Run it**

  Expected: FAIL.

- [ ] **Step 3: Implement the composer**

- [ ] **Step 4: Create the baselines**

  Run: `npx playwright test e2e/visual.spec.ts --update-snapshots`.
  Open every PNG and check the poster look: bands, halftone in shadows, outlines, grain, crisp UI. Fix anything that looks cheap before committing.

- [ ] **Step 5: Run everything**

  Run: `npx vitest run && npm run check && npx playwright test`
  Expected: PASS.

- [ ] **Step 6: Commit**

  `feat(render): poster post-processing and visual baselines`, then push.

---

### Task 33 (B26): UI shell wiring — top bar, context panel, alerts and income tokens

**Files:**
- Create: `src/ui/format.ts`, `src/ui/motion/eases.ts`, `src/ui/motion/incomeTokens.ts`, `src/ui/shell/Alerts.tsx`
- Modify: `src/ui/shell/TopBar.tsx`, `src/ui/shell/ContextPanel.tsx`, `src/client/store.ts` (`selection`, `pinnedGoods`)
- Test: `tests/ui/format.test.ts`, `e2e/topbar.spec.ts`

**Interfaces:**
- Produces:

```ts
export function formatMoney(cents: number): string;           // 'LM 1,234.56'; negative '−LM 12.00' (U+2212)
export function formatMass(kg: number): string;               // '850 kg', '4.25 t', '1,240 t'
export function formatGameDuration(minutes: number): string;  // '3 d 4 h', '4 h 12 min', '35 min'
export function formatRealFromGame(minutes: number): string;  // '≈ 1 h 16 min' (1 game minute = 1 real second)
export function trendOf(history: number[]): 'up' | 'down' | 'flat'; // last vs 24 entries back, ±2%
export const selection: Signal<Pick | null>;
export const pinnedGoods: Signal<GoodId[]>;                   // default ['oxygen','potableWater','hydroponicProduce','ilmenite','steel']
```

**Top bar:**
- Company, date, cash (mono, with a roll-up), the pinned goods of the selected (or founding) section with trend icons, workforce employed/total, power supply/demand, reputation, and the alerts bell with a count.
- **Cash roll-up:** a GSAP tween over 600 ms.
- **Income tokens:** on each `income` event, a mustard token "+LM x" flies from `project(plot)` to the cash element along a quadratic bezier. The control point is the midpoint raised by 30% of the distance. Duration 900 ms, ease `power2.inOut`. In reduced motion: no flight, and cash updates instantly.

**Context panel views:**
- **plot:** kind, deposit and richness, and a "Build here" button that opens the Build tab.
- **building:** status, staffing per skill, power factor, buffers, output t/h, recipe, level, priority.
- **rover:** riders, next stop, ETA.
- **section:** owner, residents/capacity, power, and "Buy section — LM x" when buyable.

**Alerts:** the latest 20, newest first, using the `copy.ts` texts.

- [ ] **Step 1: Write failing tests**

```ts
it('formats money, mass and durations', () => {
  expect(formatMoney(123456)).toBe('LM 1,234.56'); expect(formatMoney(-1200)).toBe('−LM 12.00');
  expect(formatMass(850)).toBe('850 kg'); expect(formatMass(4250)).toBe('4.25 t'); expect(formatMass(1_240_000)).toBe('1,240 t');
  expect(formatGameDuration(4560)).toBe('3 d 4 h'); expect(formatRealFromGame(4560)).toBe('≈ 1 h 16 min');
});
it('trendOf uses ±2% over 24 entries', () => {});
// e2e/topbar.spec.ts: founding shows LM 250,000.00; selecting a building via api.select shows staffing in the context panel
```

- [ ] **Step 2: Run them**

  Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run check && npx playwright test e2e/topbar.spec.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(ui): top bar, context panel, alerts and income tokens`, then push.

---

### Task 34 (B27): Build tab and land office

**Files:**
- Create: `src/ui/tabs/BuildTab.tsx`, `src/data/copy.ts`
- Test: `tests/data/copy.test.ts`, `e2e/build.spec.ts`

**Interfaces:**
- Produces: `export const ERROR_COPY: Record<CommandError, string>`, with exactly this text:

| Code | Text |
|---|---|
| NOT_OWNED | You do not own this section. |
| PLOT_OCCUPIED | This plot already has a building. |
| WRONG_PLOT_KIND | This building cannot go on this kind of plot. |
| NO_DEPOSIT_MATCH | This deposit does not hold what this building extracts. |
| INSUFFICIENT_CASH | Not enough cash. |
| INSUFFICIENT_MATERIALS | Not enough materials in this section's depot. |
| NO_ROAD_ACCESS | No road can reach this plot. The ground around it is too steep. |
| MAX_LEVEL | This building is at the highest level. |
| NOT_ADJACENT | You can only buy a section next to one you own. |
| INVALID_NAME | Use 3 to 32 letters, numbers or spaces. |
| CONTRACT_LIMIT | You hold the most contracts your reputation allows. |
| INSUFFICIENT_STOCK | Not enough stock in this depot. |
| INVALID_ORDER | Check the amount and the price. |
| STORAGE_FULL | The depot is full. |
| UNKNOWN_ID | That item no longer exists. |
| NOT_FOUNDED | Found your company first. |
| ALREADY_FOUNDED | Your company already exists. |
| COMPANION_UNAVAILABLE | This companion arrives in a later update. |
| INVALID_RECIPE | This building cannot use that recipe. |
| BUSY | Wait until the work on this building is done. |
| NOT_ACTIVE | This contract is not active. |

**Build tab:**
- **"Plots in this section":** a list of buttons, one per plot. This is also the accessible path.
- **For the selected plot:** the building types it can take, with cost, materials (shown in red when short), power and jobs, and a Build button.
- **For the selected building:**
  - Upgrade, with its cost.
  - A recipe selector and a priority selector.
  - Demolish. It asks first: "Demolish this building? You get 25% of its cost back."
- **Land office:** when a buyable section is selected, show "Buy section — LM x".
- **Command errors** show their `ERROR_COPY` text in an `aria-live="polite"` region.

- [ ] **Step 1: Write failing tests**

```ts
it('every CommandError has copy', () => {});
// e2e/build.spec.ts: found; Build tab → plot list → ilmenite deposit → Mine → Build; status Constructing; after timescale run, Active
```

- [ ] **Step 2: Run them**

  Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run them**

  Run: `npx vitest run && npm run check && npx playwright test e2e/build.spec.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(ui): Build tab and land office`, then push.

---

### Task 35 (B28): People tab

**Files:**
- Create: `src/ui/components/VirtualList.tsx`, `src/ui/tabs/PeopleTab.tsx`
- Test: `e2e/people.spec.ts`

**Interfaces:**
- Consumes: B16 `queryPeople` and `peoplePage`.
- Produces: `VirtualList<T>(props: { rowHeight: number; total: number; fetchPage(offset: number, limit: number): Promise<T[]>; renderRow(row: T): JSX.Element; overscan?: number })`. Overscan defaults to 5. Only the visible rows ± overscan are rendered.

**People tab:**
- **Rows:** 48 px each. Name, skill and level, home, job, shift, a morale bar, and a lock icon.
- **Filters:** section, skill, morale band.
- **Selected worker:** assign to a building with open slots and choose a shift. "Lock" sets `lock: true`.
- **Wage level** per skill: low / standard / high, with the morale effect shown next to it.

- [ ] **Step 1: Write the failing e2e test** (`?scene=bench`)

```ts
// fewer than 60 rows in the DOM; scrolling to the end shows worker 10,000; the Engineer filter shows only engineers;
// assigning a worker changes their job in the next page
```

- [ ] **Step 2: Run it**

  Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run it**

  Run: `npm run check && npx playwright test e2e/people.spec.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(ui): People tab with virtual list and assignments`, then push.

---

### Task 36 (B29): Trade tab

**Files:**
- Create: `src/ui/tabs/TradeTab.tsx`, `src/ui/components/PriceChart.tsx`
- Test: `e2e/trade.spec.ts`

**Interfaces:**
- Consumes: `UiSnapshot.market` and `orders`; B16 `quote`.

**Trade tab:**
- **Goods table:** name, stock in the selected section, last price, 24 h change with a trend icon, and a "Pin to top bar" toggle.
- **Selected good:**
  - A 168-point SVG line chart: navy line, cream grid, mono labels.
  - An order form: side, kind (market / limit / standing), amount in tonnes, limit price in LM/t, depot.
  - A live quote: "Estimated price LM x/t, fills y t". It refreshes 300 ms after the last change to the form.
- **Open orders:** each with a cancel button.

- [ ] **Step 1: Write the failing e2e test** (`?scene=demo&timescale=60`)

```ts
// sell 10 t ilmenite at market: the quote shows a price; after the next clearing the order is gone and cash rose
```

- [ ] **Step 2: Run it**

  Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run it**

  Run: `npm run check && npx playwright test e2e/trade.spec.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(ui): Trade tab with chart, quotes and orders`, then push.

---

### Task 37 (B30): Contracts tab

**Files:**
- Create: `src/ui/tabs/ContractsTab.tsx`
- Test: `e2e/contracts.spec.ts`

**Contracts tab:**
- **Board cards:**
  - A type stamp: "ORE DELIVERY" or "INFRASTRUCTURE".
  - The issuer.
  - The requirement, for example "Deliver 80 t Ilmenite".
  - The deadline as game time plus the real-time equivalent (`formatRealFromGame`).
  - The reward in LM and reputation.
  - An Accept button. When it is disabled, the reason is shown.
- **Active contracts:**
  - A stage progress bar.
  - For deliver stages: a Deliver button with a depot selector.
  - For build and staff stages: workers present per shift.
  - Abandon. It asks first: "Abandon this contract? You lose 4 reputation and keep nothing you delivered."

- [ ] **Step 1: Write the failing e2e test** (`?scene=demo`)

```ts
// accept an ore delivery that the demo stock can fill; Deliver; it moves to completed; reputation and cash rise
```

- [ ] **Step 2: Run it**

  Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run it**

  Run: `npm run check && npx playwright test e2e/contracts.spec.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(ui): Contracts tab`, then push.

---

### Task 38 (B31): Founding screen, companion, Codex, away screen and settings

**Files:**
- Create: `src/ui/screens/FoundingScreen.tsx`, `src/ui/screens/AwayScreen.tsx`, `src/ui/screens/CatchUpOverlay.tsx`, `src/ui/companion/CompanionBubble.tsx`, `src/ui/companion/portraits/veteran.svg`, `src/ui/tabs/CodexTab.tsx`, `src/ui/tabs/SettingsTab.tsx`
- Test: `e2e/founding.spec.ts`, `e2e/settings.spec.ts`, `e2e/away.spec.ts`

**Founding screen:**
- The Moon turns slowly behind it.
- A company name field, validated live with the `INVALID_NAME` copy.
- 4 companion cards. The veteran is selectable. The others are greyed out with "Arrives in a later update."
- "Advanced" reveals the seed field.
- A "Found company" button. On success, the camera flies to the founding hub at altitude 4 over 1.2 s with the industrial ease (instant in reduced motion).

**Companion:**
- The portrait is a poster-style SVG: flat shapes, a grey beard, a helmet ring, and the palette only.
- **Desktop:** the portrait sits bottom-left above the ticker, with a speech card showing the current line, "Next" (`storyAck`) and "Open Codex".
- **Mobile:** a 56 px floating portrait above the tab bar. Tapping it opens the dialogue sheet.

**Codex tab:**
- Categories and a search field. Unlocked entries only.
- Each entry shows the body, the real-world paragraph, and a data table for goods and buildings (price, produced by, used by; cost, jobs, power, recipes).

**Away screen:**
- A newspaper-poster layout.
- The headline is built from the biggest change, e.g. "ORE FLOWS — CASH UP 42%".
- A stats grid, the alerts, and a "Back to work" button.
- `CatchUpOverlay` shows a progress bar during catch-up.

**Settings:**
- Reduced motion: System / On / Off.
- Hint mutes per category.
- Manual save slots 1–5 (save and load).
- Export save: shows the code and a Copy button.
- Import save: a paste field. Errors read "That code is not a valid save."
- New game. It asks first: "This replaces your current company. Export first if you want to keep it."

- [ ] **Step 1: Write the failing e2e tests**

```ts
// founding.spec: no save → founding screen; name 'ab' shows the INVALID_NAME copy; 'Selene Rock Co' + veteran → first line contains 'Ox Varga'
// settings.spec: export code starts with 'PMO1.'; New game + confirm → founding screen; import that code → company name back
// away.spec: found; api.advanceRealMs(7_200_000) → away screen headline visible; 'Back to work' closes it
```

- [ ] **Step 2: Run them**

  Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run them**

  Run: `npm run check && npx playwright test e2e/founding.spec.ts e2e/settings.spec.ts e2e/away.spec.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `feat(ui): founding, companion, Codex, away screen and settings`, then push.

---

### Task 39 (B32): Budgets and the full-loop e2e

**Files:**
- Create: `tests/perf/sim.perf.test.ts`, `e2e/budgets.spec.ts`, `e2e/core-loop.spec.ts`
- Modify: `README.md` (how to run, play URL, controls)

**Rules:**
- **Simulation perf** (bench state): median fine tick over 100 ticks < 4 ms. Catch-up of 480 game hours < 10 s.
- **Render budgets** (`?scene=bench`, phone and desktop, bird's-eye over the busiest section after chunks settle): `drawCalls < 300` and `triangles < 1_500_000`.
- **Full loop** (`?seed=42&timescale=120`):
  1. Found the company.
  2. Build a mine through the Build tab.
  3. Wait until it is active.
  4. Pan (the camera beat completes).
  5. Sell ilmenite at market.
  6. Check that cash rose and an income token appeared.
  7. Accept and deliver an ore contract.
  8. Buy a neighbouring section. The starting cash covers the LM 60,000 price.
  9. Reload the page. The same company and tick ± timescale are restored from the autosave.
- **README:** add the play URL `https://evikzs.github.io/Planetary-Mining-Operations/`, the controls table, and `npm run dev` / `check` / `test:e2e` / `bot`.

- [ ] **Step 1: Write the failing tests** (as described in the rules)

- [ ] **Step 2: Run them**

  Run: `npx vitest run tests/perf && npx playwright test e2e/budgets.spec.ts e2e/core-loop.spec.ts`
  Expected: FAIL until all the earlier tasks are in place, then PASS.

- [ ] **Step 3: Fix any budget breach at its root**

  Typical fixes: merge instanced meshes, lower the chunk count per frame, trim snapshot fields. Do not loosen a budget.

- [ ] **Step 4: Run the full suite**

  Run: `npm run check && npm run build && npm run size && npm run bot && npm run test:e2e`
  Expected: all PASS.

- [ ] **Step 5: Commit**

  `test: performance budgets and full core-loop e2e; README`, then push. Confirm that the CI and Pages workflows are green.

---

## Verification (end-to-end)

1. **Automated:**

```bash
npm run check && npm run build && npm run size && npm run bot && npm run test:e2e
```

   All must pass locally and in GitHub Actions (`ci.yml`). `pages.yml` deploys to `https://evikzs.github.io/Planetary-Mining-Operations/`.

2. **Manual, on a real phone** (the owner's device, after the Pages deploy):
   1. The founding screen loads in under 4 s on 4G.
   2. Found the company. The veteran speaks.
   3. Within about 20 s, the first buses leave for the 06:00 shift (rush hour is visible).
   4. Pan, pinch, two-finger rotate and lock north all work. Zoom out to the planetary view: borders and ownership show.
   5. Build a mine. The scaffold rises. Then crates flow on its belt to the depot.
   6. Sell ore. A token flies to the cash and the cash rolls up.
   7. Accept and deliver an ore contract.
   8. Lock the phone for 15 minutes and come back. The game catches up.
   9. Close the tab for 10+ minutes, reopen, and check that the away screen appears.
   10. On a desktop browser, check the left rail, the top bar, the right panel and the keyboard controls.

3. **Frame rate:** with `?scene=bench` on a mid-range phone, use the dev overlay (`renderStats().frameMsAvg`) to confirm 60 fps (never below 30).

## Execution handoff

**Method chosen by the owner: Native.**
- Implement every task in this session with superpowers:executing-plans, in order A1 → B32.
- When B32 is done, one fresh reviewer on the most capable model reviews the whole branch.
- Each task ends with a commit and a push to `claude/vibrant-goodall-teqhde`, so every step is playable on GitHub Pages.
