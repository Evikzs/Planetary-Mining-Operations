import type { BeatId } from '../../sim/story/beats';

/**
 * Oskar "Ox" Varga: thirty years a Belt miner, now operations chief. Dry, blunt, warm under it.
 * Calls the player "boss". Short sentences. Ties every lesson to rock and hard work.
 */
export const VETERAN_LINES: Record<BeatId, string[]> = {
  'ch1.founding': [
    "Name's Ox Varga. Thirty years cutting rock in the Belt, and now I run your operations. Welcome to the Moon, boss.",
    'This is the founding charter: one section near the south pole. Ice in the shadows, iron in the dirt, and a lot of nothing in between.',
    'We have thirty-three people, a depot on the hub, two solar arrays and a garage of buses. That is the whole company. Let us make it more.',
  ],
  'ch1.camera': [
    'First rule of mining: know your ground. Have a look around the claim before we spend a single Mark.',
    "Pan across the section, then pull in close over the hub. I'll wait. The rock isn't going anywhere.",
  ],
  'ch1.firstMine': [
    'Every marked deposit is money in the ground. Ilmenite for iron, ice for water and air, regolith for just about everything else.',
    'Put a rig on a deposit, boss. A mine on ilmenite pays best to start. An ice drill keeps us breathing. Your call.',
    'Building takes cash and prefab from the depot. We started with enough for a few. Spend it on things that dig.',
  ],
  'ch1.belts': [
    'There she goes. Every rig with a belt sends its haul straight to the depot. Watch the crates ride in.',
    'The depot holds three thousand tonnes. When it fills, the belts back up and the rigs stop. A jammed belt is money standing still.',
    'Sell what we do not need, or put up a warehouse. Never let a belt jam on payday.',
  ],
  'ch1.shiftChange': [
    'Shift change. Three a day: six in the morning, two in the afternoon, ten at night. The buses roll forty minutes before each one.',
    'Everybody rides from home to the job. Long rides make tired, slow crews. Build homes close to the work.',
    'No garage, no buses. No buses, no crew. Keep that garage running, boss.',
  ],
  'ch1.firstSale': [
    'Time to turn rock into Marks. The Lunar market clears once an hour, and everybody gets the same price.',
    "Put up a sell order for some of our ore. A market order takes the hour's price. A limit order waits for yours.",
    'Dump too much at once and you push the price into the dirt. The colony only eats so much ilmenite.',
  ],
  'ch1.lifeSupport': [
    'Listen close, because this one kills people. Every soul here burns oxygen, water and food every day, straight out of the depot.',
    'Run short and morale drops like a loose drill bit. Stay short and they strike. Stay shorter and they leave.',
    'Keep a few days of each in stock. Electrolysis makes air, a water plant makes water. Food we buy or we grow.',
  ],
  'ch1.firstContract': [
    'The colonies post work on the contract board. Ore runs, mostly. Now and then they want something built.',
    'Pick one we can fill, take it, and deliver before the deadline. Do it right and the board gets bigger.',
    "Miss it and folks remember. Reputation is the only ore you can't dig up again once it's spilled.",
  ],
  'ch1.power': [
    'Lights are flickering, boss. We draw more power than the arrays give, so everything runs slow by the same share.',
    'Each array gives four hundred kilowatts with its tech on shift. Build another one, or shut something hungry down.',
  ],
  'ch1.firstRefinery': [
    'Raw rock is cheap. Steel is not. A smelter turns four tonnes of ilmenite into a tonne and a half of steel every hour.',
    'Feed it by belt from the depot, then sell the steel or build with it. Same rock, more than twice the money.',
  ],
  'ch1.expansion': [
    'We have outgrown one section. The Lunar Authority land office sells the sections next door at a listed price.',
    'Each one costs more than the last. Buy the one with the deposits we lack, and put a garage on it early.',
  ],
  'ch1.end': [
    "That's the job, boss. Dig, haul, refine, sell, and keep the crew breathing. The rest is doing it bigger.",
    'When you step away, the outfit keeps working at half pace for up to eight hours. Past that, it waits for you.',
    "I'll be around. Anything you need to know is in the Codex. I've seen most of it go wrong at least once.",
  ],
  'ev.brownout': [
    'Brownout again. Demand is over supply and every rig is crawling.',
    'Build arrays or cut the load. And check that the array techs are actually on shift.',
  ],
  'ev.shortageAir': [
    'Oxygen is running low in one of our sections. Under three days left at this rate.',
    'Get oxygen into that depot. Make it or buy it. Nobody works well holding their breath.',
  ],
  'ev.shortageWater': [
    'Water is running short. Under three days left.',
    'A water plant runs on polar ice. Or buy water, but buy it today.',
  ],
  'ev.shortageFood': [
    'Food stores are down to the last few days.',
    'Hungry crews turn into angry crews. Buy produce now, then think about a hydroponics farm.',
  ],
  'ev.strike': [
    'They have walked out at one of our sites. Morale sat under the line for six hours straight.',
    'Fix what is wrong: air, water, food, power, pay or the ride to work. They come back when they feel it.',
  ],
  'ev.emigration': [
    'We lost people today. Folks that unhappy pack a bag and catch the next shuttle.',
    'Every one we lose is a hire we make again. Look after the ones still here.',
  ],
  'ev.contractFailed': [
    'We missed a deadline. The client is not happy, and the whole board knows it.',
    'Take fewer jobs and finish them. A short list done right beats a long one done late.',
  ],
  'ev.priceCrash': [
    'A price just fell through the floor. Down more than thirty percent in a day.',
    'Prices drift back given time. If we can hold the stock, we wait. If we cannot, we sell slow.',
  ],
};
