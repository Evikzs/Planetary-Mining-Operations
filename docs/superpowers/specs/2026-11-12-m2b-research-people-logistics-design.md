# M2b design: research, people and logistics

- **Status:** design approved in conversation on 2026-11-12. This file waits for the owner's review.
- **Parent:** [the game design specification](2026-10-27-planetary-mining-operations-design.md), sections 4.5–4.7 and 6.
- **Scope (owner log, 2026-11-05):** research and patents, clinic and recreation needs, the training centre, scientist, pilot and crew skills, haulers, road editing.
- **Platform:** desktop only, after the [D1 conversion](2026-11-12-d1-desktop-conversion-design.md). "Real day" means one real day at 1× speed: 60 game days.
- **Numbers:** every number here is a starting value. The balance bot tunes them; the plan records each change as a ruling.

## 1. Owner decisions (2026-11-12)

| Topic | Decision |
|---|---|
| Focus | Research and patents get the most depth and polish. |
| Patents | Licence or wait. Others cannot research a patented node. They can buy a licence at once at a formula price. The holder cannot refuse. At expiry the node opens to all. |
| Tree | 50 nodes, then repeatable efficiency research with no cap. |
| Haulers | Hauler rovers on haul roads, and hauler drones on great-circle arcs (a research unlock). |
| Skills | Scientists staff the labs. Pilots drive haulers. Crew is a skill now but has no jobs until ships arrive in M4. |
| Editing | Roads and belts: add, remove and re-route. |
| Rivals | Rivals research, race for patents, buy licences and run haulers, under the same rules as the player. |

## 2. Research

### 2.1 Points and labs

- **Research lab** (build plot): LM 25,000, 30 t prefab structures, 2 t machinery, 2 t electronics. 6 game hours to build. 3 scientists per shift. Draws 300 kW.
- **Patent lab** (build plot, unlocked by node F1): LM 40,000, 30 t prefab structures, 4 t electronics. 8 game hours. 4 scientists per shift. Draws 400 kW.
- A lab makes research points (RP) each game hour: `3 × staffing × workforce productivity × levelOutput(level)` for a research lab, and `4 × …` for a patent lab. One fully staffed level-1 research lab makes 72 RP a game day.
- Patent-lab points count double, and only toward patentable nodes. When the active node is not patentable, patent-lab points go to it at the normal rate.
- RP are not tradable (parent spec, section 5).
- Each company has one active node and a queue of up to 5. Points beyond the active node's cost go to the next node in the queue. With an empty queue, they are kept and spent on the next node the company picks.
- Research belongs to the company. Groups and subsidiaries come in M3.

### 2.2 Costs

| Tier | RP |
|---|---|
| T1 | 300 |
| T2 | 700 |
| T3 | 1,500 |
| T4 | 3,000 |
| T5 | 6,000 |

The 50 nodes cost 83,700 RP in total. A node is available when all its prerequisites are done or licensed.

### 2.3 Effects

Each node lists typed effects in one data table. The systems read a company's combined modifiers at fixed hook points, so no node has code of its own.

| Kind | What it changes | How effects combine |
|---|---|---|
| `extraction` | Extraction output; scope: a list of building types, or all | Multiply |
| `processing` | Recipe output; scope as above | Multiply |
| `inputs` | Recipe inputs | Multiply |
| `powerUse` | Power drawn; scope as above | Multiply |
| `belts` | Belt capacity | Multiply |
| `haulers` | Hauler capacity | Multiply |
| `speed` | Bus and hauler speed | Multiply |
| `build` | Build time and build cost | Multiply |
| `storage` | Depot and warehouse capacity | Multiply |
| `morale` | Morale, in points | Add |
| `needs` | Air, water and food used per resident | Multiply |
| `coverage` | Residents a clinic or recreation centre serves | Multiply |
| `training` | Training time and cost | Multiply |
| `loanRate` | Loan and credit-line rate, in percentage points | Add (the rate never goes below 0.5%) |
| `credit` | Credit-line size | Multiply |
| `contracts` | Contract cash rewards | Multiply |
| `auction` | Bid weight (added to the reputation bonus) and the LM 2,000 lot fee | Bid weight adds; fee multiplies |
| `research` | RP made | Multiply |
| `unlock` | A building or the hauler drone | — |

