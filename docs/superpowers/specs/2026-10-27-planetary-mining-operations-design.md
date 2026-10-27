# Planetary Mining Operations — Game Design Specification

- **Date:** 2026-10-27
- **Status:** Draft for owner review
- **Working title:** Planetary Mining Operations
- **Scope of this document:** the whole game. Each milestone in section 13 gets its own implementation plan.

---

## 1. Purpose and pillars

### 1.1 Purpose

This is a personal project. The owner plays it with friends. There is no monetization, no store release and no analytics. The game must still be complete, deep and well made. The only corner we cut is the server: the game runs without one.

### 1.2 Pillars

1. **Everything moves.** Goods ride conveyor belts. Workers ride bus rovers from home to work. Haulers and freighters fly on curves. Seeing the operation work is the main reward.
2. **A genuine economy.** Markets, finance and macro-economics follow real-world mechanics. A player who goes deep learns real economics.
3. **Expansion through contracts.** You grow by winning rights at auction and by completing contracts. You grow from one Moon section to a galactic conglomerate.
4. **A companion, not a manual.** A story character teaches the game, stays with you and becomes the in-game wiki (the Codex).
5. **Short sessions, long arc.** Sessions are 5–15 minutes. A run lasts 1–2 weeks of real time. Each new run starts stronger than the one before.
6. **Crafted, not generic.** A retro-futurist poster style with deliberate motion. Nothing may look like a default template.

### 1.3 Non-goals

- No server, accounts, multiplayer or online leaderboard.
- No monetization, ads or analytics.
- No fast-forward of the world clock.
- No mining on Earth. Earth is a market only.
- No real-scale distances. Scale is tuned for play.

---

## 2. Owner decisions (log)

| Topic | Decision |
|---|---|
| Purpose | Fun for the owner and friends. |
| Platform | Browser. Mobile first, full desktop version. |
| Offline | Offline progress at a reduced rate, capped. |
| Economy | Full simulation, inspired by real life. Hard to master on purpose. |
| Expansion | Auctions against AI rivals for section, planet and system rights. |
| Contracts | 19 types (section 8). Ore delivery and local infrastructure are the most common. Interplanetary development pays the most and always covers the full production cost. |
| Achievements | Yes. |
| Setting | Real Sol first. Beyond Sol, star systems are generated from a seed. |
| Failure | Real game over when a rival takes over the group. |
| Meta | Founder Legacy: permanent perks across runs. |
| Pace | About 1–2 weeks to the first exoplanet. |
| Structure | A group (conglomerate) with one listed subsidiary per body. Subsidiaries inherit group research and patents. |
| Social | No server. Share card image. Save export and import. |
| Rendering | Three.js with a real 3D globe. |
| Main view | Bird's-eye view of the surface. Pan, rotate, lock north, circle the whole planet, procedural loading. |
| Map levels | Bird's-eye, Planetary, Solar, Regional galactic, Galactic. Each with filters. |
| Layout | Desktop: tab rail on the left, resource bar on top (like Europa Universalis / Hearts of Iron). |
| Tutorial | Story-driven. The companion stays after the tutorial and becomes the wiki. |
| Companions | The player picks one of 4 (section 10). |
| Goods | 105 goods. Each body has specialties. FTL drives need compounds from specific bodies. |
| Voyage mode | FTL-style ship cut-away. Operating parameters. 10% event chance per leg. Real-time combat with pause. Autopilot gives no opportunities. |
| People | A full residential and workforce system. About 10,000 individual employees at end-game. |
| Look | Retro-futurist 1970s space-agency poster. |

---

## 3. Time and pacing

### 3.1 Game clock

- 1 game hour = 1 real minute while the game is open.
- 1 game day = 24 real minutes. 1 game month (30 game days) = 12 real hours. 1 game year ≈ 6 real days.
- The world clock never pauses and never speeds up. Only voyage combat has a tactical pause (section 9.5).
- A work day has 3 shifts. A shift change happens every 8 real minutes. A typical commute takes about 30 real seconds on screen, so most sessions show at least one rush hour.
- This scale is chosen for the motion pillar: things on the surface move at a speed the eye can follow.

### 3.2 Simulation tick

- **Online tick:** 1 game minute (1 real second). People, production and logistics update each tick. Markets clear once per game hour (every real minute).
- **Coarse tick:** 1 game hour. Used for offline catch-up and by the balance bot. People are processed as cohorts. Commutes are summarised.
- The renderer does not wait for ticks. Moving things (rovers, crates, ships) have a schedule: start time, path and speed. The renderer computes their position from the current time.

### 3.3 Pacing targets (first run)

| Real day | Target |
|---|---|
| Day 1 | 2–4 Moon sections. First refinery. First rival auction won. |
| Day 2–3 | Mars subsidiary founded. |
| Day 4–6 | Presence in the Belt and the Jovian moons. |
| Day 7–10 | First exoplanet colony (Regional tier). |

Later runs reach each target sooner because of Founder Legacy perks. The balance bot (section 14.3) checks these targets.

---

## 4. Core loop and progression

### 4.1 Core loop

Survey → bid for rights → build on plots → extract → move goods → refine and assemble → sell on the market or complete contracts → earn cash and reputation → research and patents → bid for bigger rights.

### 4.2 Session loop (5–15 minutes)

1. Read the "While you were away" page.
2. Check the contract board. Accept, deliver or renew contracts.
3. Check prices, orders and positions.
4. Bid in open auctions.
5. Queue construction and research. Adjust workforce assignments.
6. Optionally fly a voyage live.

### 4.3 Expansion tiers

