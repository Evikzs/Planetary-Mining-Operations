# M2a: Economy Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Moon slice into a competitive economy: five AI rivals that play by the player's rules, section auctions, listed shares, loans with a credit rating, full financial statements, and tight money.

**Architecture:** The deterministic simulation becomes multi-company: every owner-bound record carries a `CompanyId`, rivals act only through `applyCommand`, and their workers are simulated one by one like the player's. Finance is clean-surplus bookkeeping per company: the balance sheet is computed from state, and every value change posts to an income, cash-flow or equity account, so assets − liabilities = equity accounts at every tick. Shares clear in the same hourly call auction as goods; auctions run on game ticks with proxy bids, also offline.

**Tech Stack:** unchanged from M0–M1 (TypeScript 6.0.3, Vite 8.3.5, Preact 10.29.8 + Signals, three 0.186.1, GSAP 3.15.0, idb 8.0.4, Vitest 4.1.12 + fast-check, Playwright 1.63.0). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-27-planetary-mining-operations-design.md` (§3.3, §4.3–4.4, §7, §8.5, §9.4, §10.3–10.4, §11.1, §13.3, §14, §15). Executors read both documents.

**Plan location after approval:** Task C1 copies this file to `docs/superpowers/plans/2026-11-05-m2a-economy-core.md`.

**Repository and branch:** `Planetary-Mining-Operations` at `/home/user/Planetary-Mining-Operations`, branch `claude/vibrant-goodall-teqhde` (the default branch; Pages deploys every push). Every task ends with a commit and `git push -u origin claude/vibrant-goodall-teqhde`. Never push red work.

## Context

M0–M1 is complete: all 39 tasks, the final review and its fix pass are pushed; CI run 41 and Pages run 40 on `415d334` are green. The spec's M2 ("Economy core": rivals with AI, auctions, stocks, loans, reputation, financial statements, Lunar Mark currency) is next. The M1 plan also moved research, new needs and skills, haulers and road editing to M2. The M1 balance bot showed cash growing 112–143× in one real day, which would make loans and shares meaningless.

## Owner decisions for this plan (2026-11-05)

- **M2 is two plans.** M2a (this plan): the economy core plus a money rebalance. M2b (next plan): research and patents, clinic and recreation needs, the training centre, scientist/pilot/crew skills, haulers between sections, road editing.
- **Money is tight.** In the bot's first real day, company value (book equity) ends at 3–5× its founding value.
- **Rivals are fully simulated,** workers and buses included, under the same rules as the player.
- **M1 branch:** kept as is. M2a continues on the same branch.
- **Execution:** Native (as for M1), unless the owner says otherwise when approving.

## Scope

**In M2a:**
- Companies: the player (id 0) and 5 rivals (ids 1–5), founded with the player; later rivals get new ids.
- Rival AI: utility-based, one decision tick per game hour, archetype weights from data.
- Double-entry books per company, statements (income, balance sheet, cash flow), ratios, monthly close.
- Loans and a credit line, the credit rating AAA–D, default with forced sales.
- Shares: listing, NPC investors, trading, issue, buyback, dividends, the 20% disclosure.
- Auctions for section rights and bankrupt-company assets. They replace the land office.
- Rival bankruptcy and replacement. Reputation per company, group and body.
- News ticker, Finance tab, auctions UI, Codex entries and companion lines for every new concept.
- The money rebalance, a bot that bids and borrows, rival performance budgets, compact trip saves, save version 3.

**Deferred** (target milestone in brackets):
- Research and patents, patent lots, new needs, skills and training, haulers, road editing [M2b].
- Takeovers (35% warning, > 50% control), subsidiaries and IPOs, FX and other currencies, central banks and cycles, market events (§7.9), player game over [M3].
- Short selling, bonds, futures, insurance, transfer pricing [M5].

**Spec gaps filled here** (each is a ruling in the ledger):
- The Lunar Mark is already the only currency (since M1). M2a adds no currency code; FX arrives in M3.
- The player cannot go bankrupt in M2a: forced sales stop at the founding charter section and the rest of the debt is written off, with rating D and −20 reputation. M3 brings the game-over path.
- Interest is quoted and charged per game month, because a game year is 146 real days.
- Any company may open an auction on any unowned section for a listing fee; the Lunar Authority also opens one scheduled lot every 12 game hours.
- Ore-delivery offers sit on one shared Lunar board. Infrastructure offers are tenders for one company's own public plot, and only that company sees them.

## Global Constraints

All M0–M1 constraints stay. In short:
- Mobile first; desktop from 1024 px; touch targets ≥ 44 × 44 px. Browsers: latest 2 versions of Chrome, Edge, Firefox, Safari (iOS 16+), WebGL 2.
- Time: 1 game hour = 1 real minute; 1 tick = 1 game minute. Players never pause or speed up the clock.
- Determinism: same seed + same commands → same state hash, rivals included. `src/sim/**` and `src/shared/**` never use `Math.random` or `Date`.
- Units: money is integer cents of LM; goods are integer kg; goods prices are cents per tonne; share prices are cents per share; share counts are integers.
- Performance budgets (spec §13.5): simulation tick < 4 ms at 10,000 workers **in total over all companies**; draw calls < 300; triangles < 1.5 M; initial JS (gzip) < 1.5 MiB; catch-up of 8 hours < 10 s.
- Look: palette tokens only; Jost, IBM Plex Sans, IBM Plex Mono (tabular figures); never `backdrop-filter`, purple gradients, emoji or UI kits; reduced motion everywhere.
- UI copy: plain English, short sentences. Strict TypeScript with `noUncheckedIndexedAccess`; no `any`.

New in M2a:
- **Same rules:** a rival changes the world only through `applyCommand(state, cmd, actor)`. No rival-only shortcuts, except the archetype rules this plan names (state-backed rating floor).
- **Accounting invariant:** for every company, `assets − liabilities === shareCapital − treasury + retained + periodNetIncome`, exactly, in cents. Debug builds check it after every tick.
- **Player-only presentation:** alerts, companion beats, income tokens and the away summary show the player's events only. Rival events reach the player only as news.
- **Offline (spec §11.1):** during catch-up the world (markets, rivals, auctions) runs at full rate; only the player's production runs at 50%.

## Review Focus

1. **A v2 save from the live Pages build loads into M2a.** The player keeps company, cash, stock, buildings and workers; rivals are founded on unowned sections; the books open balanced. Tests in C1 (`migrates a v2 save to v3`), C3 (`opens balanced books for a save without them`) and C8 (`founds missing rivals on load`).
2. **Cash runs out when money is due** (auction settlement, payroll, interest). The credit line covers it when it can. Otherwise the bid passes to the runner-up, or payroll pays part; cash never goes negative. Tests in C5 and C7.
3. **A rival goes bankrupt** while it holds orders, contracts, bids, loans, workers, and shares held by others. Orders are cancelled with escrow returned, contracts fail, bids are withdrawn, its sections go to auction, shares held in it are written off, and no money or goods appear or vanish. Test in C11.
4. **Offline catch-up crosses an auction end, a month close and loan payments.** Proxy bids still bid, each auction settles once, the month closes once, interest is charged once per hour. Test in C18.
5. **A rival's event reaches the player's alerts, companion or income tokens.** It must not. Test in C2 (`rival events stay out of player alerts and story`).

---

## File structure

| Path | Responsibility |
|---|---|
| `src/sim/companies.ts` | `CompanyId`, `PLAYER`, `CompanyState`, lookups (`companyOf`, `sectionOwner`, `buildingOwner`, `playerCompany`), cash account names |
| `src/sim/build/founding.ts` | (modify) `foundCharter(state, companyId, sectionId)` for any company |
| `src/sim/build/sections.ts` | (modify) `ownSection(state, sectionId, owner)` gains the owner. Founding, the land office (until C16 deletes `landOffice.ts`) and auction settlement use it |
| `src/sim/finance/books.ts` | Cost pools, equity accounts, posting helpers, the computed balance sheet, `booksBalanced` |
| `src/sim/finance/statements.ts` | Month-to-date accounts, monthly close, ratios |
| `src/sim/finance/credit.ts` | Loans, credit line, interest, rating, default |
| `src/sim/finance/shares.ts` | Listings, holdings, fundamental value, share orders, hourly share clearing, issue, buyback, dividends, disclosure |
| `src/sim/market/clearing.ts` | (modify) unit-agnostic `clearBook()` core, shared by goods and shares |
| `src/sim/auctions.ts` | Lots, bids, proxies, soft close, settlement, scheduled lots |
| `src/sim/rivals/founding.ts` | Rival charters and founding; `ensureRivals` for old saves; replacement rivals |
| `src/sim/rivals/valuation.ts` | Value estimates shared by the rival AI and the bot |
| `src/sim/rivals/ai.ts` | Decision tick, options, utility scoring |
| `src/sim/rivals/solvency.ts` | Seizure, bankruptcy, debt write-off |
| `src/sim/news.ts` | News feed (latest 30) from public events |
| `src/data/companies.ts` | Rival names, archetypes, colours, archetype weights, replacement names |
| `src/data/finance.ts` | Depreciation, credit, rating, share and valuation constants |
| `src/data/auctions.ts` | Auction constants |
| `src/ui/tabs/FinanceTab.tsx` | Statements, ratios, rating, loans, own shares, stocks |
| `src/ui/components/StatementTable.tsx`, `LoanForm.tsx`, `ShareOrderForm.tsx`, `AuctionPanel.tsx` | Finance and auction building blocks |
| `src/ui/shell/NewsTicker.tsx` | (fill) the news ticker |
| `tests/…` | Mirrors `src/`, as in M1 |

**Simulation system order** (`src/sim/engine.ts`; new systems in bold):

`clock` → `construction` → `jobs` → `commute` → `power` → `needs` → `morale` → `migration` → `payroll` → **`credit`** → `belts` → `production` → `market` → **`shares`** → `contracts` → **`auctions`** → **`rivals`** → **`close`** → **`solvency`** → **`news`** → `story` → `alerts`

**Saves.** Pages deploys every push, so a save from any earlier push must load. Renamed or moved fields get a `SAVE_VERSION` bump with a data migration (C1: version 3). New fields get their defaults from `UPGRADES: ((s: GameState) => void)[]` in `src/save/serialize.ts`, which `deserializeState` runs in order after migrating; each task that adds state appends one (C3 `openBooks`, C5 credit defaults, C6 listings, C7 auctions, C8 `ensureRivals`, C16 the Codex id rename).

## New error copy

`ERROR_COPY` stays exhaustive (M1 test `every CommandError has copy`). Each task adds its rows with its codes:

| Code | Task | Text |
|---|---|---|
| CREDIT_LIMIT | C5 | That is more than your credit allows. |
| NO_CREDIT | C5 | Lenders give no credit at rating D. |
| INSUFFICIENT_SHARES | C6 | You do not hold that many shares. |
| ISSUE_LIMIT | C6 | You can issue at most 20% more shares each month. |
| NOT_FOR_SALE | C7 | This section is not for sale now. |
| BID_TOO_LOW | C7 | Bid at least the minimum shown. |
| AUCTION_CLOSED | C7 | This auction has ended. |
| AUCTION_LIMIT | C7 | Too many auctions are open. Wait until one ends. |
| LOW_REPUTATION | C7 | Your reputation is too low to bid. |

# Part C — M2a Economy core

### Task 1 (C1): Companies, the command actor and save version 3

**Files:**
- Create: `src/sim/companies.ts`, `tests/sim/companies.test.ts`, `tests/helpers/companies.ts`, `tests/fixtures/saves/v2-founding.json` (Step 1)
- Modify: `src/sim/state.ts`, `src/sim/ledger.ts`, `src/sim/engine.ts`, `src/sim/commands.ts`, `src/sim/build/sections.ts`, `src/sim/build/founding.ts`, `src/save/migrations.ts`, `tests/save/save.test.ts`, and every reader of `state.company`, `state.reputation`, `state.wageLevel`, `state.payrollShortfall` or the `'player'` account (`grep -rn "'player'\|state\.company\|\.reputation\|\.wageLevel\|payrollShortfall" src bot tests`)
- Copy this plan to `docs/superpowers/plans/2026-11-05-m2a-economy-core.md`

**Interfaces:**
- Produces:

```ts
// src/sim/companies.ts
export type CompanyId = number;
export const PLAYER: CompanyId = 0;
export type Archetype = 'expander' | 'cautiousMiner' | 'financier' | 'pirateLinked' | 'stateBacked';
export interface CompanyState {
  id: CompanyId; name: string; kind: 'player' | 'rival'; archetype: Archetype | null;
  companionId: CompanionId | null; status: 'active' | 'bankrupt'; foundedTick: number; charterSectionId: number;
  /** 0..100 each, start 20. M2a moves both together: every company acts on Luna only. */
  reputation: { group: number; luna: number };
  wageLevel: Record<Skill, WageLevel>; payrollShortfall: boolean;
}
export type CashAccount = `co:${number}`;
export function cashAccount(id: CompanyId): CashAccount;
export function companyOf(state: GameState, id: CompanyId): CompanyState | undefined;
export function activeCompany(state: GameState, id: CompanyId): CompanyState | undefined;  // status 'active' only
export function playerCompany(state: GameState): CompanyState | undefined;
export function sectionOwner(state: GameState, sectionId: number): CompanyId | null;       // null: Lunar Authority
export function buildingOwner(state: GameState, b: Building): CompanyId | null;
export function changeReputation(state: GameState, id: CompanyId, delta: number): void;    // both values, clamped 0..100
// state.ts: GameState drops company, reputation, wageLevel, payrollShortfall and gains companies: CompanyState[].
//           SectionState gains owner: CompanyId (doc: "An owned section"; sections without state stay the Authority's).
// ledger.ts: export type AccountId = 'world' | CashAccount | `escrow:${number}`;
// engine.ts: export function applyCommand(state: GameState, cmd: Command, actor: CompanyId = PLAYER): CommandResult;
// build/sections.ts: ownSection(state, sectionId, owner: CompanyId): SectionState
// build/founding.ts: grantCharter(state, companyId: CompanyId, sectionId: number): void
// market/orders.ts: Order gains companyId: CompanyId
// contracts/contracts.ts: Contract gains holder: CompanyId | null and tenderTo: CompanyId | null
// save/migrations.ts: SAVE_VERSION = 3; MIGRATIONS[2]
// tests/helpers/companies.ts: addTestCompany(state, id: CompanyId, sectionId: number): CompanyState
```

**Rules:**
- With one company, nothing changes: every existing test passes after mechanical edits (`state.company` → `playerCompany(state)`, `'player'` → `cashAccount(PLAYER)`, `state.reputation` → the company's `reputation.luna`).
- `foundCompany` (actor must be `PLAYER`, else `NOT_OWNED`) pushes `companies[0]`: kind `'player'`, archetype null, reputation `{ group: 20, luna: 20 }`, all wages `'standard'`, `charterSectionId = world.foundingSectionId`. Then `grantCharter(state, PLAYER, world.foundingSectionId)`.
- `grantCharter` names its workers from rng `'founders'` for the player and `` `founders:${id}` `` for any other company, so existing seeds keep their names.
- Every other command: no active company for the actor → `NOT_FOUNDED`; a section, building, worker, order or contract of another company → `NOT_OWNED`. `setWageLevel` sets the actor's wages.
- Migration 2 → 3 (data only): `company` becomes `companies[0]` (taking `reputation` into both values, `wageLevel`, `payrollShortfall`; `foundedTick` 0; `charterSectionId` = the first section's id), or `[]` when unfounded; sections gain `owner: 0`; ledger key `'player'` becomes `'co:0'`; orders gain `companyId: 0`; contracts gain `holder` (null while offered, else 0) and `tenderTo` (0 for an offered infrastructure contract, else null).

- [ ] **Step 1: Capture a v2 fixture before changing code**

  With a one-off `npx vite-node` script (deleted afterwards): `createGame(42)`, found "Selene Rock Co", 200 fine ticks, `toSaveFile(s, 0)` → `tests/fixtures/saves/v2-founding.json`.

- [ ] **Step 2: Write failing tests**

```ts
// tests/sim/companies.test.ts
it('founding creates company 0 with reputation 20, standard wages and its charter section', () => {});
it('a second company owns its own section; the player gets NOT_OWNED building there', () => {
  // addTestCompany(s, 1, otherSectionId); build on a plot there: actor 0 → NOT_OWNED, actor 1 → ok
});
it("company 1 cannot cancel the player's order or set the player's wages", () => {});
// tests/save/save.test.ts
it('migrates a v2 save to v3', () => {
  // fromSaveFile(v2 fixture).ok; companies[0].name 'Selene Rock Co'; balances has 'co:0' and no 'player';
  // sections[0].owner === 0; 200 more fine ticks; checkInvariants(state) is []
});
it('loads the v1 fixture through both migrations', () => {});
```

- [ ] **Step 3: Run them**

  Run: `npx vitest run tests/sim/companies.test.ts tests/save`
  Expected: FAIL (module `src/sim/companies` missing; migration 2 missing).

- [ ] **Step 4: Implement**, then run `npx vitest run && npm run check`. Expected: PASS, all M1 tests included.

- [ ] **Step 5: Commit**

  `feat(sim): companies, command actors and save version 3`, then push.

---

### Task 2 (C2): Per-company systems and player-only presentation

**Files:**
- Modify: `src/sim/events.ts`, `src/sim/people/payroll.ts`, `src/sim/people/morale.ts`, `src/sim/people/migration.ts`, `src/sim/people/jobs.ts`, `src/sim/market/orders.ts`, `src/sim/market/market.ts`, `src/sim/contracts/contracts.ts`, `src/sim/contracts/generate.ts`, `src/sim/build/production.ts`, `src/sim/build/construction.ts`, `src/sim/alerts.ts`, `src/sim/story/story.ts`, `src/sim/story/codex.ts`, `src/sim/offline.ts`, `src/main.tsx` (income tokens)
- Test: `tests/sim/companies.test.ts`

**Interfaces:**
- Consumes: C1.
- Produces:

```ts
// events.ts: these members gain companyId: CompanyId — founded, constructionStarted, buildingCompleted, sectionBought,
//   brownout, beltJammed, shortage, arrivals, emigration, strike, strikeEnded, trade, income, contractCompleted, contractFailed.
//   contractOffered gains tenderTo: CompanyId | null. shiftChange and priceMove stay global.
// src/sim/companies.ts
export function workerCompany(state: GameState, index: number): CompanyId | null;  // owner of the home building's section
```

**Rules:**
- Payroll: each company pays its own workers at its own wage levels from its own cash; `payrollShortfall` per company.
- Morale: the wage morale and the unpaid malus come from the worker's company.
- Migration: the arrival skill follows the open slots of the arriving section owner's buildings. Emigration emits one event per company.
- Jobs and buses stay per section (sections never mix owners). `assignWorker` needs the worker's and the building's company to be the actor's.
- Market: an order debits and credits its own company's cash; standing-order top-ups too.
- Contracts:
  - The holder is the company that accepted. Rewards and reputation go to the holder.
  - `maxActive` uses the actor's `reputation.luna`. Board size uses the highest `reputation.luna` among active companies.
  - Ore-delivery offers are public (`tenderTo` null).
  - Infrastructure offers are generated for a public plot of one owned section, and `tenderTo` is that section's owner. Only `tenderTo` may accept (`NOT_OWNED`).
- Production: `offlineEfficiency` scales the player's buildings only (spec §11.1).
- `state.stats` counts the player only.
- Alerts, story, codex unlocks and the away summary take only events with `companyId === PLAYER` (plus `priceMove` and `shiftChange`, and `contractOffered` with `tenderTo` null or `PLAYER`). `main.tsx` flies income tokens for the player's `income` events only.

- [ ] **Step 1: Write failing tests**

```ts
it('each company pays its own workers from its own cash at its own wage level', () => {});
it("a company short of cash lowers only its own workers' morale", () => {});
it('rival events stay out of player alerts and story', () => {
  // addTestCompany(s, 1, sid); build a smelter there with no power → a brownout for company 1
  // run 120 fine ticks: s.alerts has no event with companyId 1; s.story.queue holds no 'ev.brownout'
});
it('only the tendered company can accept an infrastructure offer', () => {});
it("offline efficiency halves only the player's production", () => {});
it('is deterministic with two companies', () => {});
```

- [ ] **Step 2: Run them**

  Run: `npx vitest run tests/sim/companies.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement**, then run `npx vitest run && npm run check`. Expected: PASS.