### 2.4 The 50 nodes

P marks a patentable node (16 in all).

**Extraction (10)**

| Id | Node | Tier | Needs | Effect | P |
|---|---|---|---|---|---|
| X1 | Hardened drill bits | T1 | — | Extraction +5% (mine) | |
| X2 | Regolith sifting | T1 | — | Extraction +8% (regolith scoop) | |
| X3 | Thermal ice coring | T2 | X1 | Extraction +10% (ice drill) | |
| X4 | Ore sorting | T2 | X1 | Extraction +5% (all) | P |
| X5 | He-3 sieving | T2 | X2 | Extraction +10% (He-3 harvester) | |
| X6 | Autonomous haul trucks | T3 | X4 | Extraction +8% (all) | P |
| X7 | Deep-bore mining | T3 | X3 | Extraction +15% (mine) | |
| X8 | Seismic mapping | T4 | X6 | Extraction +10% (all) | P |
| X9 | Cryogenic extraction | T4 | X7 | Extraction +20% (ice drill, He-3 harvester) | |
| X10 | Swarm excavators | T5 | X8, X9 | Extraction +15% (all) | P |

**Processing (10)**

| Id | Node | Tier | Needs | Effect | P |
|---|---|---|---|---|---|
| P1 | Furnace insulation | T1 | — | Power use −10% (smelter) | |
| P2 | Process control | T1 | — | Processing +5% (all) | |
| P3 | Sintering kilns | T2 | P1 | Processing +10% (smelter) | |
| P4 | Catalyst beds | T2 | P2 | Processing +10% (chemical refinery, electrolysis plant) | P |
| P5 | Lean recipes | T3 | P2 | Inputs −5% | P |
| P6 | Clean-room fabs | T3 | P4 | Processing +20% (wafer fab) | |
| P7 | Robotic assembly | T3 | P5 | Processing +15% (assembly works) | P |
| P8 | Zero-waste smelting | T4 | P3, P5 | Inputs −8% | |
| P9 | Closed-loop life support | T4 | P4 | Processing +20% (hydroponics farm, water plant, air plant) | |
| P10 | Molecular refining | T5 | P7, P8 | Processing +15% (all) | P |

**Logistics (9)**

| Id | Node | Tier | Needs | Effect | P |
|---|---|---|---|---|---|
| L1 | Belt lubrication | T1 | — | Belts +15% | |
| L2 | Route planning | T1 | — | Speed +10% | |
| L3 | Heavy haulers | T2 | L2 | Haulers +25% | |
| L4 | Stacked storage | T2 | L1 | Storage +20% | |
| L5 | Cargo drones | T3 | L3 | Unlock: hauler drone | P |
| L6 | High-speed belts | T3 | L1 | Belts +30% | P |
| L7 | Automated depots | T4 | L4 | Storage +30% | |
| L8 | Drone swarms | T4 | L5 | Haulers +30%, speed +15% | P |
| L9 | Maglev belts | T5 | L6, L7 | Belts +50% | |

**Society (9)**

| Id | Node | Tier | Needs | Effect | P |
|---|---|---|---|---|---|
| S1 | Shift rotas | T1 | — | Morale +3 | |
| S2 | Community events | T1 | — | Coverage +20% | |
| S3 | Training curricula | T2 | S1 | Training −25% | |
| S4 | Recycled air and water | T2 | S2 | Needs −10% | P |
| S5 | Habitat engineering | T3 | S4 | Unlock: arcology | |
| S6 | Mentoring | T3 | S3 | Training −30% | |
| S7 | Telemedicine | T3 | S2 | Coverage +30% | P |
| S8 | Ergonomics | T4 | S1, S6 | Morale +5 | |
| S9 | Arcology commons | T5 | S5 | Needs −15% | |

