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
    "We've outgrown one section, boss. Land here goes at auction, and five rival outfits want the same rock we do.",
    'Open a lot on the section next door, or wait for the Authority to put one up. The fee is two thousand Marks. Bids start at thirty thousand.',
    'Set a ceiling and our broker bids for us, a step at a time, up to that number. Pick the number before the fever picks it for you.',
    'Rivals bid with the cash they have. Early on that is plenty. Lose one, and there is always another lot. Win the one with the deposits we lack.',
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
  'ev.rivalsIntro': [
    'Company on the wire, boss. One of the rival outfits just put a section up for auction. They want more ground, same as us.',
    'Five of them share the Moon with us. Some dig careful, some borrow hard, some buy whatever moves. All of them bid.',
    'Anyone can bid on their lot, us included. Look at the deposits before you look at the price.',
  ],
  'ev.firstClose': [
    "Month's closed, boss. The bookkeepers tallied every Mark that came in and went out. It's all in Finance now.",
    "Three sheets. What we earned, what we own against what we owe, and where the cash went. They don't always agree.",
    "Profit on paper doesn't pay wages. Cash does. Read the cash sheet first, then the rest.",
  ],
  'ev.ratingCut': [
    'The lenders cut our rating. Borrowing costs more from today, and the credit line got shorter.',
    'They watch debt against equity, whether profit covers the interest, and whether cash comes in from the work. Fix those and the grade climbs back.',
  ],
  'ev.rivalStake': [
    'Heads up, boss. A rival now holds a fifth of our shares or more. The rules made them say so in public.',
    'An owner that size has plans for us. Maybe it wants a bigger slice. Maybe it sells all at once and sinks the price.',
    'If the cash allows, we can buy shares back and make their slice smaller.',
  ],
  'ev.auctionLost': [
    'Lost that lot. A rival outbid us at the close. It happens.',
    'Bids count for cash times reputation. Raise one or the other, or set a higher ceiling next time, if the ground is worth it.',
    "Don't chase it. The Authority puts up another section every twelve hours.",
  ],
  'ev.playerDefault': [
    "We missed a payment, boss. That's a default. Our rating is D now, and nobody lends us a Mark.",
    "The lenders are selling our stock until what's overdue is paid. Raise cash fast. Sell ore, sell steel, cut what isn't earning.",
    'Stay in default a full day and they start seizing assets. Pay it off, and the D still sticks for three months. Lenders remember.',
  ],
  'ev.rivalBankrupt': [
    "One of the rivals went under. Couldn't pay its debts. Its sections go to auction, and its shares are worth nothing now.",
    "Cheap ground, boss, and a new outfit takes its place in a couple of days. Bid on what fits our rock, not on what's cheap.",
  ],
};