- [ ] **Step 4: Commit**

  `feat(sim): every system runs per company; the player sees only its own events`, then push.

---

### Task 3 (C3): Books and the accounting invariant

**Files:**
- Create: `src/sim/finance/books.ts`, `src/data/finance.ts`, `tests/sim/finance/books.test.ts`
- Modify: `src/sim/state.ts` (`CompanyState.books`; `Building` gains `costCents`, `bookCents`), `src/sim/build/founding.ts`, `src/sim/build/construction.ts`, `src/sim/build/production.ts`, `src/sim/build/landOffice.ts`, `src/sim/people/needs.ts`, `src/sim/people/payroll.ts`, `src/sim/market/market.ts`, `src/sim/contracts/contracts.ts`, `src/sim/invariants.ts`, `src/save/serialize.ts` (`UPGRADES`)

**Interfaces:**
- Consumes: C1–C2.
- Produces:

```ts
export interface CostPool { kg: number; basisCents: number }
export type RevenueLine = 'sales' | 'contracts' | 'other';
export type ExpenseLine = 'cogs' | 'materials' | 'lifeSupport' | 'wages' | 'depreciation' | 'interest' | 'fees' | 'writeOffs' | 'other';
export type FlowClass = 'operating' | 'investing' | 'financing';
export interface Period { revenue: Record<RevenueLine, number>; expense: Record<ExpenseLine, number>; cash: Record<FlowClass, number> }
export interface Books { pools: Partial<Record<GoodId, CostPool>>; landCents: number; shareCapitalCents: number; treasuryCents: number; retainedCents: number; period: Period }
export type Posting =
  | { to: 'revenue'; line: RevenueLine }
  | { to: 'expense'; line: ExpenseLine }
  | { to: 'asset' }        // the caller records the asset: a pool, a building, land, a holding
  | { to: 'liability' }    // the caller records the debt (C5)
  | { to: 'equity'; account: 'shareCapital' | 'treasury' | 'retained' };
export function cashIn(state: GameState, co: CompanyId, cents: number, posting: Posting, flow: FlowClass): void;      // world → company
export function cashOut(state: GameState, co: CompanyId, cents: number, posting: Posting, flow: FlowClass): boolean;  // false, and no change, when short
export function receiveGoods(state: GameState, co: CompanyId, goodId: GoodId, kg: number, basisCents: number): void;
export function releaseGoods(state: GameState, co: CompanyId, goodId: GoodId, kg: number, line: ExpenseLine | 'capitalise'): number; // basis removed
export function netIncome(p: Period): number;
export function heldKg(state: GameState, co: CompanyId, goodId: GoodId): number; // depots + building buffers + belts + sell-order escrow
export function assets(state: GameState, co: CompanyId): { cash: number; inventory: number; buildings: number; land: number; investments: number; total: number }; // investments 0 until C6
export function liabilities(state: GameState, co: CompanyId): number;            // 0 until C5
export function equityAccounts(c: CompanyState): number;                          // shareCapital − treasury + retained + netIncome(period)
export function booksBalanced(state: GameState, co: CompanyId): string[];        // problems; [] when balanced
export function openBooks(state: GameState, co: CompanyId): void;                // for saves without books
```

