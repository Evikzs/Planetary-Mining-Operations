import { BUILDINGS, type BuildingTypeId } from './buildings';
import { GOODS, type GoodId } from './goods';

export type CodexCategory = 'goods' | 'buildings' | 'contracts' | 'mechanics' | 'concepts';

export interface CodexEntry {
  title: string;
  category: CodexCategory;
  /** At most 80 words. */
  body: string;
  /** Concepts only: how the idea works on Earth, at most 60 words. */
  realWorld?: string;
}

const GOOD_TEXT: Record<GoodId, string> = {
  regolith:
    'Loose lunar soil, found in every section. It is cheap and plentiful. A smelter sinters it into concrete for building.',
  ilmenite:
    'An iron and titanium oxide from the dark lunar plains. Mines dig it. Smelters turn it into steel or titanium alloy, and air plants take oxygen from it.',
  anorthite:
    'A light, aluminium-rich rock from the bright highlands. Mines dig it. Smelters make aluminium and glass from it.',
  helium3:
    'A rare isotope left in the surface by the solar wind. Harvesters sift the plains for a few kilograms a day. Fusion programmes pay a fortune for every tonne.',
  kreep:
    'Rock rich in potassium, rare-earth elements and phosphorus, found in a few regions. Mines dig it at half speed. Chemical refineries make rare-earth oxides and fertiliser from it.',
  polarVolatiles:
    'Ice and frozen gases from craters near the poles that never see the Sun. Ice drills mine them. They become water, oxygen, hydrogen and fertiliser.',
  steel: 'Iron alloy smelted from ilmenite. Every structure and machine needs it.',
  titaniumAlloy: 'A light, strong metal smelted from ilmenite. Expensive and slow to make.',
  aluminium: 'A light metal smelted from anorthite. Solar panels and structures use it.',
  sinteredConcrete: 'Regolith baked into blocks. The cheapest building material on the Moon.',
  glass: 'Melted anorthite. Used for domes, greenhouses, solar panels and silicon wafers.',
  siliconWafers:
    'Thin discs refined from glass in a wafer fab. The core of solar panels and electronics.',
  rareEarthOxides: 'Refined from KREEP. Magnets, motors and electronics need them.',
  oxygen:
    'Made from polar ice by electrolysis, or taken from ilmenite. Every resident breathes 0.84 kg a day from the section depot.',
  potableWater: 'Clean water from melted polar ice. Every resident uses 3 kg a day.',
  hydrogen: 'A by-product of electrolysis. Rocket fuel and a chemical feedstock.',
  fertiliser: 'Made from KREEP and polar volatiles. Hydroponics farms need it to grow food.',
  hydroponicProduce: 'Food grown in water under lights. Every resident eats 1.8 kg a day.',
  electronics:
    'Circuits and control systems. The Moon cannot make them yet, so they come from the market. Machinery and advanced buildings need them.',
  machinery:
    'Motors, pumps and drives assembled from steel and electronics. Most buildings need some.',
  prefabStructures:
    'Wall and frame modules assembled from concrete and steel. The main building material.',
  solarPanels:
    'Assembled from silicon wafers, aluminium and glass. Solar arrays are built from them.',
};

type Buildable = Exclude<BuildingTypeId, 'depot' | 'contractSite'>;

