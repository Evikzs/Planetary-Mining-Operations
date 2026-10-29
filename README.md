# Planetary Mining Operations

A browser game about a mining conglomerate. You start with one section of the Moon. You win rights at auction, complete contracts and trade in a deep, real-world economy. You expand to other planets, other star systems and the galaxy.

- Mobile first, with a full desktop version.
- Runs in the browser. No server.
- Status: the Moon slice (milestone M1) is playable. Build mines and refineries, sell on the Lunar market, take contracts and buy land.

## Play

**https://evikzs.github.io/Planetary-Mining-Operations/**

The game needs WebGL 2: the latest Chrome, Edge or Firefox, or Safari 16 and later. It saves itself in your browser every 30 seconds and after each action. Settings has five save slots and an export code that moves a game to another device.

## Controls

| Action                                  | Desktop                                                                  | Phone                                              |
| --------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------- |
| Pan                                     | Drag, or `W` `A` `S` `D`                                                 | Drag with one finger                               |
| Zoom                                    | Mouse wheel, or `+` and `-`                                              | Pinch                                              |
| Turn                                    | `Q` and `E`                                                              | Twist with two fingers                             |
| Lock north                              | `N`, or click the compass                                                | Tap the compass                                    |
| Select a plot, building, bus or section | Click it                                                                 | Tap it                                             |
| Open a tab                              | `1` Build, `2` People, `3` Trade, `4` Contracts, `5` Codex, `6` Settings | The bottom tabs; Codex and Settings are under More |
| Close a panel                           | `Esc`                                                                    | The close button, or swipe the sheet down          |

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

Development builds read these URL flags: `?seed=42`, `?timescale=60` (1 to 600), `?freeze=1`, `?scene=demo` or `?scene=bench`, and `?nowebgl=1`.

## Documentation

- [Game design specification](docs/superpowers/specs/2026-10-27-planetary-mining-operations-design.md)
- [M0–M1 implementation plan](docs/superpowers/plans/2026-10-27-m0-m1-foundations-moon-slice.md)
