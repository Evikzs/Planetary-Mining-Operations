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
  'mech.auctions': {
    title: 'Auctions',
    category: 'mechanics',
    body: 'Sections change hands at auction. Any company can open a lot on an unowned section for LM 2,000; the Lunar Authority opens one every 12 game hours. Bids start at the LM 30,000 reserve and count for their amount times a reputation bonus. A lot runs 3 game hours; a late bid adds 30 game minutes, up to 10 game hours. A proxy bids the minimum for you up to your ceiling, even while you are away.',
  },
  'mech.rivals': {
    title: 'Rivals',
    category: 'mechanics',
    body: 'Five rival companies share the Moon. Each mines, refines, trades, takes contracts, bids at auction, borrows and lists its shares, and each has its own temper: some dig carefully, some borrow hard. A rival that cannot pay its debts goes bankrupt. Its sections go to auction, and a new company takes its place two days later.',
  },
  'mech.loans': {
    title: 'Loans',
    category: 'mechanics',
    body: 'Lenders offer loans of 3, 6 or 12 months at a monthly rate set by your credit rating. Interest is charged every hour, and the principal is due at the end. The credit line lets you draw and repay cash at any time, up to a limit set by your rating and equity. Loans and credit together stay within a share of your equity. At rating D, nobody lends.',
  },
  'mech.statements': {
    title: 'Financial statements',
    category: 'mechanics',
    body: 'The Finance tab keeps three statements. The income statement shows what you earned and spent this month. The balance sheet shows what you own, what you owe, and the difference: equity. The cash flow statement shows where cash came from and where it went. Choose a closed month to see its final figures.',
  },
  'mech.monthlyClose': {
    title: 'Monthly close',
    category: 'mechanics',
    body: "At the end of each game month the books close. The month's profit moves into retained earnings, buildings lose a 24th of their cost to depreciation, dividends are paid at the share you set, and lenders review your credit rating. Each closed month stays on record as a set of statements.",
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
  'concept.balanceSheet': {
    title: 'Balance sheet',
    category: 'concepts',
    body: "What a company owns and what it owes. Assets are cash, stock, buildings, land and shares in others. Liabilities are loans and credit. Assets minus liabilities is equity, the owners' stake. The two sides always balance, because every Mark the company holds came from a lender or an owner.",
    realWorld:
      'Every listed company publishes one each quarter. Analysts compare debt with equity to judge how much risk a company carries.',
  },
  'concept.incomeStatement': {
    title: 'Income statement',
    category: 'concepts',
    body: 'Revenue minus expenses over a period. Sales and contract payments come in; the cost of goods sold, wages, materials, interest, depreciation and fees go out. What remains is net income: a profit or a loss.',
    realWorld:
      'Also called the profit and loss account. It counts a sale when it is made, not when the cash arrives, so a profitable company can still run out of money.',
  },
  'concept.cashFlow': {
    title: 'Cash flow',
    category: 'concepts',
    body: 'Where cash came from and where it went, in three parts. Operating: selling goods and paying wages. Investing: buildings, land and shares. Financing: loans, share issues and dividends. Profit and cash differ: a new smelter is cash out today, but an expense spread over two years.',
    realWorld:
      'Lenders read the cash flow statement first. A company that reports profits but burns cash is a classic warning sign, and many bankruptcies start that way.',
  },
  'concept.creditRating': {
    title: 'Credit rating',
    category: 'concepts',
    body: 'Lenders grade every company from AAA, the safest, down to D, in default. The grade weighs debt against equity, how easily profit covers interest, operating cash flow and the share price. Lenders review it at each monthly close. A better rating means cheaper loans and a bigger credit line.',
    realWorld:
      "Agencies such as S&P and Moody's rate governments and companies on the same letter scale. A cut below BBB, the edge of investment grade, forces many funds to sell.",
  },
  'concept.interest': {
    title: 'Interest',
    category: 'concepts',
    body: "The price of borrowed money, charged as a share of what you owe. Here it is quoted per month and charged every hour. The rate is the Lunar Authority's base rate plus a spread for your credit rating: 2.7% a month at A, 5.5% at B.",
    realWorld:
      'Central banks set a base rate, and banks add a margin for risk. Small rates compound: 2% a month is about 27% a year.',
  },
  'concept.shares': {
    title: 'Shares',
    category: 'concepts',
    body: 'A listed company is split into shares; each starts with 100,000. Their price moves every hour as investors and companies trade, pulled toward a fair value built from book value and recent earnings. Buy shares in a rival and you own part of it. A holder of 20% or more must say so in public.',
    realWorld:
      'Shares trade on exchanges such as the New York Stock Exchange. Over long periods prices follow earnings; in the short run, mood and news move them far more.',
  },
  'concept.dividends': {
    title: 'Dividends',
    category: 'concepts',
    body: "Cash a company pays its owners out of profit. You choose the share of each month's net income to pay: none, 10%, 25% or 50%. Dividends please investors and lift the share price a little, but cash paid out cannot build a smelter.",
    realWorld:
      'Mature companies pay steady dividends; young ones keep their profit to grow. A cut dividend reads as bad news and often sinks the price.',
  },
  'concept.dilution': {
    title: 'Dilution',
    category: 'concepts',
    body: 'Issuing new shares raises cash without debt, but every existing share now owns a smaller slice of the company. You can issue at most 20% more shares each month. New shares sell at market, so an issue at a low price gives away more of the company.',
    realWorld:
      'Start-ups dilute their founders in every funding round. Investors accept it when the cash raised grows the company faster than their slice shrinks.',
  },
  'concept.buyback': {
    title: 'Buyback',
    category: 'concepts',
    body: 'A company buys its own shares on the market and holds them in treasury. Fewer shares stay in other hands, so each one owns more of the company and its profit. It returns cash to owners without a dividend.',
    realWorld:
      'Large firms such as Apple spend tens of billions a year on buybacks. Critics say the cash would do more as investment.',
  },
  'concept.priceEarnings': {
    title: 'Price to earnings',
    category: 'concepts',
    body: "The share price divided by a year's earnings per share. A P/E of 10 means buyers pay ten Marks for each Mark of yearly profit. A high P/E means investors expect growth, or hope too much; a low one means doubt, or a bargain. With a loss, there is no P/E.",
    realWorld:
      'Stock markets have averaged a P/E of about 15 over the last century. Fast-growing technology firms often trade at 30 or more.',
  },
  'concept.englishAuction': {
    title: 'English auction',
    category: 'concepts',
    body: 'An open auction where the price climbs. Each bid must beat the leader by a step, everyone sees the leading bid, and the best bid when time runs out wins. Here a bid counts for its amount times a reputation bonus, and a late bid adds time, so nobody wins by sniping.',
    realWorld:
      "Christie's and Sotheby's sell art this way. Governments use rising-price auctions to sell radio spectrum and oil leases.",
  },
  'concept.proxyBid': {
    title: 'Proxy bid',
    category: 'concepts',
    body: 'A ceiling you set in advance. The auction bids for you, one step at a time, only when someone else leads, and never above your ceiling. You pay one step over the next best bid, not your ceiling. It keeps bidding while you are away.',
    realWorld:
      'eBay works this way: you enter the most you will pay, and the site bids for you. Economists call it a second-price auction in disguise.',
  },
  'concept.default': {
    title: 'Default',
    category: 'concepts',
    body: 'Failing to pay a debt when it is due. Your rating falls to D, nobody lends to you, and lenders sell your stock until what is overdue is paid. Stay in default a full game day and they seize assets. After the debt is cleared, the D stays for three monthly closes.',
    realWorld:
      'Countries default too: Argentina has done it nine times. Lenders charge a defaulter higher rates for years afterwards.',
  },
  'concept.bankruptcy': {
    title: 'Bankruptcy',
    category: 'concepts',
    body: 'When a company cannot pay and its assets are seized, it is finished. Its sections and buildings go to auction, its remaining debts are written off, and its shares become worthless. Lenders take the losses. On the Moon, a new rival is founded two days later.',
    realWorld:
      'Courts decide who gets what is left: lenders first, owners last. Shareholders usually get nothing, as at Lehman Brothers in 2008.',
  },
};
