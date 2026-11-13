# Stellar Miner design shell

The look of the game, as code. One 3D scene that goes from the star system down to one person on a street, with a day and night cycle, and a HUD on top. No game rules are in here. `src/demo.js` is a stand-in for the game and is the only file to replace.

## Run it

```bash
npm install
```

```bash
npm start
```

Then open `http://localhost:5173`. There is no build step: `index.html` loads the ES modules through an import map. With a bundler, import `createShell` from `src/shell.js` and include `src/hud.css`. The only dependency is `three`.

The HUD uses two Google fonts, Besley (names) and Barlow (all other text). `index.html` loads them. Without them the fallback fonts apply.

## Controls

| Input | Result |
| --- | --- |
| Scroll, pinch | Zoom. On a world in the system view: fly to it. Scroll out past orbit: back to the system. |
| Drag | Turn the system, or move across the ground. |
| Right-drag, Shift-drag | Turn and tilt (look up at the sky). |
| Click | Select a world, building, vehicle, person or ore seam. Double-click a world to fly to it. |
| Arrow keys / WASD, Q E, + − | Move, turn, zoom. |
| Space, 1 to 4, Esc | Pause, speed, go up one level. |
| Drag the sun dial | Change the time of day. |

## Plumbing

```js
import { createShell } from './src/shell.js';

const shell = createShell(document.getElementById('game'), { system: mySystem, bloom: true });

shell.on('select', (hit) => {});   // hit: { kind, planet, item, type, index } or null
shell.on('focus', (planetId) => {}); // the world in view changed (null = system view)
shell.on('tier', (tier) => {});    // 'system' | 'orbit' | 'region' | 'town' | 'street'
shell.on('action', ({ id, selection }) => {}); // a button on the selection sheet

shell.goTo({ planet: 'gossan', tier: 'town' });
shell.setSpeed(4); shell.setPaused(true); shell.setLocalHour(21.5);
shell.state; // { time, speed, paused, tier, planet, distance, localHour, flying }

shell.hud.setLedger([{ id: 'ore', label: 'Ore', value: '12,480', unit: 't', rate: '+86 each hour' }]);
shell.hud.log('New rose seam open on bench three.', 'find');
shell.dispose();
```

The data contract is the object in `src/system.js` (star, worlds, air, ore, town). Replace it with real data and pass it as `system`. Units are in the comment at the top of that file.

`hit.kind` is one of `planet`, `building`, `citizen`, `bus`, `truck`, `deposit`. The text on the selection sheet comes from `describe()` in `src/colony.js`: this is the place to put real numbers.

## Files

| File | What it holds |
| --- | --- |
| `src/shell.js` | `createShell`: renderer, frame loop, lights, picking, link between scene and HUD. |
| `src/rig.js` | The camera: one model for all zoom levels, flights between worlds, pointer and touch input. |
| `src/sky.js` | Dust band, stars, and the daytime sky that hides the stars. |
| `src/bodies.js` | Star, worlds (procedural shader), air, rings, orbits. |
| `src/colony.js` | The town: ground, pit, buildings, belts, buses, trucks, people, ore seams, night lights. |
| `src/hud.js`, `src/hud.css` | The HUD as plain DOM. All colours and fonts are CSS variables on `.sm-root`. |
| `src/theme.js` | Scene colours: UI ink, minerals, building paint and light. |
| `src/glsl.js` | Shared shader code (noise, ground colour, sky veil). |
| `src/system.js`, `src/demo.js` | Demo data and a fake game loop. |

## Design rules

- Mostly dark. Three kinds of light: amber for what people built, green for what keeps them alive, and the ore colour of the world for what they came to find.
- An ore colour is for finds only (veins, seams, ore on the belts, the ledger gem). Do not use it for ordinary UI.
- Stars by day depend on the air: `atmosphere.density` at or above about 0.74 hides them, less than that lets some through, `atmosphere: null` shows them all day.
- The zoom gauge is a borehole log: one rock layer for each scale of the view.

## Limits

- Each town uses the same street plan (only the seed, the size of the crowd and the world change). The plan is in `buildColony()`.
- A world has one detailed town. `outposts` are lights on the globe only.
- The camera does not collide with buildings.
- People and vehicles follow fixed paths. There is no simulation.
