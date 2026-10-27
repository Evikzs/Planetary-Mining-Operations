import type { BeatId } from '../../sim/story/beats';

/** Neutral one-line summaries, used wherever a companion has no line. */
export const NARRATOR_LINES: Record<BeatId, string[]> = {
  'ch1.founding': [
    'Your company holds a founding charter for one section near the lunar south pole.',
  ],
  'ch1.camera': ['Pan across the section and zoom in to look around.'],
  'ch1.firstMine': ['Build a mine, ice drill or regolith scoop on a deposit.'],
  'ch1.belts': ['Belts carry output to the section depot. A full depot stops the belts.'],
  'ch1.shiftChange': [
    'Workers ride buses to work 40 minutes before each shift: 06:00, 14:00 and 22:00.',
  ],
  'ch1.firstSale': ['Place a sell order. The market clears once per hour at one price.'],
  'ch1.lifeSupport': ['Residents use oxygen, water and food from the depot every day.'],
  'ch1.firstContract': ['Accept a contract from the board and complete it before its deadline.'],
  'ch1.power': ['Power demand exceeds supply. Every building slows down by the same share.'],
  'ch1.firstRefinery': ['A smelter refines ilmenite into steel, which is worth more.'],
  'ch1.expansion': ['Buy a neighbouring section from the land office.'],
  'ch1.end': [
    'Chapter 1 is complete. While you are away, the company works at half pace for up to 8 hours.',
  ],
  'ev.brownout': ['Brownout: power demand exceeds supply.'],
  'ev.shortageAir': ['Oxygen will run out in under 3 days in one section.'],
  'ev.shortageWater': ['Water will run out in under 3 days in one section.'],
  'ev.shortageFood': ['Food will run out in under 3 days in one section.'],
  'ev.strike': ['Workers at one site are on strike.'],
  'ev.emigration': ['Unhappy workers have left the company.'],
  'ev.contractFailed': ['A contract deadline passed. Reputation fell.'],
  'ev.priceCrash': ['A price fell more than 30% in 24 hours.'],
};