**Finance (7)**

| Id | Node | Tier | Needs | Effect | P |
|---|---|---|---|---|---|
| F1 | Intellectual property office | T1 | — | Unlock: patent lab | |
| F2 | Investor relations | T1 | — | Credit +20% | |
| F3 | Credit analytics | T2 | F2 | Loan rate −0.25 pp | |
| F4 | Contract law | T2 | F1 | Contracts +5% | |
| F5 | Treasury automation | T3 | F3 | Loan rate −0.5 pp | P |
| F6 | Research grants | T3 | F1 | Research +10% | |
| F7 | Licensing desk | T4 | F6 | Research +15% | P |

**Exploration (5)**

| Id | Node | Tier | Needs | Effect | P |
|---|---|---|---|---|---|
| E1 | Orbital survey | T1 | — | Lot fee −50% | |
| E2 | Bid analytics | T2 | E1 | Bid weight +3% | |
| E3 | Deposit prospecting | T3 | E1 | Extraction +5% (all) | |
| E4 | Rapid site prep | T3 | E1 | Build −20% | |
| E5 | Charter diplomacy | T4 | E2 | Bid weight +5% | P |

### 2.5 Repeatable efficiency research

When every node in a branch is done or licensed, the branch's repeatable node opens. Level n costs `6,000 × 1.4^(n−1)` RP. There is no cap. Repeatable nodes are never patentable.

| Branch | Each level |
|---|---|
| Extraction | Extraction ×1.02 (all) |
| Processing | Processing ×1.02 (all) |
| Logistics | Belts ×1.02 and haulers ×1.02 |
| Society | Needs ×0.98 |
| Finance | Research ×1.02 |
| Exploration | Build ×0.98 |

### 2.6 Patents

- The first company to complete a patentable node holds its patent for 720 game days (2 game years, about 12 real days at 1×).
- While a patent runs, other companies cannot research the node, and points already put into it stay frozen. They can buy a licence at once.
- **Licence price:** an upfront fee of `node RP × LM 30`, then a royalty each game month of 10% of the upfront fee, until the patent expires. The licensee gets the node's effects at once.
- The holder cannot refuse a licence.
- A licensee that misses a royalty loses the licence and its effects. The missed royalty is not a debt.
- Licence income is cash for the holder. It also gives the holder 1 RP for each LM 200 received.
- At expiry, the node opens to all. Licensees keep it for free. Frozen points count toward it again.
- When a company goes bankrupt, each patent it still holds goes to auction as a lot. The reserve is twice the upfront licence fee. The winner holds the patent for the rest of its term and takes over its licences. An unsold patent expires at once.
- News items: patent granted, licence bought, licence lost, patent expired, patent sold at auction.

### 2.7 Rivals

- Each rival picks its next node by branch weight, times 1.5 for an unheld patentable node, divided by the node's cost:

  | Archetype | Extraction | Processing | Logistics | Society | Finance | Exploration |
  |---|---|---|---|---|---|---|
  | expander | 3 | 1 | 2 | 1 | 1 | 3 |
  | cautiousMiner | 3 | 2 | 1 | 2 | 1 | 1 |
  | financier | 1 | 1 | 1 | 1 | 3 | 2 |
  | pirateLinked | 2 | 1 | 3 | 1 | 1 | 2 |
  | stateBacked | 2 | 2 | 2 | 3 | 1 | 1 |

  Ties go to the lower node id.
- A rival buys a licence when the node's estimated monthly gain exceeds 1.5 times its royalty and it can pay the upfront fee from cash above its 3-day wage reserve.
- A rival builds a research lab once it has two working sections, and a patent lab after F1.

## 3. People

### 3.1 Skills and levels

- Six skills: miner, technician, engineer, scientist, pilot, crew.
- Daily wages: scientist LM 220, pilot LM 160, crew LM 110. The other three keep their M1 wages.
- Skill levels run 1–5. A worker adds `+10%` productivity for each level above 1. A building's workforce productivity uses the mean level of its present crew.
- Migrants keep arriving at level 1 in the least filled skill with job slots. Crew has no job slots, so crew comes only from retraining.

