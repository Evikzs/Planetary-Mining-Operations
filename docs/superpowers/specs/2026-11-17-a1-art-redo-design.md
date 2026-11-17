# A1 design: the art redo, in Fable's design language

- **Status:** owner request on 2026-11-17: "include Fable's design, redo the old code to fit it, make what is missing in the same language, and continue the design." The owner gave the go-ahead to build. The calls below are the builder's, for the owner to check.
- **Source:** Fable's design shell, kept unchanged on the branch `design/fable-shell` (from `Evikzs/Stellar-Miner`, folder `design-shell/`).
- **Parent:** [the game design specification](2026-10-27-planetary-mining-operations-design.md). This redo replaces section 9.6 (the retro-futurist poster) and ends the "graphics are placeholder" rule of the [D1 design](2026-11-12-d1-desktop-conversion-design.md), section 5. It pulls the art redo forward from M7.

## 1. Intent

The game plays well and looks like a placeholder. Fable's shell shows the look the owner wants: one dark scene with real light, from orbit down to the street, and a quiet HUD that reads like notes on a survey sheet. The game takes that look. The simulation, the rules, the tabs and the tests do not change, except where a test pins the old look.

### Goals

- Every screen, panel and control uses Fable's tokens, fonts and layout rules.
- The 3D view uses Fable's light model: a sun that moves with the game clock, a sky of stars and dust, tone mapping, bloom and shadows. Night is dark, and the things people built light it.
- Every building, vehicle, worker, belt, road and plot marker is rebuilt in Fable's kit style, with lights that come on at night.
- Fable's own HUD parts come in where the game has a match: the place and ledger, the sun-dial clock, the specimen sheet, the shift log, the borehole depth gauge, scene labels and the selection reticle.

### Non-goals

- No change to the simulation, the save format or the balance.
- No new gameplay. A view that shows more (street level, the Sol system) is presentation only.
- No audio.

### Anti-goals (a failure even if it works)

- Ore colours on ordinary UI. An ore colour marks a find only: deposits, seams, ore on belts, the gem of a raw good.
- A scene too dark to play. Night needs enough ambient light and lamp light to read the layout.
- A frame rate under the budget (section 13.5 of the parent spec) on a 2020 laptop.

## 2. Approaches

1. **Re-skin the game in Fable's language, reusing Fable's code inside the game's renderer and UI.** (Chosen.) The game keeps its streamed terrain, its layers and its Preact HUD. Fable's shaders, sky, kit, light model and HUD parts move in as TypeScript modules and replace the poster look piece by piece.
2. **Replace the game's renderer with Fable's shell and feed it game data.** Rejected: the shell's town is one fixed street plan with no simulation behind it, while the game's plots, roads, belts and trips come from the simulation. Most of the shell would be rewritten anyway.
3. **Keep the poster renderer and restyle the HUD only.** Rejected: the owner asked for the whole look, and most of the gain is in the 3D view.

## 3. Decisions (the builder's calls)

### 3.1 Scale

- One world unit is 40 m. The Moon (radius 100) is 4 km in Fable's units, close to Fable's worlds (3.4 to 6.2 km). A bus (0.22 units) is 8.8 m; Fable's bus is 9 m.
- Kit models are built in metres, as in Fable's shell, and scaled by 1/40 when placed. A model stays inside the plot footprint (radius 0.45 units, 18 m).

### 3.2 Light and time of day

- The sun turns with the game clock. One lunar day is one game day (24 game hours, 24 real minutes at 1×). Scale is tuned for play (parent spec, non-goals).
- The sun stands over the equator (tilt 0). The local solar time at the player's charter hub equals the clock time. Before founding, the reference is longitude 0. The reference moves smoothly at founding.
- Near the south pole, where charters are, the sun stays low: long shadows by day, a dark sky with stars at noon (the Moon has no air).
- Light: a directional sun with soft shadows around the camera target, a hemisphere light for the ambient, and Fable's exposure lift at night near the ground.
- Night factor per building: from its own position and the sun, so each settlement lights up at its own dusk.

### 3.3 Post-processing and quality

- Fable's chain: render, bloom (UnrealBloom), output, with neutral tone mapping. The poster pass, the paper grain and the toon bands go.
- A **Graphics** setting: High (bloom, 4× MSAA, shadows, pixel ratio up to 2) and Low (no bloom, no shadows, pixel ratio 1). Default High. A software renderer (SwiftShader) starts on Low, so CI and old machines stay usable. Dev flag `?graphics=high|low`.

### 3.4 Terrain

- The streamed chunks stay. Their material becomes Fable's surface model: the class colours (highland, maria, crater floor, rim, polar frost) in a new lunar palette, fine grain that fades with distance, mineral glitter near the sun's reflection, and thin glinting seams in Luna's ore colour.
- Luna's ore colour is KREEP rose, Fable's signature rose. Each raw good has its own mineral colour for its deposits and its gem (section 3.6).

### 3.5 The colony kit