**Rules** (every value change posts; nothing else touches cash or pools):

| Event | Cash | Posting and flow | Goods basis |
|---|---|---|---|
| Sell fill | in | revenue `sales`, operating | `releaseGoods(…, 'cogs')` |
| Buy fill | out | asset, operating | `receiveGoods` at the price paid |
| Extraction or recipe output | — | — | `receiveGoods` at basis 0 |
| Recipe inputs used | — | — | `releaseGoods(…, 'materials')` |
| Residents' needs used | — | — | `releaseGoods(…, 'lifeSupport')` |
| Wages | out | expense `wages`, operating | — |
| Build or upgrade | out | asset, investing; `costCents` and `bookCents` += cash + materials basis | materials `releaseGoods(…, 'capitalise')` |
| Demolish | in (the 25% refund) | asset, investing; the building's book leaves; `refund − book` posts to revenue `other` (gain) or expense `writeOffs` (loss) | goods lost past the depot cap: `releaseGoods(…, 'writeOffs')` |
| Contract delivery | — | — | `releaseGoods(…, 'cogs')` |
| Contract reward | in | revenue `contracts`, operating | — |
| Land office purchase (and C7 auctions) | out | asset (`landCents` += price), investing | — |
| Founding | in | equity `shareCapital`, financing | starting stock at base price; starting buildings at list cost (cash + materials at base price); both also add to `shareCapitalCents` |
| Order escrow moves, belts, buffers | — | none (inside the company) | — |

- Average cost: `releaseGoods` removes `kg === pool.kg ? pool.basisCents : Math.round(pool.basisCents * kg / pool.kg)`.
- Cash on the balance sheet = the company's cash account + the escrow of its buy orders.
- `booksBalanced`: assets − liabilities === `equityAccounts`, exactly; every pool's `kg === heldKg`; no basis is negative, and a pool with 0 kg has basis 0. `checkInvariants` adds each company's problems.
- `openBooks` (in `UPGRADES`): pools at base price for `heldKg`, building cost at list cost through its level (upgrade costs included), land 0, `shareCapitalCents = assets − liabilities`.
- `src/data/finance.ts` starts with `DEPRECIATION_MONTHS = 24`; C4–C6 add to it.

- [ ] **Step 1: Write failing tests**

```ts
it('founding books balance: share capital = start cash + stock at base price + buildings at list cost', () => {
  // value from the data tables; with the M1 tables it is LM 758,600; booksBalanced(s, PLAYER) is []
});
it('a sale books revenue and its cost; a buy books inventory at the price paid', () => {});
it('extracted ore enters at zero cost; consumed recipe inputs are expensed as materials', () => {});
it('a building capitalises its cash and materials; demolishing books the refund against book value', () => {});
it('keeps the books balanced under random commands and ticks (fast-check)', () => {
  // 50 runs: up to 30 commands (build, placeOrder, cancelOrder, demolish, accept/deliver contract)
  // with 1–120 fine ticks between; booksBalanced is [] for every company after each step
});
it('opens balanced books for a save without them', () => {});
```

- [ ] **Step 2: Run them**

  Run: `npx vitest run tests/sim/finance`
  Expected: FAIL.

- [ ] **Step 3: Implement**, then run `npx vitest run && npm run check`. Expected: PASS; the dev invariant check stays silent through the demo scene.

- [ ] **Step 4: Commit**

  `feat(sim): double-entry books with an exact accounting invariant`, then push.

---

### Task 4 (C4): Statements and the monthly close

**Files:**
- Create: `src/sim/finance/statements.ts`, `tests/sim/finance/statements.test.ts`
- Modify: `src/sim/state.ts` (`Books.closed`), `src/sim/engine.ts` (`close` system), `src/sim/events.ts`

**Interfaces:**
- Consumes: C3.
- Produces:

```ts
export interface IncomeStatement { revenue: Record<RevenueLine, number>; expense: Record<ExpenseLine, number>; netIncome: number }
export interface CashFlowStatement { operating: number; investing: number; financing: number; net: number }
export interface BalanceSheet { cash: number; inventory: number; buildings: number; land: number; investments: number; assets: number;
  loans: number; credit: number; liabilities: number; shareCapital: number; treasury: number; retained: number; netIncome: number; equity: number }
export interface ClosedMonth { label: string /* 'YYYY-MM' */; income: IncomeStatement; cashFlow: CashFlowStatement; balance: BalanceSheet; sharePriceCents: number | null }
// Books gains closed: ClosedMonth[] (latest 12, newest first)
export function incomeStatement(p: Period): IncomeStatement;
export function cashFlowStatement(p: Period): CashFlowStatement;
export function balanceSheet(state: GameState, co: CompanyId): BalanceSheet;
export interface Ratios { eps: number | null; pe: number | null; roe: number | null; debtToEquity: number | null; interestCover: number | null; currentRatio: number | null }
export function ratios(state: GameState, co: CompanyId): Ratios;
export const closeSystem: System;
// SimEvent gains { t: 'monthClosed'; companyId: CompanyId; label: string; netIncomeCents: number }
// Close hooks, filled by later tasks in this order: C6 dividends, then C5 rating review.
export const CLOSE_HOOKS: ((state: GameState, co: CompanyId) => void)[];
```

**Rules:**
- A month closes on the step that starts at 00:00 on day 1 (fine or coarse). The first close is March 2091, at tick 44,340.
- For each active company, in order:
  1. Depreciation: per building `min(bookCents, Math.round(costCents / DEPRECIATION_MONTHS))`, to expense `depreciation`.
  2. The close hooks run.
  3. The `ClosedMonth` is recorded.
  4. `retainedCents += netIncome`, and the period resets to zero.
- Ratios use the last closed month; before the first close they use the month to date.
  - EPS = net income ÷ shares outstanding (null until C6 lists shares).
  - P/E = price ÷ (EPS × 12).
  - ROE = net income × 12 ÷ equity.
  - D/E = (loans + credit) ÷ equity.
  - Interest cover = (net income + interest) ÷ interest.
  - Current ratio = (cash + inventory) ÷ (credit + loans due within 30 days).
  - Every ratio is null when its denominator is ≤ 0.

- [ ] **Step 1: Write failing tests**

```ts
it('closes March 2091 at tick 44,340 and keeps the latest 12 months', () => {});
it('a closed month carries depreciation of cost / 24 per building', () => {});
it('retained earnings grow by the closed net income and the period starts at zero', () => {});
it('a coarse run closes the same month as a fine run, totals within 1%', () => {});
it('ratios are null when there is nothing to divide by', () => {});
```

- [ ] **Step 2: Run them** — `npx vitest run tests/sim/finance/statements.test.ts` → FAIL.

- [ ] **Step 3: Implement**, then `npx vitest run && npm run check` → PASS.

- [ ] **Step 4: Commit** — `feat(sim): financial statements, ratios and the monthly close`, then push.

---

### Task 5 (C5): Loans, the credit line, the credit rating and default

**Files:**
- Create: `src/sim/finance/credit.ts`, `tests/sim/finance/credit.test.ts`
- Modify: `src/data/finance.ts`, `src/data/copy.ts`, `src/sim/state.ts` (`loans`), `src/sim/companies.ts`, `src/sim/commands.ts`, `src/sim/events.ts`, `src/sim/engine.ts` (`credit` system), `src/sim/people/payroll.ts`, `src/sim/finance/books.ts` (`liabilities`), `src/save/serialize.ts` (`UPGRADES`)

**Interfaces:**
- Consumes: C3 postings, C4 `CLOSE_HOOKS`, `ratios`.
- Produces:

```ts
export type Rating = 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC' | 'D';
export interface Loan { id: number; companyId: CompanyId; principalCents: number; ratePerMonth: number; takenTick: number; dueTick: number }
// CompanyState gains rating: Rating ('BBB' at founding), creditDrawnCents: number, interestRemainder: number,
//   overdueCents: number, default: { sinceTick: number } | null, dRatingCloses: number
export function loanRate(rating: Rating): number | null;               // per game month; null for D
export function creditLimitCents(state: GameState, co: CompanyId): number;
export function borrowingRoomCents(state: GameState, co: CompanyId): number; // LOAN_FACTOR × equity − loans − credit, ≥ 0
export function payDue(state: GameState, co: CompanyId, cents: number, posting: Posting, flow: FlowClass): boolean; // cash, then credit draw
export function rateCompany(state: GameState, co: CompanyId): Rating;
// Command gains { t: 'takeLoan'; amountCents: number; months: 3 | 6 | 12 } | { t: 'repayLoan'; loanId: number; amountCents: number }
//   | { t: 'drawCredit'; amountCents: number } | { t: 'repayCredit'; amountCents: number }
// CommandError gains 'CREDIT_LIMIT' | 'NO_CREDIT'
// SimEvent gains { t: 'ratingChanged'; companyId; from: Rating; to: Rating } | { t: 'defaulted'; companyId; owedCents: number }
//   | { t: 'defaultCured'; companyId }
```

**Data** (`src/data/finance.ts`):
- `BASE_RATE_PER_MONTH = 0.02` (the Lunar Authority rate).
- `SPREAD = { AAA: 0.002, AA: 0.004, A: 0.007, BBB: 0.012, BB: 0.02, B: 0.035, CCC: 0.06 }`. D gets no credit.
- `LINE_FACTOR = { AAA: 1, AA: 0.8, A: 0.6, BBB: 0.4, BB: 0.25, B: 0.15, CCC: 0.05, D: 0 }`. The credit limit is `factor × equity`.
- `LOAN_FACTOR = { AAA: 2, AA: 1.6, A: 1.2, BBB: 0.9, BB: 0.6, B: 0.35, CCC: 0.1, D: 0 }`. Loans + credit stay ≤ `factor × equity`.
- `MIN_LOAN_CENTS = 1_000_000`.
- `DAYS_PER_LOAN_MONTH = 30`.
- `DEFAULT_GRACE_HOURS = 24`.
- `D_RATING_CLOSES = 3`.

**Rules:**
- **Rating points:**
  - D/E: ≤ 0.25 → 3; ≤ 0.75 → 2; ≤ 1.5 → 1; else 0.
  - Interest cover: no interest, or ≥ 8 → 3; ≥ 4 → 2; ≥ 1.5 → 1; else 0.
  - Operating cash flow > 0 → 2.
  - Share price ≥ 0.8 × its 30-day high → 1 (always 1 before C6).
  - Total: 9 → AAA, 8 → AA, 7 → A, 6 → BBB, 5 → BB, 4 → B, ≤ 3 → CCC.
- **Rating review:** a close hook.
  - In default, or for `dRatingCloses` closes after a cure → D.
  - A `stateBacked` company never rates below A, except D.
  - A change emits `ratingChanged`.
