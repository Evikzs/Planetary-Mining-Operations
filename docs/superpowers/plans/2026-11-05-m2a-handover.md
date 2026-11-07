# M2a handover (2026-11-07)

This note lets a new session continue the M2a plan without the earlier conversation. Read it first, then the plan.

- Plan: [2026-11-05-m2a-economy-core.md](2026-11-05-m2a-economy-core.md). 20 tasks, headings "Task N (CN)". The task scripts need that form.
- Spec: [../specs/2026-10-27-planetary-mining-operations-design.md](../specs/2026-10-27-planetary-mining-operations-design.md).
- Ledger: [2026-11-05-m2a-economy-core.ledger.md](2026-11-05-m2a-economy-core.ledger.md). It has a completion line per task and every ruling (82 so far).

## Where things stand

Tasks 1–15 are done, verified and pushed to `claude/vibrant-goodall-teqhde`.

| Task | What | Commit |
|---|---|---|
| 1 (C1) | Companies, command actors, save version 3 | `347a7d3` |
| 2 (C2) | Every system per company; the player sees only its own events | `f95398b` |
| 3 (C3) | Double-entry books, exact accounting invariant | `f2f98c1` |
| 4 (C4) | Statements, ratios, monthly close | `c5d137a` |
| 5 (C5) | Loans, credit line, rating, default | `5e170dc` |
| 6 (C6) | Listed shares, NPC investors, issues, buybacks, dividends | `641d08f` |
| 7 (C7) | Section auctions, proxies, soft close | `3b843d7` |
| 8 (C8) | Five rival companies with full workforces | `8973095` |
| 9 (C9) | Rival AI: operations | `78c3d2b` |
| 10 (C10) | Rival AI: bids, loans, shares, dividends | `39329ae` |
| 11 (C11) | Seizure, rival bankruptcy, replacement rivals | `36b361c` |
| 12 (C12) | The bot beside rivals; tight-money balance | `46b790e` |
| 13 (C13) | Views, snapshot and news | `c00080b` |
| 14 (C14) | Company colours, lot outlines, ownership legend | `b1aadc7` |
| 15 (C15) | Finance tab | `55387c8` |

Last full run, on `55387c8`:

- `npm run check`: 418 tests pass.
- `npm run bot`: passes. Seed 42, one real day: equity 4.04 times founding, 4 sections, 3 lots won against rivals, 115 contracts, all 5 rivals trading at 0.88–2.33 times.
- `npx playwright test`: 78 passed, 2 skipped by design.

Still to do:

1. Task 16 (C16): the auctions UI. The land office goes.
2. Task 17 (C17): the news ticker, the companion and the Codex for finance.
3. Task 18 (C18): offline catch-up and the away summary.
4. Task 19 (C19): performance budgets with rivals.
5. Task 20 (C20): the economy loop end to end, and the README. The spec's owner log already has the 2026-11-05 decisions.
6. The final whole-branch review, one fix pass, then finishing the branch.

## How to resume

1. Work in `/home/user/Planetary-Mining-Operations` on `claude/vibrant-goodall-teqhde`. Run `npm ci` if `node_modules` is missing.
2. Restore the ledger. Its workspace folder is git-ignored, and the task scripts read and append it there:

   ```bash
   mkdir -p .superpowers/sdd/2026-11-05-m2a-economy-core
   cp docs/superpowers/plans/2026-11-05-m2a-economy-core.ledger.md \
     .superpowers/sdd/2026-11-05-m2a-economy-core/progress.md
   ```