### 3.2 Clinic and recreation

- **Clinic** (build plot): LM 10,000, 25 t prefab structures, 1 t machinery. 4 game hours. 2 technicians per shift. Draws 120 kW. Serves 120 residents of its section, times `levelOutput(level)`, staffing and the `coverage` modifier.
- **Recreation centre** (build plot): LM 8,000, 30 t prefab structures, 10 t glass. 4 game hours. 2 technicians per shift. Draws 150 kW. Serves 160 residents on the same terms.
- A section with 60 residents or fewer needs neither.
- Above 60 residents, met = `min(1, served / residents)` for each need. Morale loses `8 × (1 − medical met)` and `6 × (1 − recreation met)` points.
- An unmet medical or recreation need is not an emergency. The companion mentions it once a game day at most.

### 3.3 Training centre

- **Training centre** (build plot): LM 15,000, 30 t prefab structures, 2 t machinery. 6 game hours. 2 technicians and 1 engineer per shift. Draws 150 kW. Holds `floor(6 × levelOutput(level))` trainees.
- Two courses:
  - **Raise a level:** level L to L+1, up to 5. Costs `LM 1,000 × L`. Takes `L` game days.
  - **Retrain:** to another skill. Costs LM 2,500. Takes 2 game days. The level becomes `max(1, L − 1)`.
- The `training` modifier scales cost and time.
- The fee is paid when the course starts. A trainee leaves its job, keeps its home, draws its wage and does not commute. Trainees wait in a queue when the centre is full.
- The People tab: filters for the new skills, a Train action on a worker or a selection, a bulk "retrain N of skill A to skill B", and the training queue.
- Rivals raise the level of their lowest-level scientists when they have cash above their reserve. Migration fills their other skills.

### 3.4 Arcology

Unlocked by S5. LM 60,000, 250 t prefab structures, 60 t glass, 40 t steel. 14 game hours. Draws 500 kW. Houses 320 at quality 30.

## 4. Haulers

### 4.1 Haul roads

- A haul road joins the hubs of two adjacent sections that one company owns.
- It follows the great circle between the hubs. It costs LM 300 and 1 t of sintered concrete per unit of length, and takes 1 game hour per 5 units to build.
- It shows as a road ribbon on the map.
- When either section changes owner, the road stays. Only a company that owns both ends can use it.

### 4.2 Hauler rovers and drones

- A rover garage keeps up to `2 + (level − 1)` haulers, on top of its buses.
- **Hauler rover:** LM 4,000 and 2 t of machinery. Carries 20 t. Moves at bus speed on haul roads.
- **Hauler drone** (unlocked by L5): LM 9,000, 1 t of machinery and 1 t of electronics. Carries 3 t. Moves at 4 times bus speed on a great-circle arc. Needs no road. Draws 30 kW in its garage's section.
- Each hauler needs 1 pilot on shift. A garage gains one pilot job slot per shift for each hauler it keeps. A hauler without a pilot on shift waits.
- `haulers` scales capacity. `speed` scales speed.

### 4.3 Routes

- A route names a good, a source section, a target section and a rule:
  - "keep N t at the target", or
  - "move everything above N t at the source".
- The player assigns haulers to a route. A hauler loads at the source, travels, unloads into the target depot and returns. Each leg is a trip, like a bus trip, so it moves on screen.
- The target depot takes the load even above its storage cap. Goods never vanish.
- A route without a usable road, for a rover, or a hauler without a pilot, shows a reason in the route list.
- **Rivals:** a rival that owns two adjacent sections builds a haul road and one or two hauler rovers. It routes raw goods from a section that extracts them to a section whose processor takes them. After L5 it may buy drones instead.

## 5. Road and belt editing

### 5.1 Roads