- **Interest:** each game hour, per loan, `principal × rate / 720` plus `interestRemainder`. Whole cents go to `payDue(…, expense 'interest', operating)`. The credit line's drawn balance accrues at the company's current `loanRate`.
- **Due loans:** at `dueTick`, the principal is paid through `payDue(…, liability, financing)`.
- **`payDue`:** pays from cash. When cash is short, it draws the credit line, up to the limit, for the shortfall. It returns false, and changes nothing, when both together are short.
- **Payroll:** uses `payDue` first. If that fails, it keeps the M1 behaviour: pay what cash allows, set the shortfall flag. Cash never goes negative.
- **Default:** a failed interest or principal payment adds to `overdueCents`. The first one sets `default` and emits `defaulted`. Each hour, cash pays `overdueCents` first, and at zero `defaultCured` is emitted. While in default:
  - The company places market sell orders for its depot stock above 1 day of residents' needs, once per game hour.
  - C11 adds seizure after `DEFAULT_GRACE_HOURS`.
- **Commands:**
  - `takeLoan`: amount ≥ `MIN_LOAN_CENTS` and ≤ `borrowingRoomCents`, else `CREDIT_LIMIT`. Rating D → `NO_CREDIT`. The rate is fixed at `loanRate(rating)`; `dueTick = tick + months × 30 × 1440`. Posts cash in (liability, financing).
  - `repayLoan` and `repayCredit`: pay at most what is owed, out of cash.
  - `drawCredit`: up to the limit.

- [ ] **Step 1: Write failing tests**

```ts
it('a BBB loan of LM 100,000 costs 3.2% a game month, charged hour by hour', () => {
  // after 720 game hours the interest expense is 320,000 cents (±1)
});
it('repays the principal when due, from cash and then the credit line', () => {});
it('payroll draws the credit line when cash runs short; cash never goes negative', () => {});
it('a missed payment defaults: rating D, defaulted event, forced sell orders', () => {});
it('rates AAA with no debt and positive cash flow; CCC with D/E above 1.5 and cover below 1.5', () => {});
it('a state-backed company never rates below A unless in default', () => {});
it('takeLoan beyond the room fails with CREDIT_LIMIT and changes nothing', () => {});
it('books stay balanced through borrowing, interest and repayment', () => {});
```

- [ ] **Step 2: Run them** — `npx vitest run tests/sim/finance/credit.test.ts` → FAIL.

- [ ] **Step 3: Implement**, then `npx vitest run && npm run check` → PASS.

- [ ] **Step 4: Commit** — `feat(sim): loans, credit line, credit rating and default`, then push.

---

### Task 6 (C6): Shares

**Files:**
- Create: `src/sim/finance/shares.ts`, `tests/sim/finance/shares.test.ts`
- Modify: `src/sim/market/clearing.ts` (extract `clearBook`), `src/data/finance.ts`, `src/data/copy.ts`, `src/sim/state.ts`, `src/sim/commands.ts`, `src/sim/events.ts`, `src/sim/engine.ts` (`shares` system), `src/sim/finance/books.ts` (investments), `src/sim/finance/statements.ts` (EPS, P/E), `src/sim/finance/credit.ts` (price points), `src/save/serialize.ts` (`UPGRADES`)

**Interfaces:**
- Consumes: C3–C5.
- Produces:

```ts
export interface Listing { companyId: CompanyId; outstanding: number; treasury: number; priceCents: number; fvCents: number;
  sentiment: number; history: number[] /* hourly, latest 168 */; dividendRatio: number; issuedThisMonth: number }
export interface Holding { holder: CompanyId; companyId: CompanyId; shares: number; costCents: number }
export interface ShareOrder { id: number; companyId: CompanyId /* placer */; target: CompanyId; side: 'buy' | 'sell'; kind: 'market' | 'limit';
  qty: number; filled: number; limitCents: number | null; escrowShares: number; escrowCents: number; issue: boolean }
// GameState gains listings: Listing[]; holdings: Holding[]; shareOrders: ShareOrder[]
export function fundamentalValueCents(state: GameState, co: CompanyId): number;
export function floatShares(state: GameState, co: CompanyId): number;   // outstanding − treasury − Σ holdings in it
// market/clearing.ts: a unit-agnostic core both markets call
export interface BookOrder { id: number; side: 'buy' | 'sell'; limitCents: number | null; available(p: number): number }
export function clearBook(npcNet: (p: number) => number, lo: number, hi: number, book: BookOrder[]): { priceCents: number; fills: { orderId: number; qty: number }[] };
// Command gains { t: 'placeShareOrder'; target: CompanyId; side: 'buy' | 'sell'; kind: 'market' | 'limit'; qty: number; limitCents?: number }
//   | { t: 'cancelShareOrder'; orderId: number } | { t: 'issueShares'; qty: number } | { t: 'setDividendRatio'; ratio: number }
// CommandError gains 'INSUFFICIENT_SHARES' | 'ISSUE_LIMIT'
// SimEvent gains { t: 'shareTrade'; orderId; companyId; target; side; qty; cents } | { t: 'stakeDisclosed'; holder; companyId; pct: number }
//   | { t: 'dividendPaid'; companyId; perShareCents: number }
```

**Data:** `SHARES = { outstandingAtListing: 100_000, npcTurnoverPerHour: 0.005, elasticity: 2, boundsFactor: 5, maxIssuePerMonth: 0.2, disclosureStake: 0.2, marketBuyEscrowFactor: 2 }`; `VALUATION = { earningsMonths: 3, bookFloor: 0.5, sentimentDecay: 0.95, sentimentSigma: 0.03, defaultShock: -0.5, notchShock: 0.1, dividendShock: 0.05 }`.

**Rules:**
- **Listing:** every company is listed when founded, with 100,000 shares at `fundamentalValueCents`.
- **Fundamental value:** `FV = max(0.5 × book/share, book/share + 3 × max(0, monthly EPS)) × (0.9 + group rep / 200) × e^sentiment`, at least 1 cent.
  - Book per share = equity ÷ (outstanding − treasury).
  - Monthly EPS comes from the last closed month. Before the first close, after ≥ 24 game hours, it is the month to date scaled to 30 days; earlier it is 0.
- **Sentiment:** hourly `s ← 0.95 s + 0.03 × rng('shares').normal()`, clamped to [−1, 1]. Shocks: `defaulted` −0.5, `ratingChanged` ±0.1 per notch, `dividendPaid` +0.05.
- **NPC investors:**
  - Turnover `V = 0.005 × float` shares per hour.
  - Demand `V (p/FV)^−2`, supply `V (p/FV)^2`.
  - Price bounds `[FV/5, 5 FV]`.
- **Hourly clearing:** the `shares` system clears every listing with `clearBook`, at one price for all fills. It updates `priceCents` and `history` and emits `shareTrade` per fill. Goods clearing calls the same core; its results do not change.
- **Escrow:**
  - Buy orders hold cash: limit × qty, or 2 × price × qty for a market buy.
  - Sell orders hold shares from the placer's holding. `issue` orders hold new shares.
  - Market orders cancel their rest after one clearing.
- **Fills:**
  - Investments: `Holding` with `costCents` added; a sale realises proceeds − average cost to revenue `other` or expense `other`.
  - Buyback: a buy of one's own shares goes to `treasury`; `treasuryCents` += cost (equity `treasury`, financing).
  - Issue: `outstanding` += filled; proceeds to equity `shareCapital`, financing.
- **Issuing:** `issueShares`: qty ≤ 20% of outstanding per calendar month, else `ISSUE_LIMIT`. It becomes an `issue` market sell order.
- **Limits:**
  - Selling more than held → `INSUFFICIENT_SHARES`.
  - Holdings never exceed outstanding.
  - `setDividendRatio`: 0..1 in steps of 0.05, else `INVALID_ORDER`.
- **Dividends** (close hook, before the rating review):
  - `perShare = floor(floor(max(0, net income) × ratio) / (outstanding − treasury))`.
  - Holders that are companies receive it to revenue `other`; the float's share goes to the world.
  - Paid from cash (equity `retained`, financing). The paid total reduces `retainedCents`.
  - Emits `dividendPaid`.
- **Disclosure:** a holder crossing 20% of a company's outstanding upward emits one `stakeDisclosed`.

- [ ] **Step 1: Write failing tests**

```ts
it('lists every company at 100,000 shares priced at fundamental value', () => {});
it('with no orders the price follows fundamental value (±0.1%)', () => {});
it('selling 100x the hourly turnover clears at the lower bound and returns the rest', () => {
  // no NaN, integer cents, holding + returned escrow = shares before − filled
});
it('a buyback moves shares to treasury and lowers equity by its cost', () => {});
it('an issue of 20,000 shares adds the proceeds to share capital; a second issue that month fails with ISSUE_LIMIT', () => {});
it('dividends at the close pay holders pro rata and reduce retained earnings', () => {});
it('crossing 20% emits one stakeDisclosed', () => {});
it('goods clearing gives the same prices and fills after the clearBook extraction', () => {}); // the M1 market tests also stay green
it('books stay balanced through share trades, issues, buybacks and dividends', () => {});
```

- [ ] **Step 2: Run them** — `npx vitest run tests/sim/finance/shares.test.ts tests/sim/market` → FAIL (shares), PASS (market).

- [ ] **Step 3: Implement**, then `npx vitest run && npm run check` → PASS.

- [ ] **Step 4: Commit** — `feat(sim): listed shares, NPC investors, issues, buybacks and dividends`, then push.

---

### Task 7 (C7): Auctions

**Files:**
- Create: `src/sim/auctions.ts`, `src/data/auctions.ts`, `tests/sim/auctions.test.ts`
- Modify: `src/sim/state.ts`, `src/sim/commands.ts`, `src/sim/events.ts`, `src/sim/engine.ts` (`auctions` system), `src/data/copy.ts` (new error copy), `src/save/serialize.ts` (`UPGRADES`)

**Interfaces:**
- Consumes: C1 `ownSection`, C3 postings, C5 `payDue`.
- Produces:

```ts
export type Lot = { kind: 'section'; sectionId: number } | { kind: 'assets'; sectionId: number; fromCompanyId: CompanyId };
export interface Bid { companyId: CompanyId; amountCents: number; score: number; tick: number }
export interface Auction { id: number; lot: Lot; openedBy: CompanyId | null; openTick: number; endTick: number; reserveCents: number;
  bids: Bid[]; proxies: { companyId: CompanyId; ceilingCents: number }[]; status: 'open' | 'won' | 'unsold';
  winner: CompanyId | null; priceCents: number | null }
// GameState gains auctions: Auction[] (open ones and the latest 20 closed)
export function bidScore(amountCents: number, reputation: number): number;          // amount × (1 + reputation / 200)
export function minBidCents(state: GameState, a: Auction, co: CompanyId): number;
export function openLot(state: GameState, lot: Lot, openedBy: CompanyId | null, reserveCents: number): Auction; // C11 uses it for assets
// Command gains { t: 'openAuction'; sectionId: number } | { t: 'placeBid'; auctionId: number; amountCents: number }
//   | { t: 'setProxy'; auctionId: number; ceilingCents: number | null }
// CommandError gains 'NOT_FOR_SALE' | 'BID_TOO_LOW' | 'AUCTION_CLOSED' | 'AUCTION_LIMIT' | 'LOW_REPUTATION'
// SimEvent gains { t: 'auctionOpened'; auctionId; sectionId; companyId: CompanyId | null } | { t: 'bidPlaced'; auctionId; companyId; amountCents }
//   | { t: 'auctionWon'; auctionId; companyId; sectionId; amountCents } | { t: 'auctionUnsold'; auctionId; sectionId }
//   | { t: 'bidDefaulted'; auctionId; companyId }
```

**Data** (`src/data/auctions.ts`): `AUCTION = { durationTicks: 180, softCloseTicks: 30, maxDurationTicks: 600, minIncrementCents: 100_000, minIncrementPct: 0.05, listingFeeCents: 200_000, reserveCents: 3_000_000, scheduledEveryHours: 12, maxOpenLots: 6, maxOpenedPerCompany: 2, minReputation: 5, bidDefaultRep: 5 }`.