const BUILDING_TEXT: Record<Buildable, string> = {
  regolithScoop:
    'A tracked scoop that skims regolith from a deposit. Cheap and simple: 12 t an hour at level 1 with three miners per shift.',
  mine: 'Digs ilmenite, anorthite or KREEP from a deposit and sends it to the depot by belt. 6 t an hour at level 1, half that on KREEP.',
  iceDrill: 'Drills polar volatiles from shadowed ground near the poles. 5 t an hour at level 1.',
  he3Harvester:
    'A wide crawler that sifts helium-3 from the plains. Slow and hungry for power, but each kilogram is worth a lot.',
  smelter:
    'Turns ore into metal or building material: steel, titanium alloy, aluminium, glass or concrete. It runs one recipe at a time.',
  waferFab: 'Refines glass into silicon wafers. It needs engineers and steady power.',
  chemicalRefinery:
    'Turns KREEP into rare-earth oxides, or KREEP and polar volatiles into fertiliser.',
  electrolysisPlant: 'Splits polar volatiles into oxygen and hydrogen. The main way to make air.',
  airPlant: 'Takes oxygen out of ilmenite. Slower than electrolysis, but it needs no ice.',
  waterPlant: 'Melts and cleans polar volatiles into drinking water.',
  hydroponicsFarm:
    'Grows food from water and fertiliser under lights, so a section can feed itself.',
  assemblyWorks: 'Assembles components: solar panels, prefab structures or machinery.',
  solarArray:
    'Makes 400 kW at level 1 while its technician is on shift. Its power serves its own section.',
  crewQuarters: 'Basic housing for 36 people. Low comfort, cheap to build.',
  habitatDome: 'Comfortable housing for 96 people under glass. Better homes mean better morale.',
  warehouse: "Adds 8,000 t to the section's storage, so you can hold goods until prices rise.",
  roverGarage:
    'Keeps 4 buses at level 1, one more for each level. Workers cannot ride to work in a section without one.',
};