- In a section's context panel, "Edit roads" starts the road tool.
- Click a start and an end. The game routes a road on the section's grid and shows the cost: LM 75 per grid cell. Confirm to build.
- Click a road segment to remove it. Right-click leaves the tool. The game refuses if a building would lose its road link to the hub.
- Buses and walkers use the edited network. Route caches clear for that section.

### 5.2 Belts

- **Re-route:** select a building, then "Re-route belt". Click up to 4 waypoints inside the section. The belt passes them in order. Transit time follows the new length. Goods already on the belt keep their arrival time.
- **Direct belt:** select a building, then "Belt to…", then a target building in the same section. Each game minute, the goods the source makes that the target's recipe takes go straight to the target's input lane, up to the belt's capacity. The rest goes to the depot as before. Costs LM 2,000 and 1 t of steel per 5 units of length.
- A direct belt can be removed. Its goods go to the depot. A depot belt can be re-routed but not removed.
- Saves keep waypoints and direct belts. The belt lines themselves are still rebuilt on load (the C19 rule).

## 6. Presentation

- **Research tab:** key `R`.
  - The six branches as columns.
  - A node card shows its name, effect, cost, prerequisites and state: done, active, queued, available, locked, patented by a company, licensed or open.
  - Actions on a card: research now, queue, licence (with the price), and the repeatable level.
  - The header shows RP a game hour, the active node's progress, patents held, licences paid and licence income.
- **Build tab:** the new buildings. The rover garage panel buys haulers. A "Haulage" section lists routes and edits them.
- **Map:** haul roads, hauler rovers on roads and drones on arcs, all on eased curves (the motion pillar). The section panel has the road and belt tools.
- **Story:** news items for patents and licences; Ox lines for the first lab, the first patent won, a patent lost to a rival, and the first haul route; Codex entries for research, patents, licences, each new building, haulers, skills and training, in the plain reference voice.

## 7. Saves, performance and tests

- `SAVE_VERSION` goes to 4. The migration adds empty research, patents, licences, haulers, routes, haul roads, training queues, belt waypoints and direct belts. Workers keep their skills and levels.
- Performance: on the rival bench, the median fine tick and the slowest tick of a day stay within 10% of the M2a figures. Research runs once a game hour.
- **Balance bot, first 60 game days on seed 42:**
  - equity 3–5 times founding value (unchanged);
  - 6–10 nodes done;
  - at least 1 patent won;
  - the rivals hold at least 2 patents between them;
  - at least one haul route delivered goods;
  - no strike caused by unmet clinic or recreation needs.
- **End-to-end:** research and queue a node; win a patent race against a rival; buy a licence; train a worker; build a haul road and run a route; edit a road; re-route a belt and add a direct belt. Both desktop viewports (1920×1080 and 1280×720).

## 8. M2a deferred minors

The first task of the plan clears the ten minors the M2a final review deferred:

1. The "Overdue" balance-sheet row never shows: `balanceSheet.loans` already includes overdue debt.
2. "Your minimum bid" shows while the player leads, and a bid then fails.
3. The news ticker restarts its crawl on every new item, so older items seldom show.
4. C19 changed the save format without bumping `SAVE_VERSION`. Version 4 (section 7) settles it.
5. `issuedThisMonth` counts the full issue even when the market order only part-fills.
6. `ch1.expansion` ignores land bought at the M1 land office (`landCents` 0 after `openBooks`).
7. Offered tenders keep a stale `tenderTo` after their section changes owner.
8. An orphaned doc comment at `src/data/companies.ts:18`.
9. Test gaps: the v2 migration test checks only `cash > 0`; no proxy bids during a catch-up; workers removed by an unsold seizure are not in "departures".
10. Codex bodies carry numbers (LM 2,000, 2.7% at A) that can drift from data; `codexFacts` could show them.

## 9. Out of scope

- Groups, subsidiaries and shared group research (M3).
- Jobs for crew, ships and voyages (M4).
- Consumer goods as a recreation input.
- Haulers between bodies (M3 freight).