| Tier | Scope | Unlocked by |
|---|---|---|
| 1 Section | One Moon section from the founding charter. More sections on the same body. | Start of the game. Section auctions. |
| 2 Planet | A body becomes a listed subsidiary with its own market presence. | Group reputation level and a planet charter auction. |
| 3 Solar | Moon → Mars → Belt (Ceres, Vesta, Psyche) → Jovian moons → Titan and Enceladus. Mercury and Venus aerostats are side branches. | Interplanetary drive units (chemical, then nuclear thermal). |
| 4 Regional | About 20 real nearby stars (Proxima Centauri, Barnard's Star, and others). Their planets are generated from the run seed. | FTL-1 Alcubierre ring. Needs stabilised metallic hydrogen from Jupiter. |
| 5 Galactic | Generated galactic sectors. | FTL-3 gate network. Needs exotic matter. |

FTL drives open space in three steps:

1. **FTL-1 Alcubierre ring** needs stabilised metallic hydrogen (Jupiter). It opens the near Regional stars.
2. **FTL-2 jump coil** needs superheavy alloy. Superheavy isotopes exist only on near Regional exoplanets. It opens the deep Regional stars.
3. **FTL-3 gate network** needs exotic matter. Exotic crystals exist only on deep Regional exoplanets. It opens the Galactic tier.

Each drive needs a compound found only in the space the previous drive opened. Expansion is therefore never optional.

### 4.4 Sections and plots

- Each body is divided into 40–120 **sections**. Sections are spherical Voronoi regions generated from the seed. Section count scales with body size.
- Sections are the unit of ownership. You win them at auction.
- Each section has fixed **plots**:
  - **Deposit plots** sit on resource deposits. Only extraction buildings go there.
  - **Build plots** take every other building.
- You build by tapping a plot. Free placement on the sphere is not used. This keeps building precise on touch screens.
- Roads and conveyor belts connect plots. They are routed automatically (section 9.3). The player can add, remove and re-route them.

### 4.5 Buildings

All buildings have upgrade levels 1–10. Full list in Appendix B.

- **Extraction:** mine, ice drill, regolith scoop, He-3 harvester, atmospheric scoop, deep-atmosphere platform (Jupiter), cryo-drill (outer moons).
- **Power:** solar array, fission plant, fusion reactor.
- **Processing:** smelter, electrolysis plant, wafer fab, chemical refinery, assembly works, hydroponics farm, water plant, air plant.
- **Logistics:** depot, warehouse, conveyor hub, rover garage, mass driver, spaceport, shipyard.
- **People:** crew quarters, habitat dome, arcology, clinic, recreation centre, training centre.
- **Other:** research lab, patent lab, security post, comm relay.

**Power** and **workforce** limit each section. A building without power or staff stops.

### 4.6 Logistics

- **Inside a section:** conveyor belts between plots.
- **Between sections on one body:** hauler rovers on roads, or hauler drones on great-circle arcs.
- **Surface to orbit:** mass driver (bulk, unmanned) or spaceport (anything).
- **Between bodies:** freighters. Travel time depends on the current orbital positions. The same route is faster or slower at different times. The Solar map shows the current travel time for each route.

### 4.7 Research

- 6 branches: Extraction, Processing, Logistics, Finance, Exploration, Society (housing, morale, training).
- Research belongs to the group. Every subsidiary gets it at once.
- Some nodes are **patentable**. The first company to complete one owns the patent. Other companies pay a licence fee to use it, or wait until it expires. Patents run for 2 game years (about 12 real days).
- Research points come from research labs and from patent licence income.

---

## 5. Goods

- 105 goods: 50 raw, 30 refined, 25 components. Full list in Appendix A.
- Each body has **specialties**. Some raw goods exist on one body only. Examples: KREEP ore on Luna, tholins on Titan, tellurium on Io, metallic hydrogen in Jupiter's atmosphere, exotic crystals on exoplanets.
- Recipes accept **substitute groups** where real chemistry allows it. For example, steel takes any iron source (ilmenite, hematite, nickel-iron, magnetite) at different yields.
- Not tradable: power (per section), workforce, reputation (group and per body), research points.

---

## 6. People: residential and workforce system

### 6.1 Scale

- Every worker is an individual in the simulation. Each worker has a name, home, job, skill, skill level, morale and needs.
- End-game target: about 10,000 workers across the group.
- Workers are stored in typed arrays (structure of arrays). 10,000 workers use about 1 MB. A full update of all workers takes less than 1 ms.

### 6.2 Housing

- Crew quarters → habitat dome → arcology. Each has a capacity and a quality level.
- Quality affects morale and the type of worker who will accept the home.

### 6.3 Needs

- Air, water, food, power, medical care, recreation.
- Buildings and goods supply the needs: air plant, water plant, hydroponics farm, clinic, recreation centre, consumer goods.
- An unmet need lowers morale. An unmet air or water need is an emergency. The companion warns at once.

### 6.4 Jobs and skills

- Skills: miner, technician, engineer, scientist, pilot, crew.
- Each building has job slots by skill and by level.
- Assignment: by hand, or by priority rules ("fill smelters first", "never staff below 80%").
- The **training centre** raises skill levels. Training takes time and costs money.
- New workers arrive through colonist-transport contracts and through migration. Migration follows wages and morale.

### 6.5 Commute

- Workers ride bus rovers (20–40 seats) from home to work at each shift change.
- Long commutes lower productivity. Where you put housing matters.
- Up close, workers walk from the rover to the building door.

### 6.6 Morale

- High morale gives a productivity bonus.
- Low morale causes slowdowns, then strikes, then emigration.
- Wages, housing quality, met needs, commute length and recent events affect morale.

### 6.7 Voyage crews

- Ship crews come from the same worker pool (pilots and crew).
- A crew member lost on a voyage is lost from the colony.

### 6.8 People tab

- Lists that render only the visible rows.
- Filters by body, section, skill, morale and housing.
- Bulk assignment rules.
- Tap any worker or rover to see who they are, where they live and where they work.

---

## 7. Economy simulation

The economy follows real-world mechanics. It is meant to be deep and hard to master. The companion and the Codex explain each concept when the player first meets it, with a real-world example.

### 7.1 Markets and price discovery

- Every good on every body has its own **limit order book**: bids, asks, spread, depth and price impact.
- NPC colonies and NPC industry provide liquidity as **supply and demand curves**. Rivals and the player place real orders on top of the curves. The market clears once per game hour (every real minute).
- Thin markets on frontier bodies have wide spreads and large price swings.
- **Elasticity per good:** necessities (air, water, food) are inelastic. Luxury goods are elastic.
- **Substitution and complements:** NPC industry switches between substitutes when relative prices change (for example, titanium alloy to steel). Complements are bought together.
- **Order types:** market order, limit order, standing order (repeats each day within limits).

### 7.2 Arbitrage

All four kinds are real mechanics:

1. **Spatial:** buy on one body, sell on another. Profit = price gap − freight − travel time cost − insurance − tariffs.
2. **Temporal:** store goods and sell later. Warehouses cost money. Some goods decay (food, biotech cultures).
3. **Processing spread:** refine when the margin between input and output is wide (like the oil "crack spread").
4. **Currency:** cross-currency and triangular arbitrage on the FX markets (section 7.3).

**Information lag:** inside Sol, price data is effectively instant. From other star systems, it arrives with courier ships until FTL comm relays exist. Every price shows its age. Faster information is a trading edge.

### 7.3 Macro economy

Each jurisdiction has:

- its own **currency**, traded on FX markets
- a **central bank** that sets the policy rate from inflation and output (a Taylor rule)
- GDP, inflation and business cycles (expansion, peak, recession, recovery). A full cycle takes 30–90 game days (12–36 real hours), so a run sees several.
- central bank rate meetings once per game month
- corporate tax, tariffs, trade agreements and sanctions

| Jurisdiction | Bodies | Currency |
|---|---|---|
| Earth Bloc | Earth (market only), Mercury | Terran Credit (TC) |
| Lunar Authority | Luna | Lunar Mark (LM) |
| Martian Republic | Mars, Phobos, Deimos | Ares Dollar (A$) |
| Belt Compact | Ceres, Vesta, Psyche, near-Earth asteroids | Compact Scrip (CS) |
| Jovian League | Io, Europa, Ganymede, Callisto, Jupiter platforms | Jovian Crown (JC) |
| Kronian Commons | Titan, Enceladus | Kronian Shilling (KS) |
| Venus Quarter | Venus aerostat cities | No currency of its own. Accepts all. Home of the black market. |
| Exoplanet colonies | Each colony | Each colony issues its own currency (generated name). |

**Labour market:** wages differ by body and follow worker supply and demand. Unions form in large colonies. Strikes are possible. Workers migrate toward better wages and morale.

### 7.4 Rivals

- 5 rival corporations in Sol. More are founded at the Regional and Galactic tiers.
- Archetypes: **Expander**, **Cautious miner**, **Financier** (hunts takeovers), **Pirate-linked** (black market), **State-backed**.
- Rivals follow the same rules as the player. They do not cheat. They own sections and buildings, hold cash and shares, trade, bid, research and race for patents.
- AI: utility-based. Each rival scores its options on its own decision tick and picks the best. The archetype sets the weights.
- Rivals can go bankrupt. Their assets go to auction. A new rival is founded later.

### 7.5 Companies, shares and takeovers

- The **group** and each **subsidiary** are listed companies.
- **Share price** comes from book value, earnings, growth, reputation and market sentiment. Sentiment follows news, dividends and the business cycle.
- **Actions:** buy and sell shares (any company), buy back own shares, issue new shares (dilutes existing holders), set the dividend payout ratio, short-sell shares (with a borrow fee).
- **Short squeezes** can happen when many shorts must cover at once.
- **Subsidiary IPO:** the group can sell a minority stake in a subsidiary to raise cash. Rivals can then buy into that subsidiary.

**Takeover thresholds** (for any listed company):

| Stake | Effect |
|---|---|
| 20% | The holder must disclose the stake. |
| 35% | The target gets a warning. A defence window opens. |
| > 50% | Takeover. The buyer controls the company and its assets. |

**Defences:** share buyback, poison pill (Finance research), white-knight ally (a friendly rival buys a blocking stake), and reputation (it lowers the sentiment that attackers exploit).

**Losing:**
- If a rival takes over a **subsidiary**, the player loses that body's assets only.
- If a rival takes over the **group**, the run ends (game over). Founder Legacy applies (section 12).
- A takeover never completes during offline catch-up. The player always gets at least one online defence window after the 35% warning.

### 7.6 Corporate finance

- Every company has full **financial statements**: income statement, balance sheet and cash flow statement. They update every game hour and close every game month (12 real hours). Dividends are paid and credit ratings are reviewed at each close.
- Ratios shown: P/E, EPS, ROE, debt/equity, interest cover, current ratio.
- **Credit rating** from AAA to D, from debt, cash flow and share price. The rating sets the interest rate.
- **Debt:** bank loans, credit lines, and corporate bonds with a coupon and a maturity. The yield curve of each jurisdiction comes from its central bank rate and the cycle.
- **Default:** forced asset sales, a rating crash and a share price crash.
- **Commodity futures:** hedge or speculate on future prices. Margin is required. Margin calls happen.
- **Cargo insurance:** the premium follows the risk of the route and the voyage.
- **Transfer pricing:** subsidiaries sell to each other at internal prices that the player sets. This moves profit to low-tax jurisdictions. If prices go too far from the market, tax audits become likely. An audit brings back-tax, a fine and a reputation loss.
- **Accounting invariant:** assets = liabilities + equity for every company at every tick. Debug builds check it.

### 7.7 Reputation

- Kept at group level and for each body.
- Affects: which contracts are offered, entry to auctions, bid weight, investor sentiment, and how many contracts can be held at once.
- Black-market deals and failed contracts lower it.

### 7.8 Auctions

- Timed, open-bid (ascending) auctions. They last a few real minutes. Rival bids appear live.
- **Bid score** = cash bid × a reputation bonus.
- Bids can be funded with credit.
- **Proxy bids:** the player can set a ceiling. The game bids for the player up to the ceiling, also while offline.
- Lots: section rights, planet charters, system charters, patents (from bankrupt companies), salvage rights, bankrupt companies' assets.

### 7.9 Market events

- Booms, shortages, strikes, solar flares, new discoveries, pirate blockades, tech breakthroughs, central bank surprises.
- Reported through the news ticker and the companion.

### 7.10 Tuning

- All economic numbers live in data tables under `src/data/`.
- The balance bot (section 14.3) checks them.

---

## 8. Contracts, auctions and achievements

### 8.1 Contract structure

Every contract has:

- an **issuer** (government, colony, NPC company, rival, black-market broker, central bank, or the player's board)
- **requirements** and a **deadline** in game days
- an optional **deposit**
- a **reward**: cash in the issuer's currency, reputation, and sometimes a licence or a patent
- a **penalty** on failure: reputation loss and loss of the deposit
- a **minimum tier**

### 8.2 Types and frequency

The 19 types are listed in Appendix C. Offers are drawn by rarity. Shares are normalised among the types available at the player's tier.

| Rarity | Types | Share |
|---|---|---|
| Common | Ore delivery, infrastructure development | ~45% |
| Regular | Refined goods supply, residential building, freight / logistics, survey & exploration, colonist transport | ~33% |
| Uncommon | Ship construction, route subsidy, escort / security, salvage, market stabilisation, site restoration | ~16% |
| Rare | Emergency / rescue (event-driven), interplanetary development | ~6% |
| Special boards | Patent race, black market deals, hostile takeover, corporate charter | Separate boards, not in the shares above |

### 8.3 Reward formula

Reward = (market value of inputs + labour + transport) × type margin × urgency factor × reputation bonus.

- Ore delivery: 1.1–1.3×.
- Emergency / rescue: 2–3×, with a short deadline.
- Interplanetary development: 1.5–2.5×. The reward is never less than the full production cost plus a premium.

### 8.4 Multi-stage contracts

- Infrastructure, residential and interplanetary development contracts run in stages: deliver materials → build → staff.
- The result is a client asset on a plot. It is not the player's asset.
- The client colony grows. Local demand grows with it. This is a deliberate feedback loop.

### 8.5 Boards

- One board per body, plus a group board, with filters.
- The number of contracts held at once grows with reputation.
- Contracts that need a ship (escort, salvage, rescue, piracy, recon, freight, colonist transport) start a voyage. The voyage can be flown live or on autopilot (section 9.5).

### 8.6 Achievements

- More than 120 at launch, in about 10 categories.
- Kinds: **milestones** (firsts), **mastery** (volumes and records), **secret** (unusual feats, for example winning a fight with 1 hull point left).
- Rewards: Legacy points and cosmetics (ship liveries, company logo parts, poster frames).
- Shown in the profile and in the Codex. The best ones appear on the share card.

---

## 9. Presentation

### 9.1 Map levels

One continuous zoom covers Bird's-eye to Planetary. Further zoom-out changes scene to the next level with an animated transition.

| Level | Shows | Filters |
|---|---|---|
| Bird's-eye (main view) | Tilted camera over the surface. Plots, buildings, belts, roads, rovers, workers. | Power grid, morale, throughput, jams |
| Planetary | Globe from orbit. Section borders, ownership colours, deposits. | Resources, ownership, contracts, threats |
| Solar | Bodies on orbits (compressed distances), freighter arcs, current travel times. | Routes, traffic, price heatmap per good |
| Regional galactic | About 20 real nearby stars, travel lanes, known and unknown systems, age of price data. | Lanes, influence, pirates |
| Galactic | Spiral galaxy, sectors, influence of each company. | Ownership, exploration |

### 9.2 Camera (Bird's-eye and Planetary)

- **Pan:** moves along the surface of the sphere (drag, or WASD on desktop).
- **Rotate:** changes heading (two-finger twist, or Q/E).
- **Lock north:** keeps the heading on the local meridian. A compass shows north.
- **Zoom:** pinch or scroll. Changes altitude from low bird's-eye to orbit.
- The player can circle the whole planet and cross the poles. At bird's-eye altitude a full circle takes more than 10 minutes of panning.

### 9.3 The motion pillar

- **Conveyor belts:** goods ride as instanced crates with shapes and colours by goods group. One crate stands for a batch. Batch size scales so the flow looks continuous at any throughput. A blocked belt visibly jams.
- **Roads:** routed with A* over the terrain slope grid. Paths avoid steep slopes and craters. Paths are smoothed into Catmull-Rom splines.
- **Commuters:** bus rovers leave the residential quarters at each shift change and drive to work along the roads. Up close, workers walk from the rover to the door.
- **Haulers, mass drivers, landers, freighters:** move on eased bezier curves. Nothing teleports.
- **Level of detail:** close range shows workers and crates. Mid range shows rovers and belt flow. Orbit shows traffic lines.
- **UI motion:** income arrives as small tokens that arc to the top bar. Numbers roll up.
- **Easing:** custom curves. A heavy "industrial" ease for machines. Springs for the UI. No straight linear moves.
- **Reduced motion:** a full mode that respects the system setting.

### 9.4 Layout

**Desktop (≥ 1024 px):**

- **Top bar:** cash per currency, pinned goods with trend arrows, workforce, power, reputation, date, alerts.
- **Left tab rail:** Build, People, Trade (market, orders, FX, futures), Finance (statements, stocks, loans, bonds), Contracts, Research, Fleet / Voyages, Codex, Settings.
- **Right:** context panel for the current selection.
- **Bottom:** news ticker and companion portrait.
- **Keyboard shortcuts** for every tab and the camera.

**Mobile (< 1024 px):**

- **Top strip:** pinned resources, scrolls sideways.
- **Bottom tab bar:** 5 main tabs plus "More".
- **Panels:** bottom sheets at half or full height.
- **Selection:** a peek sheet.
- **Companion:** a floating portrait.
- Touch targets are at least 44 × 44 px.

### 9.5 Voyage mode

- Any ship trip can be flown **live** or on **autopilot**.
- Voyage kinds: transfer, travel, freight, colonist transport, piracy (the player raids), recon, escort, salvage, rescue, survey, smuggling.
- **Ship view:** 2D side cut-away in the poster style. Rooms, crew, systems and power bars.
- **Operating parameters:** the player tunes engines, shields, sensors, weapons, cargo bay and life support. Settings trade speed against safety, fuel use and cargo condition.
- **Legs:** a trip is split into legs of 1 game day (24 real minutes). A Moon–Mars trip takes 5–10 game days, so it has 5–10 legs. Each leg has a 10% chance of an event. Events can be good or bad: pirates, a derelict to salvage, an ion storm, a stowaway, a lucky find, a distress call.
- **Live:** when an event fires, the ship holds position and waits for the player's decision. Holding costs time and can put a deadline at risk. Opportunities (salvage, rescue, trade offers) appear only on live voyages.
- **Autopilot:** the ship never waits. Bad events resolve by ship stats and dice. Opportunities never appear.
- **Combat:** real-time with pause, like FTL. The player assigns crew to rooms, moves power between systems and targets enemy systems. Combat runs as its own local simulation at 30 Hz. The world clock keeps running.
- **Touch controls:** tap a crew member, then tap a room. Drag power bars. A large pause button.
- **Bridge inbox:** lists all live voyages that wait for a decision.

### 9.6 Art direction: retro-futurist poster

- **Palette:** 8 core colours: deep navy, burnt orange, mustard, teal, cream paper, rust, off-black, dusty pink. Each body has an accent: Luna grey, Mars rust, Europa ice-teal, Titan amber haze.
- **3D rendering:** banded lighting in 3–4 steps, halftone in shadow areas, paper grain, a very small print-offset (colour misregistration), soft outlines from an edge-detection pass.
- **UI:** printed cards on cream paper. Bold geometric headers. Thin rules. Stamps and badges.
- **Type:** Jost (geometric display), IBM Plex Sans (text), IBM Plex Mono with tabular figures (numbers). Fonts are self-hosted so the game works offline.
- **Icons:** one custom SVG set, 2 px stroke.
- **Forbidden:** glassmorphism, purple gradients, emoji icons, default UI kits.
- A **colour-blind-safe** palette option is available.

### 9.7 Audio

- All sound effects are generated with the Web Audio API: belt hum, rover engines, machinery, UI clicks.
- Generative ambient music in a 1970s synthesiser style. A different mood for each body.
- Mixer with separate volumes and mute.
- Haptics through the Vibration API where the browser supports it (not iOS Safari).

### 9.8 Accessibility

- Colour-blind-safe palette option.
- Text scaling.
- Keyboard shortcuts on desktop.
- Screen-reader labels on all UI panels. The 3D view is described by the selection panel.
- Reduced-motion mode.
- Minimum touch target 44 × 44 px.

---

## 10. Story, companion and Codex

### 10.1 Companions

The player picks a companion on founding day. The choice can change later in Settings. Arc progress is kept.

| Companion | Voice | Personal arc |
|---|---|---|
| Old miner veteran | Dry humour, blunt advice, stories from every rock in Sol | Old debts and old claims across the Belt |
| Ship AI | Curious and literal at first. Gains personality as tiers unlock. | Finding out who wrote its core, and why |
| Ambitious co-founder | Energetic, scheming, pushes risky deals | Holds group shares. Their loyalty is part of the takeover game. |
| Redhead pirate | Bold, flirtatious, bawdy | Rescued from a slave ship in the Venus Quarter. The rescue is the player's first voyage-mode mission. Her old crew becomes a pirate faction. |

The pirate's tone puts the game at 16+.

### 10.2 Tutorial

- The tutorial is chapter 1 of the story. It teaches through the companion's voice, not through tooltips.
- All 4 companions hit the same **beats** (shared beat IDs). Each companion has its own lines for each beat.
- Each later tier opens a new story chapter (first Mars landing, first takeover defence, first exoplanet).

### 10.3 After the tutorial

- The companion comments on events, warns about rival stakes, celebrates achievements and explains economic concepts on first contact.
- Hints can be muted per category.

### 10.4 Codex (wiki)

- Entries for every good, building, contract type, mechanic and economic concept.
- An entry unlocks when the player first meets the subject.
- Entries are built from the data tables plus written text in the companion's voice.
- Always one tap away, from any screen.

### 10.5 Writing budget

Writing volume is a known risk: 4 voices × tutorial beats, story chapters, event lines and Codex text. Dialogue lives in data files per companion, keyed by beat ID. Missing lines fall back to a neutral narrator voice, so the game never breaks for missing text.

---

## 11. Offline progress and saves

### 11.1 Offline catch-up

- On return, the game computes elapsed real time. Negative time (clock changed backwards) counts as zero.
- **Catch-up window** = elapsed time, capped at 8 hours. Beyond the cap, the world waits for the player.
- During the window:
  - The world runs at full rate: markets, rivals, auctions, central banks.
  - Player production runs at 50% (skeleton shifts). Research and Legacy perks can raise this to 80% at most.
  - Standing orders and proxy bids execute.
  - Autopilot voyages resolve. Live voyages hold at their next event.
  - Contract deadlines keep running. Delivery contracts can be set to auto-renew.
  - **A takeover never completes.**
- Catch-up runs in coarse ticks (1 game hour each) in the simulation worker. Target: less than 10 seconds for an 8-hour window, with a progress bar.
- Then the **"While you were away"** page shows a one-page summary in newspaper-poster style.

### 11.2 Saves

- Stored in IndexedDB.
- 3 rolling autosave slots, written every 30 seconds and when the tab becomes hidden. Plus manual slots.
- Only changes are saved. Terrain is regenerated from the seed. A save holds companies, people, markets, built plots, roads, contracts and voyages. A 10,000-worker save stays at a few MB.
- Each save has a schema version and a checksum.
- Each schema change has a migration, tested with fixture saves.
- A corrupt slot falls back to the previous slot.
- **Export / import:** as a gzip + base64 code (CompressionStream), or as a file.

### 11.3 Share card

- A generated image in the poster style: group value, bodies held, best achievements, companion portrait.
- Saved as a PNG or shared through the Web Share API.

---

## 12. Founder Legacy (meta progression)

- A run ends when the player **retires** the group or **loses** it to a takeover.
- **Legacy points** come from the group's peak value, achievements and tiers reached.
- Retiring gives 100% of the points. Losing gives 50%.
- **Perk tree:** starting capital, an extra starting section, research speed, offline efficiency, auction reputation bonus, companion perks, cosmetics.
- Sol is the same in every run. Each run gets a new seed for everything beyond Sol.

---

## 13. Architecture

### 13.1 Stack

| Part | Choice |
|---|---|
| Language | TypeScript, strict mode |
| Build | Vite |
| 3D | Three.js |
| UI | Preact + @preact/signals |
| Motion | GSAP (UI motion, bezier paths) |
| Tests | Vitest, fast-check, Playwright |
| Offline / install | PWA with a service worker |
| Hosting | GitHub Pages, deployed by GitHub Actions |

Exact versions are pinned in `package.json`.

### 13.2 Threads

| Thread | Owns |
|---|---|
| Main | Three.js rendering, Preact UI, input, audio |
| Simulation worker | The whole game state and all game rules |
| Chunk workers (pool) | Terrain chunk geometry |

- The UI sends **commands** to the simulation worker.
- The simulation worker sends **snapshots** about 5 times per second, plus **events**.
- The simulation never touches the DOM or Three.js.

### 13.3 Simulation core

- Pure TypeScript. No DOM, no browser APIs except in the worker shell.
- Deterministic: seeded random number generator, fixed tick, commands applied by tick number. The same seed and the same commands always give the same state hash.
- Modules: `clock`, `rng`, `world` (bodies, sections, plots, deposits), `people`, `production`, `logistics`, `market` (order books, clearing), `macro` (central banks, FX, cycles), `finance` (statements, shares, debt, futures, insurance), `companies` (player and rivals, rival AI), `contracts`, `auctions`, `research`, `voyage` (legs, events, combat), `story` (beats, Codex unlocks), `achievements`.

### 13.4 Rendering

- **Planet:** cube-sphere. Each of the 6 faces is a quadtree of terrain chunks.
- **Terrain:** height, biome and deposits come from seeded 3D noise sampled on the sphere. No seams. The poles work like any other area.
- **Streaming:** chunk workers build geometry and transfer the buffers to the main thread. Level of detail follows the camera altitude. Chunks out of range are disposed.
- **Instancing:** crates, rovers, workers and repeated buildings use instanced meshes.
- **Post-processing:** the poster pass (banding, halftone, grain, print offset, outlines).
- **Map levels:** Solar, Regional and Galactic are separate scenes on the same renderer.
- **Moving things:** each has a schedule (start time, path, speed). The renderer computes position from time. GSAP drives bezier path progress for ships and UI tokens.

### 13.5 Performance budgets

| Item | Budget |
|---|---|
| Frame rate, mid-range 2021 phone | 60 fps target, never below 30 fps |
| Main thread work per frame | < 8 ms |
| Simulation online tick at 10,000 workers | < 4 ms (in the worker) |
| Draw calls at bird's-eye | < 300 |
| Triangles on phones | < 1.5 million |
| Initial JavaScript (gzip) | < 1.5 MB |
| Time to interactive on 4G, mid-range phone | < 4 s |

- Device pixel ratio adapts to hold the frame rate.
- Rendering stops when the tab is hidden.

### 13.6 Browser support

- Latest 2 versions of Chrome, Edge, Firefox and Safari (iOS 16 and later).
- WebGL 2 is required. Without it, the game shows a clear message.

### 13.7 Project layout

```
src/
  sim/          pure simulation core (section 13.3)
  sim.worker.ts simulation worker shell
  render/       Three.js: globe, chunks, camera, maps, poster pass, instancing
  ui/           Preact: shell, tabs, panels, companion, Codex
  data/         goods, buildings, recipes, contracts, research, companions, balance constants
  save/         IndexedDB, migrations, export and import
  audio/        Web Audio sound effects and music
tests/          unit and property tests
bot/            headless balance bot
e2e/            Playwright tests
```

---

## 14. Testing

### 14.1 Unit and property tests (Vitest, fast-check)

- One test suite per simulation module.
- Invariants, checked by property tests and on every tick in debug builds:
  - Money is conserved across all transfers.
  - Stock is never negative.
  - Assets = liabilities + equity for every company.

### 14.2 Determinism

- The same seed and the same command log give the same state hash after N ticks.
- Offline catch-up from a save gives the same result each time.

### 14.3 Balance bot

- A headless scripted player that runs in Node with coarse ticks.
- It plays a 10-real-day run in less than 2 minutes.
- CI fails if the pacing targets in section 3.3 are missed.

### 14.4 Save migrations

- Fixture saves for every schema version. Each must load in the current version.

### 14.5 End-to-end (Playwright)

- Viewports: 390 × 844 (phone) and 1440 × 900 (desktop).
- Screenshot comparison of key screens.
- Touch gestures: pan, pinch, two-finger rotate.

### 14.6 Performance

- A benchmark scene with 10,000 workers on a throttled CPU.
- CI fails if the budgets in section 13.5 are exceeded.

### 14.7 CI

- GitHub Actions runs: strict type check, lint, unit and property tests, determinism tests, balance bot, Playwright, performance benchmark.
- A push to `main` deploys to GitHub Pages.

---

## 15. Milestones

Each milestone gets its own implementation plan.

| # | Milestone | Done when |
|---|---|---|
| M0 | Foundations | Vite + TypeScript project, CI, simulation worker shell, deterministic clock and RNG, save system, design tokens. |
| M1 | Moon vertical slice | Globe with streamed chunks. Bird's-eye camera (pan, rotate, lock north, zoom). Sections and plots. About 20 goods. Belts and roads. People with housing, jobs and commuter rovers. Local order book in one currency. Ore delivery and infrastructure contracts. Companion chapter 1 for one companion. Poster rendering. **The core loop feels great.** |
| M2 | Economy core | Rivals with AI, auctions, stocks, loans, reputation, financial statements, Lunar Mark currency. |
| M3 | Mars and the group | Listed subsidiaries, IPO, takeovers and game over, freight between bodies, Solar map, FX markets, central banks and cycles. |
| M4 | Voyage mode | Ship cut-away, operating parameters, legs and events, real-time combat with pause, autopilot, voyage contracts, the pirate rescue arc. |
| M5 | Outer Sol | Belt, Jovian moons, Titan and Enceladus, Mercury and Venus. All 105 goods. Futures, short selling, bonds, insurance, transfer pricing. All 19 contract types. Achievements. |
| M6 | Beyond Sol | Regional and Galactic maps, procedural star systems, information lag, FTL tiers, more rivals. |
| M7 | Meta and polish | Founder Legacy perks, full arcs for all 4 companions, full audio, share card, PWA install, accessibility pass. |

---

## Appendix A. Goods (105)

### A.1 Raw goods (50)

| # | Good | Source body |
|---|---|---|
| 1 | Lunar regolith | Luna |
| 2 | Ilmenite | Luna |
| 3 | Anorthite | Luna |
| 4 | Helium-3 | Luna |
| 5 | KREEP ore (rare earths, phosphorus, potassium) | Luna |
| 6 | Polar volatiles | Luna |
| 7 | Graphite | Mercury |
| 8 | Mercurian sulfides | Mercury |
| 9 | Enstatite | Mercury |
| 10 | Atmospheric nitrogen | Venus (aerostats) |
| 11 | Sulfuric acid mist | Venus (aerostats) |
| 12 | Venusian CO2 | Venus (aerostats) |
| 13 | Hematite | Mars |
| 14 | Martian basalt | Mars |
| 15 | Perchlorate salts | Mars |
| 16 | Martian water ice | Mars |
| 17 | Gypsum | Mars |
| 18 | Clay minerals | Mars |
| 19 | Heavy-water ice | Mars |
| 20 | Nickel-iron | Belt (M-type asteroids) |
| 21 | Platinum-group ore | Belt |
| 22 | Cobalt ore | Belt |
| 23 | Carbonaceous chondrite | Belt, Phobos, Deimos |
| 24 | Olivine | Belt |
| 25 | Iridium ore | Belt |
| 26 | Gold ore | Psyche |
| 27 | Ceres brine | Ceres |
| 28 | Eucrite | Vesta |
| 29 | Metallic hydrogen | Jupiter (deep-atmosphere platforms) |
| 30 | Jovian deuterium | Jupiter |
| 31 | Jovian ammonia | Jupiter |
| 32 | Sulfur | Io |
| 33 | Sulfur dioxide frost | Io |
| 34 | Tellurium ore | Io |
| 35 | Europan ice | Europa |
| 36 | Magnesium sulfate brine | Europa |
| 37 | Ocean biofilm | Europa |
| 38 | Ice-silicate mix | Ganymede |
| 39 | Magnetite | Ganymede |
| 40 | Carbon dust | Callisto |
| 41 | Callisto ice | Callisto |
| 42 | Methane | Titan |
| 43 | Ethane | Titan |
| 44 | Tholins | Titan |
| 45 | Ammonia-water cryolava | Titan |
| 46 | Plume ice | Enceladus |
| 47 | Silica nanograins | Enceladus |
| 48 | Exotic crystals | Exoplanets (generated) |
| 49 | Superheavy isotopes | Exoplanets (generated) |
| 50 | Xeno-bioresin | Exoplanets (generated) |

### A.2 Refined goods (30)

| # | Good | Main inputs |
|---|---|---|
| 1 | Steel | Any iron source (ilmenite, hematite, nickel-iron, magnetite) |
| 2 | Titanium alloy | Ilmenite |
| 3 | Aluminium | Anorthite |
| 4 | Sintered concrete | Any regolith or basalt |
| 5 | Glass | Silicates (anorthite, enstatite, olivine, eucrite) |
| 6 | Silicon wafers | Glass, power |
| 7 | Rare-earth oxides | KREEP ore |
| 8 | Refined platinum metals | Platinum-group ore, iridium ore |
| 9 | Cobalt metal | Cobalt ore |
| 10 | Fine gold | Gold ore |
| 11 | Oxygen | Ilmenite, perchlorate salts or any water ice |
| 12 | Potable water | Any water ice, brines |
| 13 | Hydrogen | Any water ice, Jovian ammonia |
| 14 | Hydrolox propellant | Oxygen, hydrogen |
| 15 | Methalox propellant | Methane or Venusian CO2 + hydrogen, oxygen |
| 16 | Fusion fuel | Helium-3, Jovian deuterium or heavy-water ice |
| 17 | Polymers | Ethane, methane, carbonaceous chondrite |
| 18 | Carbon fibre | Graphite, carbon dust, carbonaceous chondrite |
| 19 | Graphene | Graphite |
| 20 | Fertiliser | Atmospheric nitrogen, Jovian ammonia, KREEP ore |
| 21 | Hydroponic produce (food) | Potable water, fertiliser, power |
| 22 | Algae protein (food) | Potable water, fertiliser, Venusian CO2 or carbon dust |
| 23 | Mining explosives | Perchlorate salts |
| 24 | Industrial acid | Sulfuric acid mist, sulfur, sulfur dioxide frost |
| 25 | Ceramics | Clay minerals, gypsum, silica nanograins |
| 26 | Thermoelectric compound | Tellurium ore, Mercurian sulfides |
| 27 | Biotech cultures | Ocean biofilm, xeno-bioresin |
| 28 | Stabilised metallic hydrogen | Metallic hydrogen (FTL-1 key) |
| 29 | Superheavy alloy | Superheavy isotopes (FTL-2 key) |
| 30 | Exotic matter | Exotic crystals (FTL-3 key) |

### A.3 Components (25)

| # | Good | Main inputs |
|---|---|---|
| 1 | Electronics | Silicon wafers, rare-earth oxides, refined platinum metals, fine gold |
| 2 | Machinery | Steel, electronics |
| 3 | Habitat modules | Steel, polymers, glass |
| 4 | Life-support units | Machinery, electronics, biotech cultures |
| 5 | Solar panels | Silicon wafers, aluminium, glass |
| 6 | Power cells | Cobalt metal, rare-earth oxides, polymers |
| 7 | Fusion reactor cores | Superconductor coils, titanium alloy, fusion fuel |
| 8 | Permanent magnets | Rare-earth oxides, cobalt metal |
| 9 | Superconductor coils | Rare-earth oxides, carbon fibre, thermoelectric compound |
| 10 | Drill heads | Titanium alloy, refined platinum metals |
| 11 | Conveyor segments | Steel, machinery |
| 12 | Rover chassis | Steel, aluminium, power cells |
| 13 | Hull plating | Titanium alloy, carbon fibre, ceramics |
| 14 | Shield emitters | Superconductor coils, electronics |
| 15 | Sensors | Electronics, glass |
| 16 | Drones | Electronics, aluminium, power cells |
| 17 | Weapon systems | Machinery, permanent magnets, electronics |
| 18 | Medical supplies | Biotech cultures, polymers |
| 19 | Consumer goods | Polymers, electronics, fine gold |
| 20 | Prefab structures | Sintered concrete, steel |
| 21 | Drive units | Machinery, titanium alloy, ceramics |
| 22 | FTL comm relay | Superconductor coils, exotic matter |
| 23 | Alcubierre ring (FTL-1) | Stabilised metallic hydrogen, superconductor coils, graphene |
| 24 | Jump coil (FTL-2) | Superheavy alloy, superconductor coils |
| 25 | Gate segment (FTL-3) | Exotic matter, superheavy alloy, hull plating |

---

## Appendix B. Buildings

| Category | Building | Notes |
|---|---|---|
| Extraction | Mine | Solid ores on deposit plots |
| Extraction | Ice drill | Water ice, brines |
| Extraction | Regolith scoop | Regolith, basalt, surface volatiles |
| Extraction | He-3 harvester | Helium-3 (Luna) |
| Extraction | Atmospheric scoop | Venus aerostats, Titan |
| Extraction | Deep-atmosphere platform | Jupiter: metallic hydrogen, deuterium, ammonia |
| Extraction | Cryo-drill | Outer moons, plume ice |
| Power | Solar array | Weak in the outer system |
| Power | Fission plant | Needs fuel goods |
| Power | Fusion reactor | Needs fusion fuel |
| Processing | Smelter | Metals |
| Processing | Electrolysis plant | Oxygen, hydrogen |
| Processing | Wafer fab | Silicon wafers |
| Processing | Chemical refinery | Polymers, propellants, acids, explosives |
| Processing | Assembly works | Components |
| Processing | Hydroponics farm | Food |
| Processing | Water plant | Potable water |
| Processing | Air plant | Breathable air for housing |
| Logistics | Depot | Section storage hub |
| Logistics | Warehouse | Long-term storage, temporal arbitrage |
| Logistics | Conveyor hub | Belt junctions, sorting |
| Logistics | Rover garage | Bus and hauler rovers |
| Logistics | Mass driver | Bulk launch to orbit |
| Logistics | Spaceport | Any cargo, passengers, ships |
| Logistics | Shipyard | Ships, ship-construction contracts |
| People | Crew quarters | Basic housing |
| People | Habitat dome | Mid housing |
| People | Arcology | High-density, high-quality housing |
| People | Clinic | Medical need |
| People | Recreation centre | Recreation need |
| People | Training centre | Skill levels |
| Other | Research lab | Research points |
| Other | Patent lab | Patent races |
| Other | Security post | Drones for escort and defence |
| Other | Comm relay | Information speed; FTL relay at Regional tier |

---

## Appendix C. Contract types (19)

| # | Type | Issuers | From tier | Rarity | Typical reward | Voyage |
|---|---|---|---|---|---|---|
| 1 | Ore delivery | Colonies, NPC industry | 1 | Common | 1.1–1.3× | Optional |
| 2 | Infrastructure development | Local governments | 1 | Common | 1.2–1.5× | No |
| 3 | Residential building | Colonies | 1 | Regular | 1.2–1.5× | No |
| 4 | Refined goods supply | NPC industry | 1 | Regular | 1.15–1.4× | Optional |
| 5 | Survey & exploration | Governments, investors | 1 | Regular | Fixed fee + data bonus | Recon (tier 3+) |
| 6 | Freight / logistics | NPC traders | 2 | Regular | Per tonne and distance | Yes |
| 7 | Colonist transport | Colonies | 2 | Regular | Per passenger | Yes |
| 8 | Ship construction | NPC companies, governments | 2 | Uncommon | 1.3–1.6× | No |
| 9 | Route subsidy | Governments | 3 | Uncommon | Bonus per delivery for a set period | Yes |
| 10 | Escort / security | NPC traders | 3 | Uncommon | Fee + bounties | Yes (combat) |
| 11 | Salvage | Insurers, governments | 3 | Uncommon | Share of recovered value | Yes |
| 12 | Market stabilisation | Central banks | 2 | Uncommon | Subsidy covers the price gap + 10–20% | No |
| 13 | Site restoration | Governments | 2 | Uncommon | Reputation + land credits | No |
| 14 | Emergency / rescue | Anyone (event) | 1 | Rare | 2–3× | Often |
| 15 | Interplanetary development | Governments, consortia | 3 | Rare | 1.5–2.5×, never below full cost + premium | Yes (multi-stage) |
| 16 | Patent race | Research council | 1 | Special board | Exclusive patent + licence income | No |
| 17 | Black market deals | Brokers in the Venus Quarter | 2 | Special board | 2–4×, detection risk | Smuggling, piracy |
| 18 | Hostile takeover | Financier board | 3 | Special board | Investor bonus on success | No |
| 19 | Corporate charter | The player's board | 1 | Special board (3 active) | Bonus capital | No |

---

## Appendix D. Glossary

| Term | Meaning |
|---|---|
| Group | The player's parent company (conglomerate). |
| Subsidiary | A listed company that runs the group's operations on one body. |
| Section | A region of a body, owned as a unit. Won at auction. |
| Plot | A fixed building site inside a section. |
| Leg | One part of a voyage. Each leg can trigger an event. |
| Live voyage | A voyage the player watches and decides on. Opportunities appear. |
| Autopilot | A voyage without the player. No opportunities. |
| Codex | The in-game wiki, voiced by the companion. |
| Founder Legacy | Points and perks that carry over between runs. |
| Coarse tick | A 1-game-hour simulation step for offline catch-up and the balance bot. |