const OTHER: Record<string, CodexEntry> = {
  'contract.oreDelivery': {
    title: 'Ore delivery',
    category: 'contracts',
    body: 'Deliver an amount of one raw good before the deadline, in parts if you like, from any depot you own. It pays the market value with a margin, more for a tight deadline. Success adds 3 reputation; failure costs 5.',
  },
  'contract.infrastructure': {
    title: 'Infrastructure',
    category: 'contracts',
    body: 'Build something for a colony on a public plot. Deliver the materials, then engineers build it and technicians staff it. It pays materials and labour with a good margin. Success adds 5 reputation and grows the colony; failure costs 8.',
  },
  'mech.sections': {
    title: 'Sections',
    category: 'mechanics',
    body: 'The Moon is divided into 60 sections. You start with one. Each section has its own depot, power grid, roads and people.',
  },
  'mech.plots': {
    title: 'Plots',
    category: 'mechanics',
    body: 'Each section has a hub with the depot, 12 build plots, 2 public plots for client projects, and ore deposits. Rigs go on deposits; everything else goes on build plots.',
  },
  'mech.camera': {
    title: 'Looking around',
    category: 'mechanics',
    body: 'Drag to pan, pinch or scroll to zoom, and twist with two fingers to rotate. On a keyboard: W, A, S and D pan, Q and E rotate, and N locks north. Zoom far out to see the whole Moon.',
  },
  'mech.belts': {
    title: 'Conveyor belts',
    category: 'mechanics',
    body: 'Rigs and plants with a belt send their output to the depot and take their inputs from it. Crates move at a fixed speed. A full depot jams the belt and stops the building.',
  },
  'mech.storage': {
    title: 'Storage',
    category: 'mechanics',
    body: "A section's depot holds 3,000 t. Each warehouse adds 8,000 t. Goods offered in sell orders leave the depot until the order fills or is cancelled.",
  },
  'mech.shifts': {
    title: 'Shifts and jobs',
    category: 'mechanics',
    body: 'Work runs in three shifts, starting at 06:00, 14:00 and 22:00. Each workplace has job slots on every shift. A building works at the share of its slots filled by workers on site.',
  },
  'mech.commute': {
    title: 'Commuting',
    category: 'mechanics',
    body: 'Buses leave home 40 minutes before each shift and follow the roads. Each bus carries 24 riders and makes up to 4 stops. Commutes over 20 minutes lower output; over 45 minutes they also lower morale.',
  },
  'mech.needs': {
    title: 'Needs',
    category: 'mechanics',
    body: 'Each resident needs 0.84 kg of oxygen, 3 kg of water and 1.8 kg of food a day from the section depot, and power for their home. Every shortfall lowers morale.',
  },
  'mech.morale': {
    title: 'Morale',
    category: 'mechanics',
    body: 'Morale moves toward a target set by housing, needs, power, wages, missed pay and commute. High morale raises output. Below 25 for 6 hours, a crew strikes. Below 15, people start to leave.',
  },
  'mech.reputation': {
    title: 'Reputation',
    category: 'mechanics',
    body: 'Reputation runs from 0 to 100 and starts at 20. Finished contracts raise it; failed or abandoned ones lower it. Higher reputation brings more offers and lets you hold more contracts at once.',
  },
  'mech.power': {
    title: 'Power',
    category: 'mechanics',
    body: "Solar arrays feed each section's grid, and every finished building draws from it. When demand is higher than supply, every building slows by the same share. That is a brownout.",
  },
  'mech.landOffice': {
    title: 'Land office',
    category: 'mechanics',
    body: 'The Lunar Authority sells sections next to the ones you own. The first costs LM 60,000, and each purchase costs 60% more than the one before.',
  },
  'mech.offline': {
    title: 'While you are away',
    category: 'mechanics',
    body: 'When you leave, your company keeps working at half pace for up to 8 hours. When you come back, a summary shows what happened.',
  },
  'concept.orderBook': {
    title: 'Order book',
    category: 'concepts',
    body: 'Buyers and sellers post orders: how much, and at what price. Each hour the market finds the one price where what is offered meets what is wanted, and everyone trades at that price.',
    realWorld:
      'Stock exchanges open each day with a call auction that works the same way: orders collect, then one price clears the most volume.',
  },
  'concept.priceImpact': {
    title: 'Price impact',
    category: 'concepts',
    body: 'A big order moves the price against you. Sell more than the colony wants and the price falls until enough buyers appear. Spread large sales over several hours to keep more of the value.',
    realWorld:
      'Fund managers split big trades into many small ones over days to hide their size. The cost of moving the price, called market impact, can eat much of a profit.',
  },
  'concept.elasticity': {
    title: 'Elasticity',
    category: 'concepts',
    body: 'Elasticity is how much people change what they buy when the price moves. People keep buying air, water and food at almost any price. Luxuries lose buyers fast when prices rise.',
    realWorld:
      'Economists measure it as the percent change in quantity for a one percent change in price. Fuel and medicine barely respond to price; restaurant meals respond a lot.',
  },
  'concept.meanReversion': {
    title: 'Mean reversion',
    category: 'concepts',
    body: 'After a shock, prices tend to drift back toward their usual level. A crash can be a chance to buy and a spike a chance to sell, if you can afford to wait.',
    realWorld:
      'Commodity prices often revert as producers react: high prices bring new supply, low prices close mines. It is a tendency, not a law, and waiting for it can take a long time.',
  },
  'concept.temporalArbitrage': {
    title: 'Storage trading',
    category: 'concepts',
    body: 'Keep goods while they are cheap and sell them when prices recover. A warehouse gives you room to wait. The cost is space and cash tied up in stock.',
    realWorld:
      'Oil traders fill tankers and keep them at sea when next month is priced higher than today. The trade pays when the price gap beats the cost of storage and finance.',
  },
  'concept.valueAdded': {
    title: 'Value added',
    category: 'concepts',
    body: 'Refining and assembly turn cheap inputs into goods worth more. The difference between what the inputs cost and what the output sells for is the value you add.',
    realWorld:
      'Countries that export raw ore earn far less than those that smelt and manufacture it. Most of the price of a finished product comes from the steps after the mine.',
  },
};

export const CODEX: Record<string, CodexEntry> = {
  ...Object.fromEntries(
    (Object.entries(GOOD_TEXT) as [GoodId, string][]).map(([id, body]) => [
      `good.${id}`,
      { title: GOODS[id].name, category: 'goods', body } satisfies CodexEntry,
    ]),
  ),
  ...Object.fromEntries(
    (Object.entries(BUILDING_TEXT) as [Buildable, string][]).map(([id, body]) => [
      `building.${id}`,
      { title: BUILDINGS[id].name, category: 'buildings', body } satisfies CodexEntry,
    ]),
  ),
  ...OTHER,
};