**Rules:**
- **Opening a lot:** `openAuction` needs:
  - an unowned section that is not on auction (`NOT_FOR_SALE`);
  - fewer than 2 open lots opened by the actor, and fewer than 6 open in all (`AUCTION_LIMIT`);
  - the LM 2,000 fee, paid to expense `fees` (`INSUFFICIENT_CASH`).

  Reserve LM 30,000; `endTick = tick + 180`.
- **Score:** `bidScore` uses the bidder's `reputation.luna`. The leader has the highest score; on a tie, the earlier bid leads.
- **Bids:** need reputation ≥ 5 (`LOW_REPUTATION`), an open lot (`AUCTION_CLOSED`), and amount ≥ `minBidCents` (`BID_TOO_LOW`).
  - `minBidCents` with no bids = the reserve.
  - Otherwise `ceil(max(leaderScore + 100_000, leaderScore × 1.05) / (1 + rep/200))`.
  - The leader cannot outbid itself.
  - Bids are not escrowed.
- **Proxies:** after each bid, proxy change and tick, every proxy whose company is not leading bids its `minBidCents` when that is ≤ its ceiling. Proxies act in company-id order, round after round, until none can bid (at most 50 rounds). `setProxy(null)` removes it.
- **Soft close:** a bid at `tick ≥ endTick − 30` sets `endTick = min(tick + 30, openTick + 600)`.
- **Settlement:** at the first step with `tick ≥ endTick` (fine or coarse).
  - The leader pays through `payDue(…, asset, investing)`, and `landCents` += the price.
  - When that fails: `bidDefaulted`, reputation −5, and its bids and proxy are removed. The next leader is tried, then the next.
  - When nobody is left, the lot is `unsold`.
  - The winner gets `ownSection(state, sectionId, winner)`, plus `auctionWon` and `sectionBought`.
- **Scheduled lots:** when `tick % 720 === 0` and fewer than 6 lots are open, the Authority opens a lot on an unowned section next to any owned section. The section comes from rng `'auctions'`; no fee; `openedBy` null.
- **Coarse steps:** each step resolves the proxies first, then settles every lot whose end the step reaches.
- **Land office:** the player keeps it until C16.

- [ ] **Step 1: Write failing tests**

```ts
it('opens a lot for LM 2,000; a second lot on the same section fails with NOT_FOR_SALE', () => {});
it('a higher reputation wins with a lower amount', () => {
  // A (rep 20) bids LM 50,000 → score 55,000; B (rep 60) needs ceil(57,750 / 1.3) = LM 44,424 and leads with it
});
it('a proxy outbids by the minimum increment up to its ceiling', () => {});
it('two proxies resolve to the lower ceiling plus at most one increment', () => {
  // equal reputation, ceilings LM 80,000 and LM 70,000 → winner A, price in [70,000, 73,500]
});
it('a bid in the last 30 ticks extends the end, never past 600 ticks', () => {});
it('settles once: the winner owns the section with a depot and a road net, and land is on its books', () => {});
it('a winner short of cash draws its credit line; without one the runner-up wins and the winner loses 5 reputation', () => {});
it('coarse steps settle the same winner and price as fine ticks', () => {});
it('the Authority opens one scheduled lot every 12 game hours, at most 6 open', () => {});
```

- [ ] **Step 2: Run them** — `npx vitest run tests/sim/auctions.test.ts` → FAIL.

- [ ] **Step 3: Implement**, then `npx vitest run && npm run check` → PASS.

- [ ] **Step 4: Commit** — `feat(sim): section auctions with reputation-weighted bids and proxies`, then push.

---

### Task 8 (C8): Rival companies

**Files:**
- Create: `src/sim/rivals/founding.ts`, `src/data/companies.ts`, `tests/sim/rivals/founding.test.ts`
- Modify: `src/sim/engine.ts` (`foundCompany`), `src/sim/companies.ts` (`colour`), `src/save/serialize.ts` (`UPGRADES`)

**Interfaces:**
- Consumes: C1 `grantCharter`, C3 books, C5 rating, C6 listings.
- Produces:

```ts
// src/data/companies.ts
export type CompanyColour = 'burntOrange' | 'teal' | 'mustard' | 'dustyPink' | 'rust' | 'navy';
export const PLAYER_COLOUR: CompanyColour = 'burntOrange';
export const RIVALS: { name: string; archetype: Archetype; colour: CompanyColour }[];
export const REPLACEMENT_NAMES: string[];
export interface ArchetypeWeights { extract: number; process: number; trade: number; expand: number; finance: number;
  maxDebtToEquity: number; auctionAggression: number; dividendRatio: number; wage: WageLevel; paybackDays: number; goods: RawGoodId[] }
export const ARCHETYPES: Record<Archetype, ArchetypeWeights>;
// CompanyState gains colour: CompanyColour
// src/sim/rivals/founding.ts
export function chooseCharter(state: GameState, archetype: Archetype): number | null;
export function foundRival(state: GameState, name: string, archetype: Archetype, colour: CompanyColour): CompanyState | null;
export function foundRivals(state: GameState): void;
export function ensureRivals(state: GameState): void;
```

**Data** (fictional names; C12 may tune the weights):

| Rival | Archetype | Colour |
|---|---|---|
| Tycho Deepworks | expander | teal |
| Nubium Mineral Company | cautiousMiner | mustard |
| Grey Ledger Capital | financier | dustyPink |
| Blackrim Salvage | pirateLinked | rust |
| Selenic State Works | stateBacked | navy |

`REPLACEMENT_NAMES = ['Aitken Basin Resources', 'Clavius Ridge Ventures', 'Mare Frigoris Holdings', 'Aristarchus Light Mining', 'Plato Crater Works', 'Rupes Recta Extraction']`.

| Archetype | extract | process | trade | expand | finance | maxDebtToEquity | auctionAggression | dividendRatio | wage | paybackDays | goods |
|---|---|---|---|---|---|---|---|---|---|---|---|
| expander | 1.0 | 0.8 | 0.8 | 1.6 | 0.6 | 1.2 | 1.3 | 0 | standard | 6 | ilmenite, anorthite, regolith |
| cautiousMiner | 1.3 | 0.6 | 1.0 | 0.6 | 0.4 | 0.4 | 0.8 | 0.3 | standard | 3 | ilmenite, regolith, polarVolatiles |
| financier | 0.8 | 1.0 | 1.2 | 0.8 | 1.6 | 0.9 | 1.0 | 0.2 | standard | 4 | anorthite, kreep |
| pirateLinked | 1.1 | 0.6 | 1.4 | 1.0 | 0.8 | 1.5 | 1.5 | 0 | low | 4 | helium3, kreep, ilmenite |
| stateBacked | 1.0 | 1.2 | 0.8 | 1.0 | 0.6 | 1.0 | 1.0 | 0.4 | high | 8 | polarVolatiles, anorthite, regolith |

