export type BeatId =
  | 'ch1.founding'
  | 'ch1.camera'
  | 'ch1.firstMine'
  | 'ch1.belts'
  | 'ch1.shiftChange'
  | 'ch1.firstSale'
  | 'ch1.lifeSupport'
  | 'ch1.firstContract'
  | 'ch1.power'
  | 'ch1.firstRefinery'
  | 'ch1.expansion'
  | 'ch1.end'
  | 'ev.brownout'
  | 'ev.shortageAir'
  | 'ev.shortageWater'
  | 'ev.shortageFood'
  | 'ev.strike'
  | 'ev.emigration'
  | 'ev.contractFailed'
  | 'ev.priceCrash';

export type HintCategory = 'tutorial' | 'economy' | 'alerts';

export interface BeatDef {
  category: HintCategory;
  /** True when the player closes the beat; false when the beat waits for something to happen. */
  ack: boolean;
  /** Codex entries it opens: when it starts if it explains, when it ends if it sets a task. */
  codex: string[];
}

/** Chapter 1 in order. ch1.power stands outside the order: the first brownout calls it at once. */
export const TUTORIAL: BeatId[] = [
  'ch1.founding',
  'ch1.camera',
  'ch1.firstMine',
  'ch1.belts',
  'ch1.shiftChange',
  'ch1.firstSale',
  'ch1.lifeSupport',
  'ch1.firstContract',
  'ch1.firstRefinery',
  'ch1.expansion',
  'ch1.end',
];

const alert: BeatDef = { category: 'alerts', ack: true, codex: [] };

export const BEATS: Record<BeatId, BeatDef> = {
  'ch1.founding': { category: 'tutorial', ack: true, codex: ['mech.sections', 'mech.plots'] },
  'ch1.camera': { category: 'tutorial', ack: false, codex: ['mech.camera'] },
  'ch1.firstMine': { category: 'tutorial', ack: false, codex: ['building.mine'] },
  'ch1.belts': { category: 'tutorial', ack: true, codex: ['mech.belts', 'mech.storage'] },
  'ch1.shiftChange': { category: 'tutorial', ack: true, codex: ['mech.shifts', 'mech.commute'] },
  'ch1.firstSale': {
    category: 'tutorial',
    ack: false,
    codex: ['concept.orderBook', 'concept.priceImpact'],
  },
  'ch1.lifeSupport': {
    category: 'tutorial',
    ack: true,
    codex: ['mech.needs', 'mech.morale', 'concept.elasticity'],
  },
  'ch1.firstContract': { category: 'tutorial', ack: false, codex: ['mech.reputation'] },
  'ch1.power': { category: 'tutorial', ack: true, codex: ['mech.power'] },
  'ch1.firstRefinery': { category: 'tutorial', ack: false, codex: ['concept.valueAdded'] },
  'ch1.expansion': { category: 'tutorial', ack: false, codex: ['mech.landOffice'] },
  'ch1.end': { category: 'tutorial', ack: true, codex: ['mech.offline'] },
  'ev.brownout': alert,
  'ev.shortageAir': alert,
  'ev.shortageWater': alert,
  'ev.shortageFood': alert,
  'ev.strike': alert,
  'ev.emigration': alert,
  'ev.contractFailed': alert,
  'ev.priceCrash': { category: 'economy', ack: true, codex: ['concept.meanReversion'] },
};

export const BEAT_IDS = Object.keys(BEATS) as BeatId[];
