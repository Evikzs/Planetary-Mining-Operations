# Planetary Mining Operations

A desktop game about a mining conglomerate. You start with one section of the Moon. You win rights at auction, complete contracts and trade in a deep, real-world economy. You expand to other planets, other star systems and the galaxy.

- A desktop game for mouse and keyboard. The end goal is a release on Steam.
- All graphics are placeholder. They are redone later.
- Status: the Moon slice (milestone M1), the economy core (M2a) and the desktop conversion (D1) are playable. Five AI rivals share the Moon with you: you bid against them for land, borrow, trade shares and read your books. Next, M2b: research and patents, new needs and skills, haulers, and road and belt editing.

## Play

**Desktop app:** build it from this repository (see Develop): `npm run app` starts it, and `npm run package` makes an app folder for your system in `release/`.

**Playtest in a browser:** **https://evikzs.github.io/Planetary-Mining-Operations/**

The game needs WebGL 2 and a window of at least 1280 × 720. In a browser, use the latest desktop Chrome, Edge or Firefox. The desktop app keeps its saves as files in its user-data folder; the browser keeps them in the browser. The game saves itself every 30 seconds, after each action and when you close it. Settings has five save slots and an export code that moves a game between the app, a browser and another computer.

## Time

- At 1×, a game hour takes a real minute. Pause and pick 1×, 2×, 4× or 8× beside the date in the top bar.
- You can give orders while the game is paused.
- A saved game opens paused.
- "Run the world while closed" (Settings) lets a game that was running when you closed it catch up when you return: up to 8 game hours, with your own work at half rate.

## Controls

| Action                                  | Mouse and keys                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| Pause or resume                         | `Space`, or the Pause button                                                          |
| Speed 1×, 2×, 4×, 8×                    | `1` to `4`, or the speed buttons                                                      |
| Pan                                     | Left-drag, or `W` `A` `S` `D`                                                         |
| Turn                                    | Right-drag, or `Q` and `E`                                                            |
| Zoom                                    | Mouse wheel, or `+` and `-`                                                           |
| Lock north                              | `N`, or click the compass                                                             |
| Select a plot, building, bus or section | Click it                                                                              |
| Let go of the selection                 | Right-click the map                                                                   |
| Open a tab                              | `B` Build, `P` People, `T` Trade, `F` Finance, `C` Contracts, `K` Codex, `O` Settings |
| Close a panel                           | `Esc`, or the close button                                                            |

Hover over a control to see what it does and its key. Settings lists every key, and "Interface size" scales the interface from 80% to 150%.

## Rivals

Five rival companies mine, refine, trade, bid and borrow under the same rules as you. Each has its own temper: some dig carefully, some borrow hard, one buys shares in the others. The ownership map and its legend show who holds which section. A rival that cannot pay its debts goes bankrupt. Its sections go to auction, and a new company takes its place two game days later. Their news runs along the bottom of the screen and in the Finance tab.

## Auctions

New land is sold at auction, in the Build tab under "Land and auctions".

- Select an unowned section and open a lot for LM 2,000. The Lunar Authority also opens one every 12 game hours.
- Bids start at the LM 30,000 reserve. A bid counts for its amount times a reputation bonus.
- A lot runs 3 game hours. A bid in the last 30 game minutes adds 30 more, up to 10 game hours.
- Set "Bid for me up to" and the game bids the minimum for you, up to that ceiling, also while you are away.
- The winner pays at the close, from cash or the credit line.

## Finance

The Finance tab (`F`) holds the company's money.

- **Statements:** the income statement, the balance sheet and the cash flow for this month, and for each month that has closed. The books close at the end of each game month.
- **Ratios and rating:** lenders grade the company from AAA to D at each close. The grade sets the loan rate and the credit line.
- **Loans and credit:** loans of 3, 6 or 12 months, and a credit line to draw and repay at any time.
- **Shares:** your company is listed. Set a dividend, issue up to 20% more shares a month, or buy shares back. Buy and sell rivals' shares; a holder of 20% or more is named in the news.

## Develop

You need Node 22.12 or later.

| Command            | What it does                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm install`      | Installs the pinned dependency versions, Electron included.                                                                           |
| `npm run dev`      | Runs the game in a browser at http://localhost:5173 and reloads on change.                                                            |
| `npm run app`      | Builds the game and starts the desktop app.                                                                                           |
| `npm run package`  | Builds an unpacked desktop app folder for this system in `release/`.                                                                  |
| `npm run check`    | Typecheck, lint and the unit tests.                                                                                                   |
| `npm run test:e2e` | Playwright tests in two desktop windows, 1920 × 1080 and 1280 × 720. Install the browser once with `npx playwright install chromium`. |
| `npm run test:app` | The desktop app's smoke test. On Linux without a display, run it under `xvfb-run -a`.                                                 |
| `npm run bot`      | The balance bot plays the first 60 game days and checks the pacing targets.                                                           |
| `npm run build`    | The production web build in `dist/`. `npm run size` then checks the JavaScript budget.                                                |

To work on the desktop app with hot reload, run `npm run dev` in one terminal and this in another:

```bash
PMO_DEV_URL=http://localhost:5173 npx electron .
```

Development builds read these URL flags: `?seed=42`, `?timescale=60` (1 to 600), `?freeze=1` (start paused), `?scene=demo`, `?scene=bench` or `?scene=rivalBench` (six companies and 10,000 workers), and `?nowebgl=1`.

## Documentation

- [Game design specification](docs/superpowers/specs/2026-10-27-planetary-mining-operations-design.md)
- [D1 design: the desktop conversion](docs/superpowers/specs/2026-11-12-d1-desktop-conversion-design.md), its [plan](docs/superpowers/plans/2026-11-12-d1-desktop-conversion.md) and [handover](docs/superpowers/plans/2026-11-12-d1-handover.md)
- [M2b design: research, people and logistics](docs/superpowers/specs/2026-11-12-m2b-research-people-logistics-design.md)
- [M0–M1 implementation plan](docs/superpowers/plans/2026-10-27-m0-m1-foundations-moon-slice.md)
- [M2a implementation plan](docs/superpowers/plans/2026-11-05-m2a-economy-core.md), with its [handover](docs/superpowers/plans/2026-11-05-m2a-handover.md) and [ledger](docs/superpowers/plans/2026-11-05-m2a-economy-core.ledger.md)
