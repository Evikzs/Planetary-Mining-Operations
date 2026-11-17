# Planetary Mining Operations

A browser game about a mining conglomerate. You start with one section of the Moon. You win rights at auction, complete contracts and trade in a deep, real-world economy. You expand to other planets, other star systems and the galaxy.

- A desktop game (an Electron app, with this web build as the playtest link). Mouse and keyboard.
- Runs without a server.
- Status: the Moon slice (milestone M1) and the economy core (milestone M2a) are playable. Five AI rivals share the Moon with you: you bid against them for land, borrow, trade shares and read your books. Next, M2b: research and patents, new needs and skills, haulers and road editing.
- The look (A1): Fable's design language. A sun that follows the game clock, so settlements light up at dusk; one low-poly kit for every building, bus and worker; a quiet HUD of survey notes. The [design shell](https://github.com/Evikzs/Planetary-Mining-Operations/tree/design/fable-shell) is the reference.

## Play

**https://evikzs.github.io/Planetary-Mining-Operations/**

The game needs WebGL 2: the latest Chrome, Edge or Firefox, or Safari 16 and later. It saves itself every 30 seconds and after each action. Settings has five save slots and an export code that moves a game to another device. Settings also has Graphics: Auto, High (glow, soft shadows, smoother edges) and Low. Auto picks Low when the browser draws without a graphics card.

## Controls

| Action                                  | Keys and mouse                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| Pan                                     | Drag, or `W` `A` `S` `D`                                                              |
| Zoom                                    | Mouse wheel, or `+` and `-`; down to street level                                     |
| Turn                                    | Right-drag, or `Q` and `E`                                                            |
| Lock north                              | `N`, or click the compass                                                             |
| Change the view                         | The depth gauge on the left: System, Orbit, Region, Town, Street                      |
| The view of Sol                         | Keep zooming out past high orbit, or click Sol at the top left                        |
| Select a plot, building, bus or section | Click it; a world in the view of Sol too                                              |
| Pause, speed                            | `Space`; `1` to `4` for 1×, 2×, 4×, 8×                                                |
| Open a tab                              | `B` Build, `P` People, `T` Trade, `F` Finance, `C` Contracts, `K` Codex, `O` Settings |
| Close a panel, cancel                   | `Esc`, or right-click                                                                 |

## Rivals

Five rival companies mine, refine, trade, bid and borrow under the same rules as you. Each has its own temper: some dig carefully, some borrow hard, one buys shares in the others. The ownership map and its legend show who holds which section. A rival that cannot pay its debts goes bankrupt. Its sections go to auction, and a new company takes its place two game days later. Their news shows in the shift log at the bottom right.

## Auctions

New land is sold at auction, in the Build tab under "Land and auctions".

- Select an unowned section and open a lot for LM 2,000. The Lunar Authority also opens one every 12 game hours.
- Bids start at the LM 30,000 reserve. A bid counts for its amount times a reputation bonus.
- A lot runs 3 real minutes. A bid in the last 30 seconds adds 30 more, up to 10 minutes.
- Set "Bid for me up to" and the game bids the minimum for you, up to that ceiling, also while you are away.
- The winner pays at the close, from cash or the credit line.

## Finance

The Finance tab (`4` on desktop, under More on phones) holds the company's money.

- **Statements:** the income statement, the balance sheet and the cash flow for this month, and for each month that has closed. The books close at the end of each game month.
- **Ratios and rating:** lenders grade the company from AAA to D at each close. The grade sets the loan rate and the credit line.
- **Loans and credit:** loans of 3, 6 or 12 months, and a credit line to draw and repay at any time.
- **Shares:** your company is listed. Set a dividend, issue up to 20% more shares a month, or buy shares back. Buy and sell rivals' shares; a holder of 20% or more is named in the news.

## Develop

You need Node 22.12 or later.

| Command            | What it does                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `npm install`      | Installs the pinned dependency versions.                                                                             |
| `npm run dev`      | Runs the game at http://localhost:5173 and reloads on change.                                                        |
| `npm run check`    | Typecheck, lint and the unit tests.                                                                                  |
| `npm run test:e2e` | Playwright tests on a phone and a desktop viewport. Install the browser once with `npx playwright install chromium`. |
| `npm run bot`      | The balance bot plays one real day and checks the pacing targets.                                                    |
| `npm run build`    | The production build in `dist/`. `npm run size` then checks the JavaScript budget.                                   |

Development builds read these URL flags: `?seed=42`, `?timescale=60` (1 to 600), `?freeze=1`, `?scene=demo`, `?scene=bench` or `?scene=rivalBench` (six companies and 10,000 workers), `?graphics=high` or `?graphics=low`, and `?nowebgl=1`.

## Documentation

- [Game design specification](docs/superpowers/specs/2026-10-27-planetary-mining-operations-design.md)
- [A1 design: the art redo](docs/superpowers/specs/2026-11-17-a1-art-redo-design.md)
- [M0–M1 implementation plan](docs/superpowers/plans/2026-10-27-m0-m1-foundations-moon-slice.md)
- [M2a implementation plan](docs/superpowers/plans/2026-11-05-m2a-economy-core.md), with its [handover](docs/superpowers/plans/2026-11-05-m2a-handover.md) and [ledger](docs/superpowers/plans/2026-11-05-m2a-economy-core.ledger.md)