**Rules:**
- `foundCompany` founds the player, then `foundRivals` founds the 5 `RIVALS` with ids 1–5.
- `chooseCharter`: among unowned sections at least 2 neighbour hops from every owned section, the highest summed deposit richness over the archetype's `goods` (ties: the lower id). Null when none is left.
- `foundRival`: a `CompanyState` (kind `'rival'`, reputation 20/20, the archetype's wage, rating BBB, its colour), then `grantCharter` with the player's endowment (cash, stock, buildings, 33 workers), books (C3) and a listing (C6).
- A player whose name equals a rival's (ignoring case) pushes that rival to the next replacement name.
- `ensureRivals` (in `UPGRADES`): a founded game with only the player gets the 5 rivals now, with `foundedTick = tick`.
- Rival workers live, commute and work under the same systems as the player's; nothing is simplified (owner decision).

- [ ] **Step 1: Write failing tests**

```ts
it('founds 5 rivals on distinct charters, 2+ hops from each other and from the player', () => {});
it("each rival starts with the player's cash, stock, buildings and 33 workers, listed, with balanced books", () => {});
it('rival workers ride rival buses and are paid from rival cash', () => {});
it('founds missing rivals on load', () => {}); // the v2 fixture: 6 companies after fromSaveFile
it('a player named like a rival pushes that rival to a replacement name', () => {});
it('is deterministic', () => {});
```

- [ ] **Step 2: Run them** — `npx vitest run tests/sim/rivals` → FAIL.

- [ ] **Step 3: Implement**, then `npx vitest run && npm run check` → PASS. Existing scenes and the bot now run with 5 idle rivals; their tests stay green.

- [ ] **Step 4: Commit** — `feat(sim): five rival companies with full workforces`, then push.

---

### Task 9 (C9): Rival AI — operations

**Files:**
- Create: `src/sim/rivals/ai.ts`, `src/sim/rivals/valuation.ts`, `tests/sim/rivals/ai.test.ts`
- Modify: `src/sim/engine.ts` (`rivals` system)

**Interfaces:**
- Consumes: C8 `ARCHETYPES`; every command so far.
- Produces:

```ts
export interface Option { cmd: Command; utility: number; why: string }
export type OptionSource = (state: GameState, co: CompanyState, w: ArchetypeWeights) => Option[];
export const OPTION_SOURCES: OptionSource[];        // C9 adds operations; C10 appends finance and auctions
export const ACTIONS_PER_DECISION = 3;
export function decisionMinute(co: CompanyId): number;   // (co × 11) % 60
export function createRivalsSystem(dispatch?: (state: GameState, cmd: Command, actor: CompanyId) => CommandResult): System; // default applyCommand
export const rivalsSystem: System;
// valuation.ts
export function goodValueCents(state: GameState, goodId: GoodId, kg: number): number;   // at the last clearing price
export function hourlyMarginCents(state: GameState, plotId: number, type: BuildingTypeId, recipeId: RecipeId | null): number;
export function sectionValueCents(state: GameState, sectionId: number, horizonDays: number): number;
```

**Rules:**
- **Decision tick:** in fine mode at minute `decisionMinute(id)` of each hour; in coarse mode once per step. For each active rival:
  1. Gather the options from `OPTION_SOURCES`.
  2. Sort by utility, highest first (ties by `why`).
  3. Dispatch up to 3 with utility > 0 as `applyCommand(state, cmd, id)`. A failed command is skipped.

  The AI draws no random numbers and changes no state outside the dispatched commands.
- **Utilities** are in cents of value per game day, times the archetype weight:
  - **Build:** `hourlyMarginCents × 24 × (w.extract on a deposit, else w.process) − cost / w.paybackDays`. Only when cash ≥ cost + 1 day of wages. When materials are short, the option becomes a limit buy of the shortfall at 1.2 × the last price.
  - **Life support:** a need with under 3 days of stock buys 3 days' worth, at utility 1e9 so it goes first.
  - **Housing:** open slots > idle workers and no free beds → crew quarters, at the blocked buildings' margin × 24.
  - **Power:** section power factor < 1 → a solar array, at the lost margin × 24.
  - **Sell:** stock above the M1 bot's `reserveKg` is sold at market, up to 250 × the good's NPC hourly volume. Utility = value × `w.trade` / 10.
  - **Recipe inputs:** an input buffer under 2 hours gets a limit buy at 1.1 × the last price.
  - **Contracts:** accept an ore-delivery offer that stock + 24 h of output covers (utility = reward − goods value). Deliver whenever stock covers a stage (utility = reward).
  - **Wages:** a strike raises the wage one level. A pirate-linked company returns to low after 24 strike-free hours.

- [ ] **Step 1: Write failing tests**

```ts
it('rivals change the world only through applyCommand', () => {
  // run A: 2 game days with createRivalsSystem(spy) recording (tick, actor, cmd)
  // run B: same seed, a rivals system that only replays the recorded commands at the same ticks → hashState(A) === hashState(B)
});
it('a rival builds a mine on a deposit within 12 game hours and sells its ore', () => {});
it('a rival short of oxygen buys it before it runs out', () => {});
it('a rival accepts and delivers an ore contract it can fill', () => {});
it('after 3 game days the expander has built more than the cautious miner', () => {});
it("rivals never touch the player's sections, orders or contracts", () => {});
it('3 game days with 5 rivals keep every company's books balanced and invariants clean', () => {});
```

- [ ] **Step 2: Run them** — `npx vitest run tests/sim/rivals/ai.test.ts` → FAIL.

- [ ] **Step 3: Implement**, then `npx vitest run && npm run check` → PASS.

- [ ] **Step 4: Commit** — `feat(sim): utility AI runs rival operations`, then push.

---

### Task 10 (C10): Rival AI — finance and auctions

**Files:**
- Modify: `src/sim/rivals/ai.ts`, `src/sim/rivals/valuation.ts`
- Test: `tests/sim/rivals/finance.test.ts`

**Interfaces:**
- Consumes: C5 loans and `borrowingRoomCents`, C6 share commands, C7 auction commands, C9 `OPTION_SOURCES`.
- Produces: three more `OptionSource`s appended to `OPTION_SOURCES`, for auctions, debt and equity.

**Rules:**
- **Headroom:** `cash + creditLimit − drawn − 1 day of wages`. No bid ceiling or loan goes past it.
- **Auctions:**
  - For each open lot the rival has no proxy on, `value = sectionValueCents(sectionId, 10) × w.expand`. For an assets lot, add 0.5 × the book value of its buildings.
  - When `value > minBidCents`, it sets a proxy with `ceiling = min(value × w.auctionAggression, headroom)`. Utility = value − min bid.
  - With fewer than 2 lots of its own open and cash ≥ 2 × the reserve, it opens a lot on the most valuable unowned section, next to its own first. Utility = `value × w.expand − reserve`.
- **Debt:**
  - When the best build option in this decision failed for cash and D/E < `w.maxDebtToEquity`, it takes a 6-month loan for the shortfall, rounded up to LM 10,000. Utility = that build's utility − 6 months of interest.
  - The cautious miner and the state-backed company repay when cash > 3 days of costs + the loan.
- **Equity:**
  - After the first close, `setDividendRatio(w.dividendRatio)` when the ratio differs.
  - The cautious miner and the state-backed company buy back up to 2% of their shares when price < 0.8 × FV and cash > 5 days of costs.
  - The financier buys up to 5% of a listing at a limit at the price when price < 0.85 × FV. It sells holdings when price > 1.15 × FV.
  - The expander issues up to 10% when price > 1.2 × FV and a build failed for cash.

- [ ] **Step 1: Write failing tests**

```ts
it('a rival puts a proxy on a lot it values and wins it unopposed', () => {});
it('a player proxy at the reserve loses a valuable lot to a rival', () => {});
it('the cautious miner keeps D/E under 0.4; the expander borrows to build', () => {});
it('the financier buys shares trading under 0.85 of fundamental value', () => {});
it('no rival bids or borrows past its headroom', () => {});
it('rivals pay their archetype dividend ratio after the first close', () => {});
```

- [ ] **Step 2: Run them** — `npx vitest run tests/sim/rivals/finance.test.ts` → FAIL.

- [ ] **Step 3: Implement**, then `npx vitest run && npm run check` → PASS.

- [ ] **Step 4: Commit** — `feat(sim): rivals bid, borrow, invest and pay dividends`, then push.

---

### Task 11 (C11): Seizure, bankruptcy and new rivals

**Files:**
- Create: `src/sim/rivals/solvency.ts`, `tests/sim/rivals/solvency.test.ts`
- Modify: `src/sim/engine.ts` (`solvency` system), `src/sim/auctions.ts` (assets lots), `src/sim/finance/shares.ts` (delisting), `src/sim/companies.ts`, `src/sim/events.ts`

**Interfaces:**
- Consumes: C5 default, C7 `openLot`, C8 `foundRival`.
- Produces:

```ts
export const solvencySystem: System;
export function bankrupt(state: GameState, co: CompanyId): void;
// CompanyState gains bankruptTick: number | null
// SimEvent gains { t: 'bankrupt'; companyId } | { t: 'rivalFounded'; companyId } | { t: 'debtWrittenOff'; companyId; cents: number }
```

**Rules:**
- **Seizure:** a company in default for 24 game hours with `overdueCents > 0` is seized.
  - **A rival goes bankrupt.**
  - **The player:**
    1. An assets lot opens for every owned section except the charter. Reserve = 50% of the land and building book value in it.
    2. Proceeds pay the debt: overdue first, then credit, then loans.
    3. When only the charter is left and debt remains, the rest is written off (`debtWrittenOff`, revenue `other`). The rating stays D for 3 closes and reputation drops by 20.
- **Bankruptcy** (`bankrupt`):
  - status `'bankrupt'`; `bankruptTick` set; `bankrupt` emitted.
  - Its goods and share orders are cancelled, escrow back to it.
  - Its active contracts fail; its bids and proxies are withdrawn.
  - Every holder writes off its shares (expense `writeOffs`); the listing and every holding in it are removed.
  - Its cash goes to the world against its debts; loans and credit left over are written off by the lender (the world).
  - Each of its sections becomes an assets lot (`openedBy` null). The sections keep owner = the bankrupt id until sold. Its workers stay unpaid until then, so they drift away by M1 morale rules.
- **Assets lot won:** the winner takes the section with its buildings, depot stock and residents. The price is capitalised as land. The buildings' `costCents` and `bookCents` reset to 0, and the stock enters the winner's pools at basis 0.
- **Assets lot unsold:** the section returns to the Lunar Authority. Its buildings are removed, its residents leave (the people store drops them) and its stock is written off on the bankrupt company's frozen books.
- **Replacement:** 48 game hours after a bankruptcy, `foundRival` founds the next `REPLACEMENT_NAMES` name with the bankrupt company's archetype and colour, and emits `rivalFounded`.

- [ ] **Step 1: Write failing tests**

```ts
it('a rival 24 game hours in default goes bankrupt and its sections go to auction', () => {});
it('bankruptcy cancels orders with escrow back, fails contracts, withdraws bids and writes off its shares', () => {});
it('no money or goods appear or vanish through a bankruptcy', () => {
  // ledger balances sum to 0 throughout; every kg before = kg held by companies after + kg sold + kg written off on books
});
it('the winner of an assets lot takes the section with its buildings, stock and residents', () => {});
it('an unsold assets lot returns the section to the Lunar Authority', () => {});
it('a new rival is founded 48 game hours after a bankruptcy', () => {});
it('the player keeps the charter section and the rest of the debt is written off', () => {});
```

- [ ] **Step 2: Run them** — `npx vitest run tests/sim/rivals/solvency.test.ts` → FAIL.

- [ ] **Step 3: Implement**, then `npx vitest run && npm run check` → PASS.

- [ ] **Step 4: Commit** — `feat(sim): seizure, rival bankruptcy and replacement rivals`, then push.

---

### Task 12 (C12): The money rebalance and the bot

**Files:**
- Modify: `bot/strategy.ts`, `bot/bot.test.ts`, `bot/scenes.ts`, `src/data/balance.ts`, `src/data/finance.ts`, `src/data/auctions.ts`, `src/data/companies.ts`, `src/sim/contracts/contracts.ts` (colony growth moves to `COLONY.growthPerContract`)
- Test: `tests/bot/scenes.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `RunResult` gains `auctionsWonAgainstRivals`, `equityGrowth`, `activeRivals`, `rivalsWithoutSection` and `rivalEquityGrowth: number[]`.
  - `makeRivalBenchState(seed): GameState`: 6 companies, 30 sections (5 each), exactly 10,000 workers in total, all housed and employed (C19 uses it).
  - Equity growth = equity ÷ founding equity.

**Rules:**
- **The bot's `expand`** replaces the land office. It runs when it has fewer than 4 sections, `BUILT_BEFORE_LAND` is reached and none of its own lots is open:
  - It opens a lot on the best unowned neighbour (anorthite first, as in M1).
  - It sets a proxy at `min(1.5 × sectionValueCents(…, 10), headroom − LM 20,000)`.
  - It joins Authority lots next to its sections the same way.
- **The bot's loans:** a 6-month loan for a planned build that lacks cash, when its rating is BBB or better and D/E < 0.5. It repays when cash > 2 × the loan. Dividends stay 0.
- **Tuning:** only data constants change. Each change goes into the commit message with its before and after. First suspects:
  - colony growth per completed contract (40–120 people);
  - contract margins;
  - NPC volumes.

- [ ] **Step 1: Write the failing targets** (`bot/bot.test.ts`, `runBot(42, 1440)`, one real day in coarse steps)

```ts
expect(seconds).toBeLessThan(90);
expect(r.sections).toBeGreaterThanOrEqual(2);
expect(r.sections).toBeLessThanOrEqual(4);
expect(r.auctionsWonAgainstRivals).toBeGreaterThanOrEqual(1);
expect(r.activeSmelters).toBeGreaterThanOrEqual(1);
expect(r.population).toBeGreaterThanOrEqual(60);
expect(r.contractsCompleted).toBeGreaterThanOrEqual(2);
expect(r.equityGrowth).toBeGreaterThanOrEqual(3);
expect(r.equityGrowth).toBeLessThanOrEqual(5);
expect(r.worstLifeSupportHours).toBeLessThanOrEqual(24);
expect(r.activeRivals).toBeGreaterThanOrEqual(3);
expect(r.rivalsWithoutSection).toBe(0);
expect(r.rivalEquityGrowth.every((g) => g >= 0.5 && g <= 8)).toBe(true);
// tests/bot/scenes.test.ts
it('the rival bench holds 6 active companies and exactly 10,000 workers', () => {});
```

- [ ] **Step 2: Run them** — `npm run bot && npx vitest run tests/bot` → FAIL (record the measured values in the ledger).

- [ ] **Step 3: Update the bot, then tune the data until every target holds.** If a target cannot hold by data alone, stop and rule (spec §3.3 and the owner's 3–5× decision bind).

- [ ] **Step 4: Run** `npm run bot && npx vitest run && npm run check` → PASS.

- [ ] **Step 5: Commit** — `feat(bot): auctions and loans; tight-money balance`, with every tuned constant in the message, then push.

---

### Task 13 (C13): Views, protocol and news

**Files:**
- Create: `src/sim/news.ts`, `tests/sim/news.test.ts`
- Modify: `src/sim/views.ts`, `src/worker/simHost.ts` (world signature), `src/data/copy.ts` (`newsText`), `src/sim/engine.ts` (`news` system), compile fixes in `src/ui` and `src/render` for the changed fields (no new UI yet), `tests/sim/views.test.ts`

**Interfaces:**
- Consumes: C1–C12.
- Produces:

```ts
// news.ts
export type NewsItem = SimEvent & { tick: number };
export const NEWS_TYPES: ReadonlySet<SimEvent['t']>;  // auctionOpened, auctionWon, auctionUnsold, stakeDisclosed, defaulted, defaultCured,
                                                      // ratingChanged, bankrupt, rivalFounded, dividendPaid, monthClosed, debtWrittenOff
export const newsSystem: System;                      // latest 30, newest first; GameState gains news: NewsItem[]
// copy.ts
export function newsText(item: NewsItem, companyName: (id: CompanyId) => string): string;
// views.ts — WorldView
//   sections[].owner: CompanyId | null (was 'player' | 'authority'); sections[].onAuction: boolean
//   buildings[] gain owner: CompanyId | null
//   companies: { id: CompanyId; name: string; colour: CompanyColour; status: 'active' | 'bankrupt' }[]
// views.ts — UiSnapshot
//   reputation: { group: number; luna: number }   (was number)
//   companies: CompanySummary[]; finance: FinanceView; listings: ListingView[]; holdings: Holding[];
//   shareOrders: ShareOrder[]; auctions: AuctionView[]; news: NewsItem[]
export interface CompanySummary { id: CompanyId; name: string; kind: 'player' | 'rival'; archetype: Archetype | null; colour: CompanyColour;
  status: 'active' | 'bankrupt'; sections: number; equityCents: number; rating: Rating }
export interface FinanceView { period: IncomeStatement; cashFlow: CashFlowStatement; balance: BalanceSheet; closed: ClosedMonth[]; ratios: Ratios;
  rating: Rating; loans: Loan[]; creditDrawnCents: number; creditLimitCents: number; borrowingRoomCents: number; inDefault: boolean; dividendRatio: number }
export interface ListingView { companyId: CompanyId; priceCents: number; change24h: number; history: number[]; outstanding: number;
  treasury: number; marketCapCents: number; pe: number | null }
export interface AuctionView { id: number; lot: Lot; status: Auction['status']; endTick: number; reserveCents: number; leader: CompanyId | null;
  leaderAmountCents: number | null; bids: number; myProxyCents: number | null; myMinBidCents: number | null;
  winner: CompanyId | null; priceCents: number | null }
```

**Rules:**
- **Player-only snapshot lists:** `sections`, `buildings`, `workforce`, `orders`, `contracts` (public offers, tenders to the player and the player's own), `sites`, `alerts`.
- **The other snapshot lists:**
  - `holdings`: the player's own holdings, plus every holder of the player's shares above 1%.
  - `auctions`: open lots and the latest 10 closed.
- **The world view** keeps every company's buildings, roads and belts, with an owner per building.
- **The world signature** adds section owners and open lots, so the map redraws when they change.
- **Budget:** on the rival bench, the snapshot JSON is under 200 KB and `buildUiSnapshot` takes under 2 ms. These are the M1 budgets.

- [ ] **Step 1: Write failing tests**

```ts
it("the snapshot lists only the player's sections, buildings, orders and contracts", () => {});
it("the world view carries every company's buildings with their owner", () => {});
it('the world version bumps when a section changes owner', () => {});
it('news keeps the latest 30 public events, newest first', () => {});
it('views survive structuredClone; the rival-bench snapshot is under 200 KB and builds in under 2 ms', () => {});
```

- [ ] **Step 2: Run them** — `npx vitest run tests/sim/views.test.ts tests/sim/news.test.ts` → FAIL.

- [ ] **Step 3: Implement**, then `npx vitest run && npm run check && npx playwright test` → PASS (the UI still shows M1 screens).

- [ ] **Step 4: Commit** — `feat: views, snapshot and news for companies, finance and auctions`, then push.

---

### Task 14 (C14): Company colours and auction lots on the map

**Files:**
- Modify: `src/render/overlays/sectionOverlay.ts`, `src/render/overlays/filters.ts`, `src/ui/shell/MapFilters.tsx`, `src/ui/global.css`, `e2e/visual.spec.ts-snapshots/*`
- Test: `tests/render/overlays.test.ts`, `e2e/render.spec.ts`

**Interfaces:**
- Consumes: C13 `WorldView.companies`, `sections[].owner`, `sections[].onAuction`.
- Produces: `export function ownerColour(owner: CompanyId | null, companies: WorldView['companies']): string | null;` It returns a palette hex, or null for the Authority.

**Rules:**
- Ownership fill: one mesh per company in its colour, opacity 0.35 (the player stays burntOrange).
- Open lots get a cream outline at `ORBIT_LIFT + 0.01`. The mustard "buyable" outline stays until C16 removes the land office.
- The Ownership chip shows a legend: a swatch and a name per active company ("You" for the player). On phones the legend wraps under the chips.
- Rival buildings, roads, belts and buses use the existing layers; nothing new is drawn for them.
- Regenerate the visual baselines (rivals now colour the planetary view) and inspect every PNG.

- [ ] **Step 1: Write failing tests**

```ts
it('ownerColour gives the player burntOrange, rivals their colour and the Authority null', () => {});
// e2e/render.spec.ts
test('at planetary altitude the ownership legend lists 6 companies', async ({ page }) => {});
```

- [ ] **Step 2: Run them** — `npx vitest run tests/render/overlays.test.ts && npx playwright test e2e/render.spec.ts` → FAIL.

- [ ] **Step 3: Implement**, update the baselines with `npx playwright test e2e/visual.spec.ts --update-snapshots`, and inspect them.

- [ ] **Step 4: Run** `npx vitest run && npm run check && npx playwright test` → PASS.

- [ ] **Step 5: Commit** — `feat(render): company colours, auction lots and an ownership legend`, then push.

---

### Task 15 (C15): The Finance tab

**Files:**
- Create: `src/ui/tabs/FinanceTab.tsx`, `src/ui/components/StatementTable.tsx`, `src/ui/components/LoanForm.tsx`, `src/ui/components/ShareOrderForm.tsx`, `e2e/finance.spec.ts`
- Modify: `src/ui/shell/tabs.ts`, `src/ui/shell/Shell.tsx` (tab body, the More sheet), `src/ui/icons.tsx` (`finance`), `src/ui/global.css`, `e2e/helpers.ts` (`openTab` finds Finance under More), `README.md` (controls)

**Interfaces:**
- Consumes: C13 `FinanceView`, `ListingView`, `holdings`, `shareOrders`, `news`; M1 `PriceChart`, `Choices`, `useCommand`, `ErrorText`, `formatMoney`.
- Produces: `TabId` gains `'finance'`; `FinanceTab()`; `StatementTable({ rows }: { rows: { label: string; cents: number; strong?: boolean }[] })`; `LoanForm()`; `ShareOrderForm({ target }: { target: CompanyId })`.

**Rules:**
- **Tabs** follow spec §9.4: `1` Build, `2` People, `3` Trade, `4` Finance, `5` Contracts, `6` Codex, `7` Settings. The phone's bottom tabs stay Build, People, Trade, Contracts and More; More holds Finance, Codex and Settings.
- **Sections of the tab, in order:**
  1. **Statements:** a period choice ("This month", then each closed month by its label). The income statement, the balance sheet and the cash-flow statement, as `StatementTable`s, with mono tabular figures.
  2. **Ratios and rating:** EPS, P/E, ROE, D/E, interest cover and current ratio ("—" when null), and the rating. "In default" shows as a warning while it lasts.
  3. **Loans and credit:**
     - The loan form: amount in LM; term 3, 6 or 12 months as `Choices`; the monthly rate for the current rating; the room left.
     - The loan list: amount, rate, due date, and Repay.
     - The credit line: drawn and limit, with Draw and Repay.
  4. **Your shares:** a price chart (`PriceChart` on the share history), shares outstanding, treasury, market cap, and holders above 1%. The dividend ratio as `Choices` (0, 10, 25, 50%). "Buy back" and "Issue shares", each confirmed first, for example "Issue 10,000 new shares? Every shareholder will own a smaller part of the company."
  5. **Stocks:** a table of listed companies with name, price, 24 h change (trend icon), P/E and rating. Selecting a row opens a `ShareOrderForm` (side, market or limit, quantity, limit price) and shows the player's holding in it.
  6. **News** (phones only, where the ticker does not show): the latest 10 news items.
- Command errors show their `ERROR_COPY` text in an `aria-live="polite"` region.

- [ ] **Step 1: Write the failing e2e tests** (`e2e/finance.spec.ts`, seed 42, timescale 60)

```ts
test('key 4 opens Finance; on phones it is under More', async ({ page }) => {});
test('the balance sheet shows founding share capital', async ({ page }) => {}); // the value read from the snapshot
test('a 3-month loan of LM 50,000 raises cash and appears with its rate and due date', async ({ page }) => {});
test('buying 100 shares of Tycho Deepworks at market shows the holding after the next clearing', async ({ page }) => {});
```

- [ ] **Step 2: Run them** — `npx playwright test e2e/finance.spec.ts` → FAIL.

- [ ] **Step 3: Implement.** Look at the tab on desktop and phone widths; take screenshots and fix anything that reads cramped.

- [ ] **Step 4: Run** `npm run check && npx playwright test` → PASS.

- [ ] **Step 5: Commit** — `feat(ui): Finance tab with statements, loans and shares`, then push.

---

### Task 16 (C16): The auctions UI and the end of the land office

**Files:**
- Create: `src/ui/components/AuctionPanel.tsx`, `e2e/auctions.spec.ts`
- Modify: `src/ui/tabs/BuildTab.tsx`, `src/ui/shell/ContextPanel.tsx`, `src/sim/commands.ts`, `src/sim/engine.ts`, `src/sim/state.ts`, `src/sim/views.ts`, `src/sim/story/story.ts`, `src/sim/story/beats.ts`, `src/data/codex.ts`, `src/data/companions/veteran.ts`, `src/data/companions/narrator.ts`, `src/sim/build/power.ts`, `src/render/overlays/sectionOverlay.ts`, `src/save/serialize.ts` (`UPGRADES`), `e2e/core-loop.spec.ts`, `README.md`
- Delete: `src/sim/build/landOffice.ts`, `src/ui/components/BuySection.tsx`

**Interfaces:**
- Consumes: C7 commands, C13 `AuctionView`.
- Produces: `AuctionPanel({ auctionId }: { auctionId: number })`. `buySection`, `landPrice`, `buyableSections`, `landPurchases`, `landPriceCents` and `buyable` no longer exist.

**Rules:**
- **The Build tab gets a "Land and auctions" region:**
  - The open lots: section ("Section 23"), kind ("Section rights" or "Company assets"), leader ("You", a rival's name, or "No bids"), your proxy, and the time left in real minutes.
  - For a selected unowned section without a lot: "Open an auction — LM 2,000", with the reserve (LM 30,000) beside it.
- **`AuctionPanel`** shows in the Build tab and in a section's context panel, and updates live:
  - the leader and the amount;
  - "Your minimum bid", and a bid field with "Bid";
  - "Bid for me up to" with "Set" and "Remove";
  - the end time.
- **Story:** `ch1.expansion` starts after `ch1.firstRefinery` and completes on the player's `sectionBought`. It unlocks `mech.auctions`. Rewrite Ox's expansion lines for auctions and rivals: 2–6 lines of at most 220 characters, in his voice.
- **Codex:** `mech.landOffice` becomes `mech.auctions`. An `UPGRADES` step renames it in a saved `story.codex` and drops `landPurchases`.
- **Power:** a section whose only building is its depot raises no brownout. This M1 minor would otherwise greet every auction winner.
- **Removal:** after this task no code path sells land at a list price. `grep -rn "buySection\|landPrice\|buyable\|landPurchases" src bot e2e` finds nothing.

- [ ] **Step 1: Write the failing tests**

```ts
// e2e/auctions.spec.ts (seed 42, timescale 60)
test('open a lot on a neighbour section, set a proxy of LM 200,000, and own the section when it ends', async ({ page }) => {});
test('a rival lot appears in the Land and auctions list', async ({ page }) => {});
// tests/sim/story/story.test.ts
it('ch1.expansion completes when the player wins an auction', () => {});
it('a saved mech.landOffice entry loads as mech.auctions', () => {});
// tests/sim/build/power.test.ts
it('a section with only its depot raises no brownout', () => {});
```

- [ ] **Step 2: Run them** — `npx vitest run tests/sim/story tests/sim/build/power.test.ts && npx playwright test e2e/auctions.spec.ts` → FAIL.

- [ ] **Step 3: Implement.** Update `e2e/core-loop.spec.ts` step 8: the player opens a lot on a neighbour, sets a proxy of LM 200,000 and waits for 2 sections.

- [ ] **Step 4: Run** `npx vitest run && npm run check && npx playwright test` → PASS.

- [ ] **Step 5: Commit** — `feat: auctions replace the land office`, then push.

---

### Task 17 (C17): The news ticker, the companion and the Codex for finance

**Files:**
- Modify: `src/ui/shell/NewsTicker.tsx`, `src/ui/global.css`, `src/data/codex.ts`, `src/data/companions/veteran.ts`, `src/data/companions/narrator.ts`, `src/sim/story/beats.ts`, `src/sim/story/story.ts`, `src/sim/story/codex.ts`, `src/ui/tabs/codexFacts.ts`
- Test: `tests/data/companions.test.ts`, `tests/sim/story/story.test.ts`, `e2e/news.spec.ts`

**Interfaces:**
- Consumes: C13 `news`, `newsText`.
- Produces: `BeatId` gains `'ev.rivalsIntro' | 'ev.firstClose' | 'ev.ratingCut' | 'ev.rivalStake' | 'ev.auctionLost' | 'ev.playerDefault' | 'ev.rivalBankrupt'`; the Codex gains the entries below.

**Rules:**
- **Ticker** (desktop): the news, newest first, crawls right to left at 60 px/s and pauses on hover or focus. In reduced motion it shows one item at a time and changes every 8 s without movement. Phones read news in the Finance tab (C15).
- **Codex entries** (each body ≤ 80 words; each concept's real-world paragraph ≤ 60 words; Ox's voice):
  - Mechanics: `mech.auctions`, `mech.rivals`, `mech.loans`, `mech.statements`, `mech.monthlyClose`.
  - Concepts: `concept.balanceSheet`, `concept.incomeStatement`, `concept.cashFlow`, `concept.creditRating`, `concept.interest`, `concept.shares`, `concept.dividends`, `concept.dilution`, `concept.buyback`, `concept.priceEarnings`, `concept.englishAuction`, `concept.proxyBid`, `concept.default`, `concept.bankruptcy`.
- **Unlocks** (the player's first contact):

  | First contact | Unlocks |
  |---|---|
  | The first lot opens | `mech.auctions`, `concept.englishAuction` |
  | The first proxy | `concept.proxyBid` |
  | The first loan | `mech.loans`, `concept.interest` |
  | The first close | `mech.statements`, `mech.monthlyClose`, `concept.balanceSheet`, `concept.incomeStatement`, `concept.cashFlow` |
  | The first rating change | `concept.creditRating` |
  | The first share trade | `concept.shares`, `concept.priceEarnings` |
  | The first dividend | `concept.dividends` |
  | The first issue | `concept.dilution` |
  | The first buyback | `concept.buyback` |
  | Any default | `concept.default` |
  | Any bankruptcy | `concept.bankruptcy` |
  | Founding | `mech.rivals` |

- **Event beats** (at most once per 6 game hours each, as in M1). Each has 2–6 veteran lines of at most 220 characters and a narrator line.

  | Beat | Category | Fires on |
  |---|---|---|
  | `ev.rivalsIntro` | economy | The first lot a rival opens |
  | `ev.firstClose` | economy | The player's first `monthClosed` |
  | `ev.ratingCut` | economy | A lower player rating |
  | `ev.rivalStake` | alerts | `stakeDisclosed` in the player's company (spec §10.3) |
  | `ev.auctionLost` | economy | A rival wins a lot the player bid on |
  | `ev.playerDefault` | alerts | The player's `defaulted` |
  | `ev.rivalBankrupt` | economy | Any `bankrupt` |

- [ ] **Step 1: Write failing tests**

```ts
// tests/data/companions.test.ts (the M1 checks cover the new beats once the ids exist)
it('every new codex id exists, bodies ≤ 80 words, real-world paragraphs ≤ 60 words', () => {});
// tests/sim/story/story.test.ts
it('a rival stake of 20% in the player fires ev.rivalStake; a rival stake in another rival fires nothing', () => {});
it('the first close unlocks the statement concepts', () => {});
// e2e/news.spec.ts
test('the desktop ticker shows rival news; reduced motion shows one item without movement', async ({ page }) => {});
```

- [ ] **Step 2: Run them** — `npx vitest run tests/data tests/sim/story && npx playwright test e2e/news.spec.ts` → FAIL.

- [ ] **Step 3: Implement and write the lines and entries.**

- [ ] **Step 4: Run** `npx vitest run && npm run check && npx playwright test` → PASS.

- [ ] **Step 5: Commit** — `feat(story): news ticker, finance Codex and Ox on rivals and money`, then push.

---

### Task 18 (C18): Offline catch-up and the away summary

**Files:**
- Modify: `src/sim/offline.ts`, `src/ui/screens/AwayScreen.tsx`, `src/ui/screens/awayHeadline.ts`
- Test: `tests/sim/offline.test.ts`, `e2e/away.spec.ts`

**Interfaces:**
- Consumes: C2 player-only events, C4 period accounts, C5 interest, C7 auctions.
- Produces: `AwaySummary` gains `netIncomeCents`, `auctionsWon`, `auctionsLost`, `ratingFrom: Rating`, `ratingTo: Rating`, `interestPaidCents` and `news: NewsItem[]` (up to 5, newest first).

**Rules:**
- Markets, rivals, auctions and shares run at full rate during catch-up; only the player's production runs at 50% (C2). Proxy bids bid.
- The summary comes from the player's period accounts and the player's events across the window.
- The away screen adds "Auctions won", "Auctions lost", net income and the rating change. The headline may name an auction win.

- [ ] **Step 1: Write failing tests**

```ts
it('an 8-hour catch-up across an auction end, a month close and loan interest counts each once', () => {
  // timescale 1 → 480 game hours, starting 3 game hours before 2091-04-01 00:00; a player proxy on a lot that
  // ends 2 game hours in; a LM 100,000 BBB loan. Expect: one auctionWon for the lot (the proxy holder),
  // one player monthClosed, interest expense = 100,000 × 0.032 × 480 / 720 LM (±1 cent)
});
it('the away summary reports net income, auctions won and lost, and the rating change', () => {});
// e2e/away.spec.ts: the away screen shows "Auctions won"
```

- [ ] **Step 2: Run them** — `npx vitest run tests/sim/offline.test.ts && npx playwright test e2e/away.spec.ts` → FAIL.

- [ ] **Step 3: Implement**, then `npx vitest run && npm run check && npx playwright test` → PASS.

- [ ] **Step 4: Commit** — `feat: catch-up and the away summary cover auctions, loans and rivals`, then push.

---

### Task 19 (C19): Performance budgets with rivals

**Files:**
- Modify: `tests/perf/sim.perf.test.ts`, `tests/sim/offline.test.ts`, `src/save/serialize.ts`, `src/sim/people/commute.ts` (trip geometry rebuilt on load), `src/client/debugFlags.ts` (`scene=rivalBench`), `src/worker/simHost.ts`, `e2e/budgets.spec.ts`
- Test: `tests/save/save.test.ts`

**Interfaces:**
- Consumes: C12 `makeRivalBenchState`.
- Produces: `DebugFlags.scene` gains `'rivalBench'`. Saved trips drop `points` and `cum`; `deserializeState` rebuilds them from the road network.

**Rules** (on `makeRivalBenchState(1)`):
- The median fine tick over 100 ticks stays under 4 ms (spec §13.5, 10,000 workers in all).
- The slowest tick over one game day stays under 100 ms. That tick runs the hourly systems: clearing, rivals, payroll.
- An 8-hour catch-up takes under 10 s.
- The C13 snapshot budget still holds.
- **Saves:** a round trip keeps the state hash. The rival-bench save is at least 50% smaller than before, and encodes in under 60 ms.
- **Render budgets** (`e2e/budgets.spec.ts`): at bird's-eye over the busiest rival section, `?scene=rivalBench`, draw calls stay under 300 and triangles under 1.5 M.
- Fix a breach at its root, as in M1. Never loosen a budget.

- [ ] **Step 1: Write the failing tests** (the budgets above, plus `it('a save round trip without trip geometry keeps the state hash', …)`).

- [ ] **Step 2: Run them** — `npx vitest run tests/perf tests/save tests/sim/offline.test.ts && npx playwright test e2e/budgets.spec.ts` → FAIL (at least the save size).

- [ ] **Step 3: Implement**, then `npx vitest run && npm run check && npx playwright test` → PASS.

- [ ] **Step 4: Commit** — `perf: rival budgets and lighter saves`, then push.

---

### Task 20 (C20): The economy loop end to end, README and docs

**Files:**
- Create: `e2e/economy-loop.spec.ts`
- Modify: `README.md`, `docs/superpowers/specs/2026-10-27-planetary-mining-operations-design.md` (§2 owner log: the three 2026-11-05 decisions)

**Rules:**
- **The economy loop** (seed 42, timescale 120, `test.slow()`):
  1. Found the company. The ownership legend lists 6 companies.
  2. Open a lot on a neighbour section, set a proxy of LM 200,000, and wait for 2 sections.
  3. Take a 3-month loan of LM 50,000. Cash rises and the loan is listed.
  4. Buy 100 shares of a rival at market. After the next clearing, the holding shows.
  5. Rival news shows: in the ticker on desktop, in Finance on phones.
  6. Reload. The company, the loan, the holding and both sections are back.
- **The month close** (separate test): at timescale 6, `api.advanceRealMs(7_500_000)` runs 750 game hours. The Statements period choice then lists "2091-03".
- **README:** the status line names M2a; the controls table uses keys 1–7; new sections cover the Finance tab, auctions and rivals.

- [ ] **Step 1: Write the failing e2e tests** — run `npx playwright test e2e/economy-loop.spec.ts` → FAIL until all earlier tasks are in, then PASS.

- [ ] **Step 2: Update the README and the spec's owner log.**

- [ ] **Step 3: Run the full suite** — `npm run check && npm run build && npm run size && npm run bot && npm run test:e2e` → all PASS.

- [ ] **Step 4: Commit** — `test: the economy loop end to end; README and owner log`, then push. Confirm the CI and Pages workflows are green.

---

## Verification (end-to-end)

1. **Automated:** `npm run check && npm run build && npm run size && npm run bot && npm run test:e2e` passes locally and in CI (`ci.yml`). `pages.yml` deploys to `https://evikzs.github.io/Planetary-Mining-Operations/`.
2. **Manual, on the owner's phone after the Pages deploy:**
   1. Found the company. Five rival colours show at planetary altitude.
   2. Open an auction on a neighbour, set a proxy and win it. Lose one to a rival, too.
   3. Take a loan; read the statements; buy rival shares.
   4. Close the tab for 10+ minutes. The away screen reports auctions, income and the rating.
   5. On desktop, rival news runs in the ticker; keys 1–7 open the tabs.
3. **Frame rate:** `?scene=rivalBench` on a mid-range phone stays at 60 fps and never drops below 30.

## Execution handoff

**Method:** Native, as chosen for M1 (superpowers:executing-plans, tasks C1 → C20 in order). Each task ends with a commit and a push. After C20, one fresh reviewer on the most capable model reviews the whole branch with this plan's Review Focus and the ledger rulings; one fix pass follows; then superpowers:finishing-a-development-branch. M2b gets its own plan after M2a ships.