3. Load `superpowers:executing-plans` (Native: you implement each task yourself) and `superpowers:test-driven-development`.
4. For each task:
   1. Run `task-start docs/superpowers/plans/2026-11-05-m2a-economy-core.md N`. It prints the brief and the BASE commit. Read the brief.
   2. Write the brief's tests first and watch them fail. Then implement.
   3. Run `npm run check`, then `npm run bot`, then `npx playwright test`. The e2e suite takes about 7.5 minutes; run it in the background.
   4. Commit with the plan's message and the attribution lines your session gives. Push with `git push -u origin claude/vibrant-goodall-teqhde`; on a network error, retry after 2, 4, 8 and 16 s.
   5. Run `task-done docs/superpowers/plans/2026-11-05-m2a-economy-core.md N <BASE> -- npx vitest run`, then append the task's `Task N: Ruling: …` lines to the ledger.
   6. The scripts are in the `executing-plans` skill folder under `scripts/`.
5. Before a session ends, copy the workspace ledger back over the committed copy and commit it.
6. After Task 20, follow the skill's final review:
   1. A fresh reviewer on the most capable model gets the plan's Review Focus and the ledger's rulings.
   2. One fix pass, each fix test-first.
   3. Delete the workspace, then use `superpowers:finishing-a-development-branch`.
   4. The final message lists every `Ruling:` line under "Rulings I made" and every deferred minor under "Deferred minors".

## Owner rules

- Work only in the Planetary-Mining-Operations repository.
- Develop and push on `claude/vibrant-goodall-teqhde` only. Do not open a pull request unless the owner asks.
- Never push red work: every push deploys to GitHub Pages. A stop hook asks to commit untracked files; push only when check, bot and e2e pass.
- No model names or ids in commits, code or pull requests.
- The owner chose: two M2 plans, tight money (3–5 times equity in the bot's first real day), fully simulated rivals, Native execution.
- If plan mode is on when a session resumes, edit only the plan file, then exit plan mode.

## What the remaining tasks must know

- **The land office still exists** (C16 removes it). It lives in:
  - `src/sim/build/landOffice.ts` and `src/ui/components/BuySection.tsx`;
  - `WorldView.buyable`, `UiSnapshot.landPriceCents` and the mustard "buyable" outline in `sectionOverlay.ts`;
  - `state.landPurchases`;
  - step 8 of `e2e/core-loop.spec.ts`;
  - the land office tests in `tests/sim/build/construction.test.ts`;
  - the world-version test in `tests/sim/views.test.ts`.

  Sections now carry `landCents`, which the land office and auction settlement set.
- **Rivals:**
  - Live games found five rivals. Single-company tests use `createGame(seed, { rivals: false })`.
  - The demo and bench scenes stay player-only. Their e2e specs depend on the demo's contract board, and rivals change the random stream.
  - `makeRivalBenchState(seed)` in `bot/scenes.ts` is ready for C19: six companies with five sections each, exactly 10,000 workers.
- **Rival AI rules beyond the plan text** (all ledgered):
  - Rivals consider a public ore offer only after 12 game hours (`OFFER_WAIT_HOURS`). The player gets first look, and the core-loop e2e relies on it.
  - They keep 3 days of wages in cash, buy land from cash only, and repay drawn credit.
  - They place one new proxy per decision, and open lots of their own only once their deposits are built on.
- **Balance (C12):**
  - `MARKET.momentum` 0.1, `MARKET.meanReversion` 0.3.
  - `COLONY.growthPerContract` [4, 12].
  - NPC volumes ×4.
  - Archetype `paybackDays` ×2.

  The bot targets hold on seed 42 only. Any change to the sim can move them, so rerun `npm run bot`.
- **News:** `state.news` keeps the latest 30 public events, and `newsText` in `src/data/copy.ts` words each one. The Finance tab shows news on phones. C17 fills `src/ui/shell/NewsTicker.tsx` for desktop.
- **Finance tab:** keys `1`–`7`. Finance sits under More on phones; the e2e helper `openTab` handles that.

## Open points, not yet acted on

- Open-lot outlines are cream, the colour of the section borders, so they hardly stand out. C16's land and auctions list names the lots.
- At 1024 px with a tab open, the map chip row beside the panel is narrow.
- The balance was tuned on seed 42 only.
- No deferred minors are recorded yet. Everything so far is a ruling in the ledger.