- Fable's kit: low-poly parts with vertex paint, a glow colour per vertex and a window id. Glow is faint by day and full at night; windows light at random, more in the evening.
- All 19 building types, the 4 client assets, the scaffold and the crane are rebuilt in this kit, each in Fable's style and palette, with a role line for the specimen sheet.
- Buses: Fable's bus (lit windows, headlights, tail lights, a pool of light ahead at night). Workers: Fable's walkers with swinging limbs, the suit colour by skill.
- Belts: Fable's raised conveyor on pylons. Raw goods ride as rock lumps; ore lumps glow in the good's mineral colour. Refined goods ride as slabs, components as crates.
- Roads: dark asphalt with street lamps and pools of light at night.
- Red beacons blink on tall structures. From orbit at night, the settlements show as clusters of light.
- Free plots: survey corner marks in brass. Deposits show a crystal seam in the mineral colour.

### 3.6 Minerals (Luna)

| Good | Mineral | Colour |
|---|---|---|
| Lunar regolith | Regolith, glass and dust | `#b9ae9c` |
| Ilmenite | FeTiO₃ | `#7d93c7` |
| Anorthite | CaAl₂Si₂O₈ | `#e6dcf0` |
| Helium-3 | ³He, held in the dust | `#b48cf0` |
| KREEP ore | K, REE, P | `#e4688e` |
| Polar volatiles | H₂O ice and more | `#6fd3e8` |

### 3.7 HUD

- Tokens are Fable's: pit, slate, chalk, dust, lamp, brass, verdant, hazard, and `--ore` for finds. Fonts: Besley (names and titles) and Barlow (all other text, tabular figures), self-hosted with Fontsource so the app works offline. IBM Plex and Jost go.
- Company map colours keep their ids (they are in saves) and get new liveries that read on the dark Moon.
- **Top bar:** Fable's place block (crumbs and the company name), Fable's ledger (cash, pinned goods with the gem on raw goods, workforce, power, reputation), and Fable's clock (sun dial at the place in view, the date, Pause and 1× to 8×). The clock stays in the top bar: the D1 layout and its tests need it there, and the bottom centre is too narrow at 1280 × 720 with both panels open.
- **Context panel:** Fable's specimen sheet. A deposit shows its mineral specimen. A building shows its role line.
- **News:** Fable's shift log, bottom right: the three newest lines, the newest brightest. Replaces the crawl ticker.
- **Companion:** a portrait in a brass ring and his line as a note (Fable's italic note with a brass rule).
- **Depth gauge:** Fable's borehole log on the left, beside the rail (beside the tab panel when one is open). One layer for each view tier. A click flies to that tier.
- **Labels and reticle:** settlement names from orbit, a tag on hover, corner marks around the selection.
- The style rule against `backdrop-filter` goes: Fable's sheet and gauge use a light blur. The tab panel stays opaque.

### 3.8 Camera tiers

- Tiers: System, Orbit, Region, Town, Street, as in Fable's gauge. Orbit is altitude 60 and up, Region 15 to 60, Town 1.5 to 15, Street below 1.5.
- Street level: the lowest altitude is 0.25 (10 m). Below bird's-eye altitude (1.5) the camera tilts on from 55° to 80°, towards the horizon, and keeps 2 m over the ground.
- System: a view of Sol with Fable's bodies (the Sun, eight planets with air and rings, Earth with Luna). Presentation only, before M3's Solar map. A push past high orbit (held for a moment), the Sol crumb or the gauge's System tier rises to it along Fable's log-distance flight; a click reads a world on the specimen sheet; Luna leads back down. Luna turns so the side lit in the Moon view faces the Sun.

### 3.9 As built (notes from the build)

- **Low graphics** draws plain class colours on the ground, no bloom, no shadows and no blur behind the sheets: in software rendering the ground's per-pixel noise cost whole seconds a frame. With that, Low runs about as fast as the poster renderer did.
- The light, belt and plot layers rebuild only when their inputs change: the world view is resent on every structural change.
- The clock stays in the top bar (section 3.7). Below 1680 px of bar the sun dial hides; below 1100 px the goods and rates hide. The crumbs always show: they sit above the company name and take no width of their own.
- Ownership washes are faint (12%): at night a strong wash drowned the lamps.

## 4. Constraints

- Budgets of the parent spec, section 13.5: under 300 draw calls and 3 M triangles at bird's-eye (the e2e budget test uses 1.5 M), 60 fps target, initial JavaScript under 1.5 MiB gzip.
- WebGL 2. Electron's Chromium and the latest desktop browsers.
- Reduced motion: no twinkle, no blinking beacons, no limb swing, no log animation.
- Accessibility: text contrast at least 4.5:1 for body text on the HUD surfaces (unit test).

## 5. Tests

- Unit tests change where they pin the old look: tokens and contrast, materials, models (palette, footprint, triangles), sky, the paper texture (removed), the style rules.
- New unit tests: sun direction and local time, kit attributes, mineral data.
- e2e: the news test follows the shift log. Other e2e tests keep their selectors (`top-bar`, `tab-panel`, `context-panel`, `tab-rail`, `news-ticker`, the button names).

## 6. Order of work

1. Tokens, fonts, minerals, copy. (Done.)
2. The HUD: stylesheet and components. (Done.)
3. The renderer: sun, sky, post-processing and quality, terrain. (Done.)
4. The kit: models, layers, night lights, overlays. (Done.)
5. Gauge, street level, labels, reticle. (Done.)
6. The Sol view. (Done.)
7. Docs (parent spec 9.6, README), checks, push. (Done.)
